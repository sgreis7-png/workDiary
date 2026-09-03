import { useEffect, useState } from 'react'
import { Button, Field } from '../../components/ui'
import { Loader } from '../../components/Loader'
import { useI18n } from '../../i18n'
import { fetchLastMailLog, fetchSettings, updateSettings, type MailLogRow } from '../../traffic/api'
import { DEFAULT_SETTINGS, type Settings } from '../../traffic/model'
import { axisLabel, tl, type TLKey } from '../../traffic/i18n'

/** `traffic_light_settings.extra_report_emails` (migration 0073) isn't part of the board's
 *  `Settings` shape — nothing that colors a project reads it — so it's typed locally rather
 *  than widening the shared model for one screen. */
type SettingsForm = Settings & { extra_report_emails: string[] }

/** One axis card's thresholds, in board order (time → supply → client → crew → issues → gray). */
const GROUPS: { axis: 'time' | 'supply' | 'client' | 'crew' | 'issues' | 'gray'; icon: string; keys: (keyof Settings)[] }[] = [
  { axis: 'time', icon: '⏱', keys: ['time_amber_days', 'time_red_days', 'lookahead_days'] },
  { axis: 'supply', icon: '📦', keys: ['supply_red_window_days', 'supply_eta_margin_days'] },
  { axis: 'client', icon: '🤝', keys: ['client_window_days'] },
  { axis: 'crew', icon: '👷', keys: ['crew_green_pct', 'crew_red_pct', 'crew_window_days'] },
  { axis: 'issues', icon: '⚠', keys: ['issue_open_days', 'issue_block_resolve_days'] },
  { axis: 'gray', icon: '📓', keys: ['gray_missing_workdays', 'gray_gantt_days'] },
]

/** `text, text ,text,,` → `{ emails: ['text', 'text'], dropped: [] }`: trims, lowercases,
 *  and separates out anything without an `@` rather than saving garbage into the recipients
 *  column that the weekly-report function would otherwise try to mail. An empty token from a
 *  stray comma or trailing separator is dropped silently; a non-empty token that isn't a
 *  plausible address is reported back so the admin sees why it didn't survive the save. */
function parseRecipients(raw: string): { emails: string[]; dropped: string[] } {
  const emails: string[] = []
  const dropped: string[] = []
  for (const part of raw.split(',')) {
    const e = part.trim().toLowerCase()
    if (!e) continue
    if (e.includes('@')) emails.push(e)
    else dropped.push(e)
  }
  return { emails, dropped }
}

/** Every value must be a whole, non-negative number; an inverted pair would make a color
 *  permanently unreachable, so those two relationships are checked before anything is sent. */
function validate(s: Settings, lang: 'he' | 'en'): string[] {
  const errs: string[] = []
  for (const g of GROUPS) for (const k of g.keys) {
    const v = s[k]
    if (!Number.isInteger(v) || v < 0) {
      errs.push(`${tl(lang, `s_${k}` as TLKey)}: ${lang === 'he' ? 'חייב להיות מספר שלם ואי-שלילי' : 'must be a non-negative whole number'}`)
    }
  }
  if (s.time_amber_days > s.time_red_days) {
    errs.push(lang === 'he'
      ? 'זמן: ערך הכתום לא יכול לעלות על ערך האדום — אחרת אין דרך להגיע לאדום'
      : 'Time: amber cannot exceed red — red would become unreachable')
  }
  if (s.crew_red_pct > s.crew_green_pct) {
    errs.push(lang === 'he'
      ? 'כוח אדם: אחוז האדום לא יכול לעלות על אחוז הירוק — אחרת אין דרך להגיע לירוק'
      : 'Crew: red percentage cannot exceed green percentage — green would become unreachable')
  }
  return errs
}

/**
 * Admin screen for the thirteen numeric thresholds that decide every color the traffic-light
 * report shows company-wide. Rarely visited, high consequence: grouped by the axis each
 * number governs (rather than one flat list of identical inputs) so the reader can see
 * which colors a given change touches, with the unit and meaning spelled out in the label.
 */
export default function TrafficSettings() {
  const { lang } = useI18n()
  const [s, setS] = useState<SettingsForm | null>(null)
  const [fetchErr, setFetchErr] = useState('')
  // True from the moment the load fails until either a reload succeeds or the admin edits
  // a value themselves. While it's true the form is showing DEFAULT_SETTINGS, not what's
  // actually stored — saving in that state would silently overwrite the real thresholds
  // with defaults, so Save stays blocked (button disabled AND guarded inside save()) until
  // one of those two things happens.
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveErrs, setSaveErrs] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  // Free text as typed, kept separate from the parsed `extra_report_emails` array so a
  // half-finished address (no `@` yet) or a trailing comma doesn't vanish out from under
  // the admin's cursor on every keystroke — it's only normalized on load and after a save.
  const [recipientsText, setRecipientsText] = useState('')

  // Last-send status is read once, independently of the settings form: a failure here
  // (log table missing, no permission) must not block the thresholds themselves from
  // loading or saving, so it gets its own state rather than piggy-backing on `s`/`fetchErr`.
  const [mailLog, setMailLog] = useState<MailLogRow | null | undefined>(undefined)
  const [mailLogFailed, setMailLogFailed] = useState(false)
  useEffect(() => {
    fetchLastMailLog().then(setMailLog).catch(() => setMailLogFailed(true))
  }, [])

  const load = () => {
    setFetchErr('')
    fetchSettings()
      .then((r) => {
        const withEmails = { ...r, extra_report_emails: (r as SettingsForm).extra_report_emails ?? [] }
        setS(withEmails)
        setRecipientsText(withEmails.extra_report_emails.join(', '))
        setLoadFailed(false)
      })
      // The runtime may not have the settings row yet (migration not applied) — show the
      // error but still hand the admin a readable form instead of hanging on a loader.
      .catch((e) => {
        setFetchErr(String((e as Error).message ?? e))
        setS({ ...DEFAULT_SETTINGS, extra_report_emails: [] })
        setRecipientsText('')
        setLoadFailed(true)
      })
  }
  useEffect(load, [])

  if (!s) return <Loader label={tl(lang, 'loading')} />

  const setField = (k: keyof Settings, raw: string) => {
    const n = Number(raw)
    setS({ ...s, [k]: Number.isFinite(n) ? n : NaN })
    setSaved(false)
    // A deliberate edit means the admin is looking at these values on purpose — the risk
    // this guards against (saving untouched, never-loaded defaults by accident) no longer
    // applies once they've typed something themselves.
    setLoadFailed(false)
  }

  const save = () => {
    setSaveErrs([]); setSaved(false)
    if (loadFailed) {
      setSaveErrs([lang === 'he'
        ? 'הספים הנוכחיים לא נטענו — שמירה עכשיו הייתה מחליפה אותם בברירת המחדל. טענו מחדש או ערכו ערך כדי להמשיך.'
        : 'The current thresholds failed to load — saving now would overwrite them with defaults. Reload or edit a value to continue.'])
      return
    }
    const errs = validate(s, lang)
    const { emails, dropped } = parseRecipients(recipientsText)
    for (const d of dropped) errs.push(`${tl(lang, 'settings_recipients_invalid')}${d}`)
    if (errs.length) { setSaveErrs(errs); return }
    const patch: SettingsForm = { ...s, extra_report_emails: emails }
    setSaving(true)
    updateSettings(patch)
      .then(() => { setSaved(true); setS(patch); setRecipientsText(patch.extra_report_emails.join(', ')) })
      .catch((e) => setSaveErrs([String((e as Error).message ?? e)]))
      .finally(() => setSaving(false))
  }

  const mailDate = mailLog?.requested_at
    ? new Date(mailLog.requested_at).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : ''
  const mailOk = !!mailLog && mailLog.http_status != null && mailLog.http_status >= 200 && mailLog.http_status < 300
  // The migration inserts the log row at request time with http_status/error both null; a
  // reconcile job fills them in a few minutes later. That null/null window is a real,
  // expected state (a send in flight) — not a failure — so it needs its own branch, checked
  // before the "anything else is a failure" case below.
  const mailPending = !!mailLog && mailLog.http_status == null && !mailLog.error

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Admin</div>
          <h1 className="page-title">🚦 {tl(lang, 'settings_title')}</h1>
        </div>
      </div>

      {mailLogFailed ? (
        <div className="tl-hint tl-hint--strong">✉ {tl(lang, 'settings_mail_unavailable')}</div>
      ) : mailLog !== undefined && (
        mailLog === null ? (
          <div className="tl-hint tl-hint--strong">✉ {tl(lang, 'settings_mail_never')}</div>
        ) : mailPending ? (
          <div className="tl-hint tl-hint--strong">✉ {tl(lang, 'settings_mail_pending')}</div>
        ) : mailOk ? (
          <div className="alert alert--ok">
            ✓ {tl(lang, 'settings_last_mail')}: <span dir="ltr">{mailDate}</span> · <span dir="ltr">{mailLog.recipient_count ?? 0}</span> {tl(lang, 'settings_mail_count')}
          </div>
        ) : (
          <div className="alert">
            ⚠ {tl(lang, 'settings_mail_failed')} <span dir="ltr">({mailLog.http_status ?? '—'}){mailLog.error ? `: ${mailLog.error}` : ''}</span>
          </div>
        )
      )}

      {loadFailed && fetchErr && (
        <div className="alert">
          ⚠ {fetchErr} — {lang === 'he' ? 'מוצגת ברירת מחדל; לא ניתן לשמור עד שהטעינה תצליח.' : 'showing defaults; saving is blocked until the load succeeds.'}
          <Button variant="ghost" type="button" onClick={load}>{lang === 'he' ? 'טען שוב' : 'Retry'}</Button>
        </div>
      )}
      {saveErrs.length > 0 && (
        <div className="alert">⚠ <ul className="tl-settings-errs">{saveErrs.map((e) => <li key={e}>{e}</li>)}</ul></div>
      )}
      {saved && <div className="alert alert--ok">✓ {tl(lang, 'settings_saved')}</div>}

      <div className="tl-blocks">
        {GROUPS.map((g) => (
          <div className="tl-block" key={g.axis}>
            <div className="tl-block__head">
              <span aria-hidden>{g.icon}</span>
              <div className="tl-block__title">{axisLabel(lang, g.axis)}</div>
            </div>
            <div className="form-grid">
              {g.keys.map((k) => (
                <Field key={k} label={tl(lang, `s_${k}` as TLKey)}>
                  <input
                    className="input" type="number" min={0} step={1}
                    value={Number.isNaN(s[k]) ? '' : s[k]}
                    onChange={(e) => setField(k, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="tl-block" style={{ marginTop: 14 }}>
        <Field label={tl(lang, 'settings_recipients')}>
          <input
            className="input" type="text" dir="ltr"
            value={recipientsText}
            onChange={(e) => { setRecipientsText(e.target.value); setSaved(false) }}
          />
        </Field>
        <div className="tl-hint">{tl(lang, 'settings_recipients_hint')}</div>
      </div>

      <Button variant="primary" type="button" disabled={saving || loadFailed} style={{ marginTop: 14 }} onClick={save}>
        {tl(lang, 'save')}
      </Button>
    </div>
  )
}
