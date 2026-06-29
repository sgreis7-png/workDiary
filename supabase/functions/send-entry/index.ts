// Email one diary entry to distribution lists and/or individual addresses via Resend.
// Caller must be an authenticated user (JWT). Data is read with the service role so
// the rendered email can include author name + signed photo URLs.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Agrotop Work Diary <onboarding@resend.dev>'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    // verify caller
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const { entry_id, list_ids = [], emails = [] } = await req.json()
    if (!entry_id) return json({ error: 'missing_entry' }, 400)
    if (!RESEND_KEY) return json({ error: 'email_not_configured' }, 500)

    const db = createClient(URL, SERVICE)

    // entry + author + photos
    const { data: entry, error: eErr } = await db
      .from('entries')
      .select('id, project_id, created_by, work_date, values, entry_photos(storage_path)')
      .eq('id', entry_id).single()
    if (eErr || !entry) return json({ error: 'entry_not_found' }, 404)

    const [{ data: project }, { data: author }, { data: defs }] = await Promise.all([
      db.from('projects').select('name').eq('id', entry.project_id).single(),
      db.from('profiles').select('name').eq('id', entry.created_by).single(),
      db.from('field_definitions').select('*').eq('active', true).order('sort_order'),
    ])

    // recipients = list members + individual addresses, de-duped
    const recipients = new Set<string>()
    for (const e of emails) if (typeof e === 'string' && e.includes('@')) recipients.add(e.trim())
    if (list_ids.length) {
      const { data: recs } = await db
        .from('list_recipients').select('email').in('list_id', list_ids)
      for (const r of recs ?? []) if (r.email) recipients.add(r.email)
    }
    if (recipients.size === 0) return json({ error: 'no_recipients' }, 400)

    // signed photo URLs (24h)
    const paths = (entry.entry_photos ?? []).map((p: { storage_path: string }) => p.storage_path)
    let photoUrls: string[] = []
    if (paths.length) {
      const { data: signed } = await db.storage.from('photos').createSignedUrls(paths, 60 * 60 * 24)
      photoUrls = (signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[]
    }

    const html = renderHtml({
      projectName: project?.name ?? '—',
      authorName: author?.name ?? '—',
      workDate: entry.work_date ?? '',
      values: entry.values ?? {},
      defs: defs ?? [],
      photoUrls,
    })
    const subject = `יומן עבודה · ${project?.name ?? ''} · ${entry.work_date ?? ''}`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: [...recipients], subject, html }),
    })
    if (!res.ok) return json({ error: `resend_failed: ${await res.text()}` }, 502)

    await db.from('entries').update({ last_sent_at: new Date().toISOString() }).eq('id', entry_id)
    return json({ ok: true, sent_to: recipients.size })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

interface FieldDef { key: string; label_he: string; type: string }
function renderHtml(o: {
  projectName: string; authorName: string; workDate: string
  values: Record<string, string>; defs: FieldDef[]; photoUrls: string[]
}): string {
  const esc = (s: string) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  const rows = o.defs
    .filter((f) => f.type !== 'photo' && String(o.values[f.key] ?? '').trim())
    .map((f) => `<tr>
      <td style="padding:8px 12px;background:#f4f6f2;font-weight:700;white-space:nowrap;vertical-align:top">${esc(f.label_he)}</td>
      <td style="padding:8px 12px">${esc(o.values[f.key]).replace(/\n/g, '<br>')}</td>
    </tr>`).join('')
  const photos = o.photoUrls.length
    ? `<div style="margin-top:18px"><b>תמונות מהשטח</b><div style="margin-top:8px">${
        o.photoUrls.map((u) => `<img src="${u}" style="max-width:260px;border-radius:8px;margin:4px" />`).join('')
      }</div></div>`
    : ''
  return `<!doctype html><html dir="rtl" lang="he"><body style="font-family:Arial,Helvetica,sans-serif;color:#1b2520;max-width:680px;margin:auto">
    <div style="border-bottom:3px solid #3aaa35;padding-bottom:12px;margin-bottom:18px">
      <h1 style="margin:0;font-size:22px">Agrotop · יומן עבודה</h1>
      <div style="color:#5a655d;font-size:14px">${esc(o.projectName)} · ${esc(o.workDate)} · ${esc(o.authorName)}</div>
    </div>
    <table style="border-collapse:collapse;width:100%;border:1px solid #e4e8e1">${rows}</table>
    ${photos}
    <p style="color:#94a094;font-size:12px;margin-top:24px">נשלח אוטומטית ממערכת יומן העבודה של אגרוטופ</p>
  </body></html>`
}
