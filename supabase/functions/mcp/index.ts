// Remote MCP server for the claude.ai connector: read-only tools over the Work Diary data.
//
// The person's own Supabase access token (issued by Supabase Auth's OAuth server) is the only
// credential. Every query runs as them through PostgREST, so RLS applies on top of the tool
// allowlist, and the service key is never read here — a bug in a tool can at worst show someone
// what the app would already show them.
//
// Request flow: no/invalid token → HTTP 401 with the RFC 9728 pointer, which is what makes
// claude.ai start the OAuth flow. A valid token that is not eligible (role, area) still gets a
// working MCP session, but every tool call answers with a refusal the person can act on — a 401
// there would only loop them back through a login that cannot help.
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { McpServer, StreamableHttpTransport, type Ctx, type ToolCallResult } from 'mcp-lite'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { TOOLS, type ToolCtx, type ToolDef } from './tools.ts'
import { gate, type GateDb } from './gate.ts'
import { makeLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC } from './ratelimit.ts'

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
/** The URL claude.ai is given for the connector, and the OAuth resource it asks a token for. */
const RESOURCE = `${SUPABASE_URL}/functions/v1/mcp`
const METADATA_PATH = '/.well-known/oauth-protected-resource'

const INSTRUCTIONS =
  'Agrotop Work Diary (read-only). Dates are ISO 8601: YYYY-MM-DD, timestamps in ISO format. ' +
  'A result of { "denied": "<area>" } means the user has no permission for that area in the app — ' +
  'tell them so; it is not an empty result. Text content is mostly Hebrew.'

const REFUSAL: Record<'role' | 'not_enabled' | 'no_email_claim', string> = {
  no_email_claim: 'ההתחברות לא כוללת כתובת דוא"ל — יש להתחבר מחדש ולאשר גישה לכתובת.\nYour login does not include an email address — reconnect and allow email access.',
  role: 'חיבור Claude זמין רק למנהלים ולמנהלי מערכת.\nThe Claude connector is only available to managers and administrators.',
  not_enabled: 'חיבור Claude לא הופעל עבורך. פנה למנהל המערכת.\nClaude connector is not enabled for you. Ask your administrator.',
}

/** Per-instance, so weaker than a shared limit — accepted in the design (no service key for rl_check). */
const allow = makeLimiter({ capacity: DEFAULT_CAPACITY, refillPerSec: DEFAULT_REFILL_PER_SEC })

/** What one HTTP request knows about its caller, handed to tool handlers through authInfo.extra. */
type Caller =
  | { kind: 'ok'; userId: string; tools: ToolCtx }
  | { kind: 'refused'; text: string }
  | { kind: 'unavailable' }

const errorResult = (text: string): ToolCallResult => ({ content: [{ type: 'text', text }], isError: true })

function handlerFor(def: ToolDef) {
  return async (args: unknown, ctx: Ctx): Promise<ToolCallResult> => {
    const caller = ctx.authInfo?.extra?.caller as Caller | undefined
    if (!caller) return errorResult('unauthenticated')
    if (caller.kind === 'unavailable') return errorResult(UNAVAILABLE)
    if (caller.kind === 'refused') return errorResult(caller.text)
    if (!allow(caller.userId)) return errorResult('rate_limited')
    try {
      const out = await def.run(caller.tools, (args ?? {}) as Record<string, unknown>)
      const result: ToolCallResult = { content: [{ type: 'text', text: JSON.stringify(out) }] }
      if (out && typeof out === 'object' && !Array.isArray(out)) result.structuredContent = out
      return result
    } catch (e) {
      // A thrown tool (bad arguments, a PostgREST error) is the model's to read and correct,
      // so it comes back as a tool error, not a JSON-RPC failure that ends the call.
      if (e instanceof z.ZodError) return errorResult(z.prettifyError(e))
      return errorResult(e instanceof Error ? e.message : String(e))
    }
  }
}

const mcp = new McpServer({ name: 'agrotop-work-diary', version: '1.0.0' })

// mcp-lite has no `instructions` option; add it to the initialize result on the way out.
mcp.use(async (ctx, next) => {
  await next()
  const result = ctx.response?.result
  if (ctx.request.method === 'initialize' && result && typeof result === 'object') {
    Object.assign(result, { instructions: INSTRUCTIONS })
  }
})

for (const def of TOOLS) {
  mcp.tool(def.name, {
    description: def.description,
    // Passed as JSON Schema rather than the zod object, so mcp-lite does not validate first:
    // def.run() validates itself and its errors then come back as tool errors. io:'input' keeps
    // defaulted args (limit) optional in the advertised schema. The spread matters: zod 4.4
    // tags its JSON Schema output with a hidden '~standard' key, which mcp-lite would take for
    // a Standard Schema and refuse without an adapter.
    inputSchema: { ...z.toJSONSchema(def.input, { io: 'input' }) },
    annotations: { readOnlyHint: true },
    handler: handlerFor(def),
  })
}

const mcpHandler = new StreamableHttpTransport().bind(mcp)

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${RESOURCE}${METADATA_PATH}"`,
    },
  })
}

const UNAVAILABLE =
  'השירות אינו זמין זמנית, נסו שוב בעוד דקה\nService temporarily unavailable, try again in a minute'

function unavailable(): Response {
  return new Response(JSON.stringify({ error: 'unavailable', message: UNAVAILABLE }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
  })
}

async function callerFor(authorization: string): Promise<Caller | null> {
  const db = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  }) as unknown as GateDb
  try {
    const g = await gate(db, authorization.replace(/^Bearer\s+/i, ''))
    if (g.ok) {
      const canView = async (area: string) => {
        const { data, error } = await db.rpc('can_view', { p_area: area })
        if (error) throw new Error(error.message)
        return data === true
      }
      return { kind: 'ok', userId: g.userId, tools: { db, canView } }
    }
    if (g.reason === 'unauthenticated') return null
    if (g.reason === 'unavailable') return { kind: 'unavailable' }
    return { kind: 'refused', text: REFUSAL[g.reason] }
  } catch (e) {
    // The permission lookup itself failed: say so rather than guess either way.
    return { kind: 'refused', text: `permission check failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

const routes = new Hono({ strict: false })

routes.get(METADATA_PATH, (c) =>
  // 'email' matters: the database's is_member()/perm_level() read the e-mail claim of the token.
  c.json({
    resource: RESOURCE,
    authorization_servers: [`${SUPABASE_URL}/auth/v1`],
    scopes_supported: ['openid', 'email', 'profile'],
  }))

routes.on(['POST', 'GET'], '/', async (c) => {
  const authorization = c.req.header('Authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(authorization)) return unauthorized()
  const caller = await callerFor(authorization)
  if (!caller) return unauthorized()
  if (caller.kind === 'unavailable') return unavailable()
  return mcpHandler(c.req.raw, {
    authInfo: { token: authorization.replace(/^Bearer\s+/i, ''), scopes: [], extra: { caller } },
  })
})

// Supabase hands the function its path with the function name in front ("/mcp/…"), and some
// runtimes keep "/functions/v1" too; mount the same routes under each so either works.
const app = new Hono({ strict: false })
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['authorization', 'content-type', 'mcp-protocol-version', 'mcp-session-id', 'last-event-id'],
  exposeHeaders: ['WWW-Authenticate', 'mcp-session-id'],
}))
app.route('/functions/v1/mcp', routes)
app.route('/mcp', routes)
app.route('/', routes)

Deno.serve(app.fetch)
