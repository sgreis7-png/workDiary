// Email one diary entry to distribution lists and/or individual addresses via Resend.
// Sent FROM the logged-in user's own address (when on the verified domain), with a
// professional, branded HTML layout.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
// Fallback sender used only when the user's email is NOT on the verified domain.
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Agrotop Work Diary <onboarding@resend.dev>'
// Set this to your Resend-verified domain (e.g. "agrotop.co.il") to send as each user.
const VERIFIED_DOMAIN = (Deno.env.get('VERIFIED_FROM_DOMAIN') ?? '').toLowerCase()
const LOGO = `${URL}/storage/v1/object/public/brand/logo.png`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user?.email) return json({ error: 'unauthorized' }, 401)

    const { entry_id, list_ids = [], emails = [] } = await req.json()
    if (!entry_id) return json({ error: 'missing_entry' }, 400)
    if (!RESEND_KEY) return json({ error: 'email_not_configured' }, 500)

    const db = createClient(URL, SERVICE)

    const { data: allowed } = await db.rpc('rl_check', { p_actor: user.id, p_action: 'send', p_max: 30, p_window_seconds: 3600 })
    if (allowed === false) return json({ error: 'rate_limited' }, 429)

    const { data: entry, error: eErr } = await db
      .from('entries')
      .select('id, project_id, created_by, work_date, values, entry_photos(storage_path)')
      .eq('id', entry_id).single()
    if (eErr || !entry) return json({ error: 'entry_not_found' }, 404)

    const [{ data: project }, { data: author }, { data: sender }, { data: defs }] = await Promise.all([
      db.from('projects').select('name').eq('id', entry.project_id).single(),
      db.from('profiles').select('name').eq('id', entry.created_by).single(),
      db.from('profiles').select('name').eq('id', user.id).single(),
      db.from('field_definitions').select('*').eq('active', true).order('sort_order'),
    ])

    const recipients = new Set<string>()
    for (const e of emails) if (typeof e === 'string' && e.includes('@')) recipients.add(e.trim())
    if (list_ids.length) {
      const { data: recs } = await db.from('list_recipients').select('email').in('list_id', list_ids)
      for (const r of recs ?? []) if (r.email) recipients.add(r.email)
    }
    if (recipients.size === 0) return json({ error: 'no_recipients' }, 400)

    const paths = (entry.entry_photos ?? []).map((p: { storage_path: string }) => p.storage_path)
    let photoUrls: string[] = []
    if (paths.length) {
      const { data: signed } = await db.storage.from('photos').createSignedUrls(paths, 60 * 60 * 24 * 7)
      photoUrls = (signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[]
    }

    const senderName = sender?.name ?? user.email.split('@')[0]
    const html = renderHtml({
      projectName: project?.name ?? '—',
      authorName: author?.name ?? '—',
      workDate: entry.work_date ?? '',
      values: entry.values ?? {},
      defs: defs ?? [],
      photoUrls, senderName,
    })
    const subject = `יומן עבודה · ${project?.name ?? ''} · ${entry.work_date ?? ''}`

    // Send as the user when their email is on the verified domain; else fall back.
    const onVerified = VERIFIED_DOMAIN && user.email.toLowerCase().endsWith('@' + VERIFIED_DOMAIN)
    const from = onVerified ? `${senderName} <${user.email}>` : RESEND_FROM

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [...recipients], reply_to: user.email, subject, html }),
    })
    if (!res.ok) return json({ error: `resend_failed: ${await res.text()}` }, 502)

    await db.from('entries').update({ last_sent_at: new Date().toISOString() }).eq('id', entry_id)
    return json({ ok: true, sent_to: recipients.size, from })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

interface FieldDef { key: string; label_he: string; type: string }
function esc(s: string) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

function renderHtml(o: {
  projectName: string; authorName: string; workDate: string; senderName: string
  values: Record<string, string>; defs: FieldDef[]; photoUrls: string[]
}): string {
  const I = '#14181b', MUT = '#6c747a', LINE = '#e4e8e1', GREEN = '#3aaa35', BG = '#f4f1ea'

  // Intentional: literal none-set (Deno can't import deptIdOf). Keep in sync with SQL dashboard_stats none-set.
  const NONE_DEPT = new Set(['', 'none', 'אין'])
  const noMalf = NONE_DEPT.has(String(o.values['malfunction_dept'] ?? '').trim().toLowerCase())
  const skipMalf = (key: string) => noMalf && (key === 'malfunction_dept' || key === 'malfunction')
  const rows = o.defs
    .filter((f) => f.type !== 'photo' && String(o.values[f.key] ?? '').trim() && !skipMalf(f.key))
    .map((f, i) => `<tr style="background:${i % 2 ? '#fafbf9' : '#ffffff'}">
      <td style="padding:12px 16px;color:${MUT};font-weight:700;white-space:nowrap;vertical-align:top;width:38%;border-bottom:1px solid ${LINE}">${esc(f.label_he)}</td>
      <td style="padding:12px 16px;color:${I};vertical-align:top;border-bottom:1px solid ${LINE}">${esc(o.values[f.key]).replace(/\n/g, '<br>')}</td>
    </tr>`).join('')

  // Progress-report + missing-material tables (JSON strings inside values).
  // Intentional duplication of src/lib/reportTables.ts — Deno can't import it.
  const REASONS: Record<string, string> = {
    '1': 'ניזוק באתר', '2': 'נגנב באתר',
    '3': 'הפרש בין רשימת האריזה לכמות בארגז', '4': 'לא סופק מספיק',
  }
  const parseArr = (raw: unknown): Record<string, unknown>[] => {
    if (typeof raw !== 'string' || !raw) return []
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a : [] } catch { return [] }
  }
  const clampPct = (n: unknown) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)))
  const normRows = (rows: unknown): { task: string; pct: number; remarks: string }[] =>
    (Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [])
      .map((r) => ({ task: String(r?.task ?? ''), pct: clampPct(r?.pct), remarks: String(r?.remarks ?? '') }))
      .filter((r) => r.task.trim())
  // Per-coop progress reports ('progress_coops'); legacy flat keys render as one coop.
  // bd = the ציוד BD sub-form; shown only once something in it was filled.
  const bdOf = (c: Record<string, unknown> | null) => {
    const all = (Array.isArray(c?.bd) ? (c!.bd as Record<string, unknown>[]) : [])
      .map((r) => ({ task: String(r?.task ?? ''), pct: clampPct(r?.pct), remarks: String(r?.remarks ?? '') }))
    return all.some((r) => r.pct > 0 || r.remarks.trim()) ? all.filter((r) => r.task.trim()) : []
  }
  let coops = parseArr(o.values['progress_coops'])
    .map((c, i) => ({ name: String(c?.name ?? '') || `לול ${i + 1}`, pct: clampPct(c?.pct), rows: normRows(c?.rows), bd: bdOf(c) }))
  if (!coops.length) {
    const legacyRows = normRows(parseArr(o.values['progress_table']))
    const legacyPct = clampPct(o.values['progress_house_pct'])
    if (legacyRows.length || legacyPct > 0) coops = [{ name: 'לול 1', pct: legacyPct, rows: legacyRows, bd: [] }]
  }
  coops = coops.filter((c) => c.rows.length > 0 || c.pct > 0 || c.bd.length > 0)
  const missing = parseArr(o.values['missing_material'])
    .map((r) => ({ code: String(r?.code ?? ''), desc: String(r?.desc ?? ''), amount: String(r?.amount ?? ''), reason: String(r?.reason ?? '') }))
    .filter((r) => (r.code + r.desc + r.amount).trim() || r.reason)
  const th = (s: string, w = '') =>
    `<td style="padding:9px 12px;background:#f0f4ee;color:${I};font-weight:800;font-size:13px;border-bottom:1px solid ${LINE};${w}">${s}</td>`
  const td = (s: string) =>
    `<td style="padding:9px 12px;color:${I};font-size:14px;vertical-align:middle;border-bottom:1px solid ${LINE}">${s}</td>`
  const bar = (pct: number) =>
    `<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;background:${LINE};border-radius:6px;height:9px;min-width:70px"><div style="width:${pct}%;background:${GREEN};height:9px;border-radius:6px"></div></div><b style="font-size:12px">${pct}%</b></div>`
  const progressRowsHtml = (rows: { task: string; pct: number; remarks: string }[]) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:10px;overflow:hidden">
      <tr>${th('משימה', 'width:30%')}${th('אחוז ביצוע', 'width:32%')}${th('הערות')}</tr>
      ${rows.map((r, i) => `<tr style="background:${i % 2 ? '#fafbf9' : '#ffffff'}">${td(esc(r.task))}${td(bar(r.pct))}${td(esc(r.remarks))}</tr>`).join('')}
    </table>`
  const progressHtml = coops.map((c) => `
    <div style="font-weight:800;color:${I};margin:22px 0 8px">דו״ח התקדמות — ${esc(c.name)} · <span style="color:${GREEN}">${c.pct}%</span></div>
    ${progressRowsHtml(c.rows)}
    ${c.bd.length ? `<div style="font-weight:800;color:${I};margin:14px 0 8px">ציוד BD — ${esc(c.name)}</div>${progressRowsHtml(c.bd)}` : ''}`).join('')
  const missingHtml = missing.length ? `
    <div style="font-weight:800;color:${I};margin:22px 0 8px">חומר חסר</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:10px;overflow:hidden">
      <tr>${th('מק״ט')}${th('תיאור')}${th('כמות')}${th('סיבה')}</tr>
      ${missing.map((r, i) => `<tr style="background:${i % 2 ? '#fafbf9' : '#ffffff'}">${td(esc(r.code))}${td(esc(r.desc))}${td(esc(r.amount))}${td(esc(REASONS[r.reason] ?? ''))}</tr>`).join('')}
    </table>` : ''

  const photos = o.photoUrls.length ? `
    <div style="margin-top:24px">
      <div style="font-weight:800;color:${I};margin-bottom:10px">תמונות מהשטח</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px"><tr>
        ${o.photoUrls.map((u) => `<td style="padding:0"><img src="${u}" width="180" style="display:block;width:180px;height:130px;object-fit:cover;border-radius:10px;border:1px solid ${LINE}" alt="site photo" /></td>`).join('')}
      </tr></table>
    </div>` : ''

  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:28px 0">
      <tr><td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:94%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(20,24,27,.08)">
          <!-- header -->
          <tr><td style="padding:26px 28px 18px;border-bottom:3px solid ${GREEN}">
            <img src="${LOGO}" height="34" style="height:34px;display:block" alt="Agrotop" />
          </td></tr>
          <!-- title -->
          <tr><td style="padding:24px 28px 6px">
            <div style="font-size:13px;color:${MUT};letter-spacing:.04em">יומן עבודה · ${esc(o.workDate)}</div>
            <div style="font-size:26px;font-weight:800;color:${I};margin-top:4px">${esc(o.projectName)}</div>
            <div style="font-size:14px;color:${MUT};margin-top:4px">מנהל עבודה: ${esc(o.authorName)}</div>
          </td></tr>
          <!-- details -->
          <tr><td style="padding:14px 28px 4px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:10px;overflow:hidden">${rows}</table>
            ${progressHtml}${missingHtml}${photos}
          </td></tr>
          <!-- footer -->
          <tr><td style="padding:22px 28px 26px">
            <div style="border-top:1px solid ${LINE};padding-top:16px;font-size:12px;color:#94a094">
              נשלח ע״י <b style="color:${MUT}">${esc(o.senderName)}</b> ממערכת יומן העבודה של אגרוטופ ·
              <span style="color:${GREEN}">Agrotop Work Diary</span>
            </div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`
}
