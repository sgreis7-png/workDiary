import { useEffect, useMemo, useState } from 'react'
import { Loader } from '../../components/Loader'
import { useI18n } from '../../i18n'
import { fetchAuditLog, type AuditRow } from '../../defects/api'

// Who did what, and when.
//
// This lived at the bottom of the quality overview, which is where it was written but not where it
// belongs: it is management information, not a quality measure. A gate signature and a report sent
// outside the company are the same kind of fact — someone took a step that is hard to undo — and
// the question it answers is asked months later, when a problem turns up in a house and somebody
// needs to know who approved what.
//
// Admin-only, enforced by RLS on audit_log as well as by the route: rows may be written only in
// your own name and read only by an admin.

export const T = {
  title:   { he: 'יומן ביקורת', en: 'Audit log' },
  intro:   { he: 'פעולות שנרשמות מפני שקשה לבטל אותן: חתימות על שערים, פתיחה וסגירה של ליקויים, ושליחת דוחות במייל.',
             en: 'Actions recorded because they are hard to undo: gate signatures, defects opened and closed, and reports sent by email.' },
  none:    { he: 'אין רשומות עדיין.', en: 'Nothing recorded yet.' },
  all:     { he: 'הכל', en: 'All' },
  external:{ he: 'מחוץ לחברה', en: 'outside the company' },
  recipients: { he: 'נמענים', en: 'recipients' },
} as const

export const AUDIT_LABELS: Record<string, { he: string; en: string }> = {
  gate_signed:     { he: 'חתם על שער', en: 'signed a gate' },
  gate_unsigned:   { he: 'הסיר חתימות משער', en: 'removed gate signatures' },
  defect_open:     { he: 'פתח ליקוי', en: 'opened a defect' },
  defect_closed:   { he: 'סגר ליקוי', en: 'closed a defect' },
  defect_assigned: { he: 'הקצה ליקוי', en: 'assigned a defect' },
  send_report:     { he: 'שלח דוח במייל', en: 'emailed a report' },
}

export default function AuditLog() {
  const { lang } = useI18n()
  const t = (k: keyof typeof T) => T[k][lang]
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [action, setAction] = useState('')

  useEffect(() => {
    fetchAuditLog(300).then(setRows).catch(() => setRows([]))
  }, [])

  // Only offer filters for actions that are actually present — a dropdown of kinds that never
  // happened is a list of dead ends.
  const kinds = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.action))].sort(),
    [rows],
  )
  const shown = useMemo(
    () => (rows ?? []).filter((r) => !action || r.action === action),
    [rows, action],
  )

  if (rows === null) return <Loader label={t('title')} />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{lang === 'he' ? 'ניהול · מנהלי מערכת בלבד' : 'Admin only'}</div>
          <h1 className="page-title">{t('title')}</h1>
        </div>
        <span className="count mono">{shown.length}</span>
      </div>
      <p className="coop-intro">{t('intro')}</p>

      {kinds.length > 1 && (
        <div className="rule-new__fields" style={{ marginBottom: 16 }}>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t('all')}</option>
            {kinds.map((k) => (
              <option key={k} value={k}>{AUDIT_LABELS[k]?.[lang] ?? k}</option>
            ))}
          </select>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">{t('none')}</div>
      ) : (
        <div className="rules">
          {shown.map((a) => {
            const d = a.details ?? {}
            const recipients = Array.isArray(d.recipients) ? (d.recipients as string[]) : null
            const external = typeof d.external_count === 'number' ? d.external_count : 0
            return (
              <div key={a.id} className="rule-row">
                <div className="rule-row__main">
                  <span className="rule-row__when">
                    {new Date(a.created_at).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB',
                      { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <span className="rule-row__kind">{a.actor_email.split('@')[0]}</span>
                  <span className="rule-row__project">{AUDIT_LABELS[a.action]?.[lang] ?? a.action}</span>

                  {d.coop != null && <span className="rule-row__scope">{String(d.coop)}</span>}
                  {d.to != null && (
                    <span className="rule-row__scope">→ {String(d.to).split('@')[0]}</span>
                  )}
                  {recipients && (
                    <span className="rule-row__scope">
                      {recipients.length} {t('recipients')}
                    </span>
                  )}
                  {/* The case an auditor is actually looking for. */}
                  {external > 0 && (
                    <span className="rule-row__scope rule-row__scope--all">
                      {external} {t('external')}
                    </span>
                  )}
                  {typeof d.subject === 'string' && d.subject && (
                    <span className="rule-row__project" style={{ opacity: .75 }}>{d.subject}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
