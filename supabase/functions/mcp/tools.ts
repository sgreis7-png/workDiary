// Read-only tools for the Claude connector.
//
// Every tool: parse args (zod) -> up-front area check -> select NAMED columns via cols() -> scrub.
// The scrub and the area check live in defineTool(), once, so a new tool cannot forget either.
// Why it matters: a result goes to a third-party model and cannot be recalled, and an empty list
// that really means "you may not see this" makes a report silently wrong.
//
// Deno-safe: imports only zod and ./allowlist (Task 5 maps 'zod' to npm:zod in deno.json).
import { z } from 'zod'
import { READ, cols, scrubEntryValues, scrubDeep, type PermArea } from './allowlist'

/** The slice of the supabase-js client the tools use. Builders are loosely typed on purpose:
 *  the fake in tests and the real PostgREST builder share only the chained method names. */
export interface SupabaseLike {
  // deno-lint-ignore no-explicit-any
  from(table: string): any
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export interface ToolCtx { db: SupabaseLike; canView(area: string): Promise<boolean> }

export interface ToolDef {
  name: string
  description: string
  input: z.ZodObject<z.ZodRawShape>
  /** Validates `args`, checks the area, runs, scrubs. Resolves `{ denied }` when the area is off. */
  run(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown>
}

/** Tools fetch limit + 1 rows; the extra row is only a "there was more" signal. A report that
 *  silently under-counts is worse than one that says it was cut. */
export function page<T>(rows: T[], limit: number): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, limit), truncated: rows.length > limit }
}

// ---------- shared argument shapes ----------
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
const UUID = z.string().uuid()
const LIMIT = z.number().int().min(1).max(1000).default(200)
const TEXT = z.string().min(1).max(200)

// ---------- query plumbing ----------
// deno-lint-ignore no-explicit-any
type Builder = PromiseLike<{ data: any; error: { message: string } | null; count?: number | null }>

async function run(b: Builder): Promise<{ data: Record<string, unknown>[]; count: number | null }> {
  const { data, error, count } = await b
  if (error) throw new Error(error.message)
  return { data: (data ?? []) as Record<string, unknown>[], count: count ?? null }
}

/** ilike pattern from user text; % and _ are wildcards, and , ( ) break PostgREST or-filters. */
const like = (t: string) => `%${t.replace(/[%_\\,()*"]/g, ' ').trim()}%`

/** Display names for user ids in one lookup. Unknown ids simply have no name. */
async function namesOf(ctx: ToolCtx, ids: unknown[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => typeof x === 'string'))]
  if (!uniq.length) return new Map()
  const { data } = await run(ctx.db.from('profiles').select(cols('profiles')).in('id', uniq))
  return new Map(data.map((p) => [String(p.id), String(p.name ?? '')]))
}

/** Today in Israel, as YYYY-MM-DD: "overdue" must not flip at 02:00 local because of UTC. */
const todayIL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })

function defineTool<S extends z.ZodRawShape>(o: {
  name: string
  description: string
  /** table whose READ.area gates the tool; omit for none */
  gate?: string
  shape: S
  body(ctx: ToolCtx, a: z.infer<z.ZodObject<S>>): Promise<unknown>
  /** area for tools whose gate is not a table (rpc) */
  area?: PermArea
}): ToolDef {
  const input = z.object(o.shape)
  const area: PermArea | null = o.area ?? (o.gate ? READ[o.gate].area : null)
  return {
    name: o.name,
    description: o.description,
    input: input as unknown as z.ZodObject<z.ZodRawShape>,
    async run(ctx, args) {
      const a = input.parse(args ?? {})
      if (area && !(await ctx.canView(area))) return { denied: area }
      return scrubDeep(await o.body(ctx, a))
    },
  }
}

const DATES = 'Dates are YYYY-MM-DD. '
const LIST = 'Returns { rows, truncated }; truncated is true when more rows exist than limit (default 200, max 1000). '

// ---------- tools ----------

const list_projects = defineTool({
  name: 'list_projects',
  description:
    'List projects. Args: active? (boolean), text? (name contains), limit?. ' + LIST +
    'Each row: id, name, location, active, start_date, end_date, pmo, priority, project_type, budget, manager_names (string[]). ' + DATES,
  shape: { active: z.boolean().optional(), text: TEXT.optional(), limit: LIMIT },
  async body(ctx, a) {
    let q = ctx.db.from('projects').select(cols('projects')).order('name')
    if (a.active !== undefined) q = q.eq('active', a.active)
    if (a.text) q = q.ilike('name', like(a.text))
    const { rows, truncated } = page((await run(q.limit(a.limit + 1))).data, a.limit)
    const ids = rows.map((r) => r.id)
    const { data: asg } = ids.length
      ? await run(ctx.db.from('project_assignments').select(cols('project_assignments')).in('project_id', ids))
      : { data: [] }
    const names = await namesOf(ctx, asg.map((x) => x.user_id))
    return {
      rows: rows.map((r) => ({
        ...r,
        manager_names: asg.filter((x) => x.project_id === r.id && x.is_manager).map((x) => names.get(String(x.user_id))).filter(Boolean),
      })),
      truncated,
    }
  },
})

const get_project = defineTool({
  name: 'get_project',
  description:
    'One project with counts. Args: project_id. Returns { project, counts: { entries, open_issues, open_defects, safety_forms, handovers }, traffic_light_color }. ' +
    'A count or color is null when the caller may not view that area (see denied_areas). ' + DATES,
  shape: { project_id: UUID },
  async body(ctx, a) {
    const { data } = await run(ctx.db.from('projects').select(cols('projects')).eq('id', a.project_id))
    if (!data[0]) return { project: null }
    const denied: string[] = []
    // deno-lint-ignore no-explicit-any
    const count = async (table: string, f: (q: any) => any): Promise<number | null> => {
      const area = READ[table].area
      if (area && !(await ctx.canView(area))) { denied.push(area); return null }
      return (await run(f(ctx.db.from(table).select('id', { count: 'exact', head: true })))).count
    }
    const entries = await count('entries', (q) => q.eq('project_id', a.project_id))
    const open_issues = await count('issues', (q) => q.eq('project_id', a.project_id).is('closed_on', null))
    const safety_forms = await count('safety_forms', (q) => q.eq('project_id', a.project_id))
    const handovers = await count('handover_forms', (q) => q.eq('project_id', a.project_id))
    let open_defects: number | null = null
    if (await ctx.canView('defects')) {
      const { data: coops } = await run(ctx.db.from('coops').select('id').eq('project_id', a.project_id))
      open_defects = coops.length
        ? (await run(ctx.db.from('coop_defects').select('id', { count: 'exact', head: true })
            .in('coop_id', coops.map((c) => c.id)).eq('status', 'open'))).count
        : 0
    } else denied.push('defects')
    let color: unknown = null
    if (await ctx.canView('traffic_light')) {
      const r = await ctx.db.rpc('traffic_light', { p_project: a.project_id })
      if (r.error) throw new Error(r.error.message)
      color = (r.data as { color?: unknown }[] | null)?.[0]?.color ?? null
    } else denied.push('traffic_light')
    return {
      project: data[0],
      counts: { entries, open_issues, open_defects, safety_forms, handovers },
      traffic_light_color: color,
      denied_areas: [...new Set(denied)],
    }
  },
})

const search_diary = defineTool({
  name: 'search_diary',
  description:
    'Daily-diary entries, newest first. Args: project_id?, from?, to? (work_date range), text? (matches text answers), limit?. ' + LIST +
    'Each row: id, project_id, work_date, created_at, last_sent_at, author (name), photos (count), values ({ field label: answer }; unlabelled keys keep the raw key; phone and photo answers are never returned). ' + DATES,
  gate: 'entries',
  shape: { project_id: UUID.optional(), from: DATE.optional(), to: DATE.optional(), text: TEXT.optional(), limit: LIMIT },
  async body(ctx, a) {
    const { data: defs } = await run(ctx.db.from('field_definitions').select(cols('field_definitions')))
    let q = ctx.db.from('entries').select(`${cols('entries')},entry_photos(count)`)
    if (a.project_id) q = q.eq('project_id', a.project_id)
    if (a.from) q = q.gte('work_date', a.from)
    if (a.to) q = q.lte('work_date', a.to)
    if (a.text) {
      // `values` is jsonb, so a text search needs a key per field: OR over the free-text fields.
      const t = like(a.text).replace(/%/g, '*')
      const keys = defs.filter((d) => d.type === 'text' || d.type === 'long_text').map((d) => String(d.key)).filter((k) => /^\w+$/.test(k))
      if (!keys.length) return { rows: [], truncated: false }
      q = q.or(keys.map((k) => `values->>${k}.ilike.${t}`).join(','))
    }
    const { rows, truncated } = page(
      (await run(q.order('work_date', { ascending: false }).limit(a.limit + 1))).data, a.limit)
    const typeByKey: Record<string, string> = {}
    const labelByKey: Record<string, string> = {}
    for (const d of defs) {
      typeByKey[String(d.key)] = String(d.type)
      labelByKey[String(d.key)] = String(d.label_he || d.label_en || d.key)
    }
    const authors = await namesOf(ctx, rows.map((r) => r.created_by))
    return {
      rows: rows.map((r) => {
        // Scrub BEFORE labelling: a phone answer must be dropped by its key/type, not its label.
        const clean = scrubEntryValues((r.values ?? {}) as Record<string, unknown>, typeByKey)
        const values: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(clean)) values[Object.prototype.hasOwnProperty.call(labelByKey, k) ? labelByKey[k] : k] = v
        const photos = (r.entry_photos as { count?: number }[] | undefined)?.[0]?.count ?? 0
        const { entry_photos: _p, created_by, ...rest } = r
        return { ...rest, author: authors.get(String(created_by)) ?? null, photos, values }
      }),
      truncated,
    }
  },
})

const list_issues = defineTool({
  name: 'list_issues',
  description:
    'Issues / unplanned events. Args: project_id?, status? (open|closed), from?, to? (opened_on range), limit?. ' + LIST +
    'Each row: id, project_id, seq, opened_on, description, owner_kind, due_date, blocking, systemic, closed_on, closure_note, created_by (id). Open means closed_on is null. ' + DATES,
  gate: 'issues', // area null: RLS (0067) decides, it also admits deliveries editors and the issue owner
  shape: { project_id: UUID.optional(), status: z.enum(['open', 'closed']).optional(), from: DATE.optional(), to: DATE.optional(), limit: LIMIT },
  async body(ctx, a) {
    let q = ctx.db.from('issues').select(cols('issues'))
    if (a.project_id) q = q.eq('project_id', a.project_id)
    if (a.status === 'open') q = q.is('closed_on', null)
    if (a.status === 'closed') q = q.not('closed_on', 'is', null)
    if (a.from) q = q.gte('opened_on', a.from)
    if (a.to) q = q.lte('opened_on', a.to)
    return page((await run(q.order('opened_on', { ascending: false }).limit(a.limit + 1))).data, a.limit)
  },
})

const list_defects = defineTool({
  name: 'list_defects',
  description:
    'Coop defects (the gate checklists). Args: coop_id?, status? (open|closed), limit?. ' + LIST +
    'Each row: id, coop_id, seq, gate, item_no, description, severity, assignee, due_date, status, closed_on, closure_note, created_at. ' + DATES,
  gate: 'coop_defects',
  shape: { coop_id: UUID.optional(), status: z.enum(['open', 'closed']).optional(), limit: LIMIT },
  async body(ctx, a) {
    let q = ctx.db.from('coop_defects').select(cols('coop_defects'))
    if (a.coop_id) q = q.eq('coop_id', a.coop_id)
    if (a.status) q = q.eq('status', a.status)
    return page((await run(q.order('created_at', { ascending: false }).limit(a.limit + 1))).data, a.limit)
  },
})

const list_safety_forms = defineTool({
  name: 'list_safety_forms',
  description:
    'Safety toolbox forms. Args: project_id?, from?, to? (training_date range), limit?. ' + LIST +
    'Each row: id, project_id, training_date, topics, instructor_name, instructor_qualification, created_at, updated_at. No attendee list or signatures. ' + DATES,
  gate: 'safety_forms',
  shape: { project_id: UUID.optional(), from: DATE.optional(), to: DATE.optional(), limit: LIMIT },
  async body(ctx, a) {
    let q = ctx.db.from('safety_forms').select(cols('safety_forms'))
    if (a.project_id) q = q.eq('project_id', a.project_id)
    if (a.from) q = q.gte('training_date', a.from)
    if (a.to) q = q.lte('training_date', a.to)
    return page((await run(q.order('training_date', { ascending: false }).limit(a.limit + 1))).data, a.limit)
  },
})

const get_schedule = defineTool({
  name: 'get_schedule',
  description:
    'The active Gantt schedule of a project. Args: project_id, limit? (tasks, default 1000). ' +
    'Returns { chart, tasks, links, truncated }. Task: wbs, name, start_ts, finish_ts, base_start_ts, base_finish_ts, pct, milestone, is_summary, critical, overdue (finish before today, pct < 100, not a summary). ' + DATES,
  gate: 'gantt_tasks',
  shape: { project_id: UUID, limit: LIMIT.default(1000) },
  async body(ctx, a) {
    const { data: charts } = await run(ctx.db.from('gantt_charts').select(cols('gantt_charts'))
      .eq('project_id', a.project_id).eq('active', true).order('imported_at', { ascending: false }).limit(1))
    const chart = charts[0]
    if (!chart) return { chart: null, tasks: [], links: [], truncated: false }
    const { rows, truncated } = page((await run(ctx.db.from('gantt_tasks').select(cols('gantt_tasks'))
      .eq('chart_id', chart.id).order('sort_order').limit(a.limit + 1))).data, a.limit)
    const { data: links } = await run(ctx.db.from('gantt_links').select(cols('gantt_links')).eq('chart_id', chart.id))
    const today = todayIL()
    return {
      chart,
      tasks: rows.map((t) => ({
        ...t,
        overdue: !t.is_summary && Number(t.pct ?? 0) < 100 && typeof t.finish_ts === 'string' && t.finish_ts.slice(0, 10) < today,
      })),
      links,
      truncated,
    }
  },
})

const list_deliveries = defineTool({
  name: 'list_deliveries',
  description:
    'Supply deliveries per project. Args: project_id?, status? (not_ordered|ordered|shipped|on_site), limit?. ' + LIST +
    'Each row: id, project_id, item, need_date, status, eta, notes, updated_at. ' + DATES,
  // project_deliveries is area null in the allowlist (RLS decides), but the spec names the
  // deliveries area, so check it up front rather than return a list the app would hide.
  area: 'deliveries',
  shape: { project_id: UUID.optional(), status: z.enum(['not_ordered', 'ordered', 'shipped', 'on_site']).optional(), limit: LIMIT },
  async body(ctx, a) {
    let q = ctx.db.from('project_deliveries').select(cols('project_deliveries'))
    if (a.project_id) q = q.eq('project_id', a.project_id)
    if (a.status) q = q.eq('status', a.status)
    return page((await run(q.order('need_date').limit(a.limit + 1))).data, a.limit)
  },
})

const traffic_light = defineTool({
  name: 'traffic_light',
  description:
    'Traffic-light status per active project (the app function traffic_light). Args: project_id? (omit for all). ' +
    'Returns an array; each item: project_id, name, manager, color (overall), gray_reason, axes { time, supply, client, crew, issues } each with color and reason, due, last_entry_on, action_line. ' + DATES,
  area: 'traffic_light',
  shape: { project_id: UUID.optional() },
  async body(ctx, a) {
    const r = await ctx.db.rpc('traffic_light', a.project_id ? { p_project: a.project_id } : {})
    if (r.error) throw new Error(r.error.message)
    return r.data
  },
})

const list_handovers = defineTool({
  name: 'list_handovers',
  description:
    'Handover forms. Args: project_id?, from?, to? (handover_date range), limit?. ' + LIST +
    'Each row: id, project_id, handover_date, client_name, site_location, project_nature, attendees, systems ([{ label, status: ok|bad|na|null, note }]), notes, receiver_name, receiver_role, signed (boolean), signed_at, extra_fields. No signature image. ' + DATES,
  gate: 'handover_forms',
  shape: { project_id: UUID.optional(), from: DATE.optional(), to: DATE.optional(), limit: LIMIT },
  async body(ctx, a) {
    let q = ctx.db.from('handover_forms').select(cols('handover_forms'))
    if (a.project_id) q = q.eq('project_id', a.project_id)
    if (a.from) q = q.gte('handover_date', a.from)
    if (a.to) q = q.lte('handover_date', a.to)
    const { rows, truncated } = page((await run(q.order('handover_date', { ascending: false }).limit(a.limit + 1))).data, a.limit)
    return {
      rows: rows.map((r) => ({
        ...r,
        // signed_at is set together with the signature (0078), so it answers "signed?" without the image.
        signed: r.signed_at != null,
        systems: ((r.systems ?? []) as { label?: string; status?: string | null; note?: string | null }[]).map((s) => ({
          label: s.label ?? '',
          status: s.status === 'ok' || s.status === 'bad' || s.status === 'na' ? s.status : null,
          note: s.note ?? null,
        })),
      })),
      truncated,
    }
  },
})

const stats = defineTool({
  name: 'stats',
  description:
    'Diary statistics (the app function dashboard_stats, which takes no arguments). Args: none. ' +
    'Returns { total, this_week, this_month, total_photos, unsent, malfunctions_this_month, by_project, latest_by_project, by_worker, by_weather }. ' + DATES,
  area: 'dashboard',
  shape: {},
  async body(ctx) {
    const r = await ctx.db.rpc('dashboard_stats')
    if (r.error) throw new Error(r.error.message)
    return r.data
  },
})

const list_people = defineTool({
  name: 'list_people',
  description: 'People, to resolve "who". Args: limit?. ' + LIST + 'Each row: id, name, role only. ' + DATES,
  shape: { limit: LIMIT },
  async body(ctx, a) {
    return page((await run(ctx.db.from('profiles').select(cols('profiles')).order('name').limit(a.limit + 1))).data, a.limit)
  },
})

export const TOOLS: ToolDef[] = [
  list_projects, get_project, search_diary, list_issues, list_defects, list_safety_forms,
  get_schedule, list_deliveries, traffic_light, list_handovers, stats, list_people,
]
