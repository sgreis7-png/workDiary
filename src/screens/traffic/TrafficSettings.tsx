import { useEffect, useState } from 'react'
import { Button, Field } from '../../components/ui'
import { Loader } from '../../components/Loader'
import { useI18n } from '../../i18n'
import { fetchSettings, updateSettings } from '../../traffic/api'
import { DEFAULT_SETTINGS, type Settings } from '../../traffic/model'
import { axisLabel, tl, type TLKey } from '../../traffic/i18n'

/** One axis card's thresholds, in board order (time → supply → crew → issues → gray). */
const GROUPS: { axis: 'time' | 'supply' | 'crew' | 'issues' | 'gray'; icon: string; keys: (keyof Settings)[] }[] = [
  { axis: 'time', icon: '⏱', keys: ['time_amber_days', 'time_red_days', 'lookahead_days'] },
  { axis: 'supply', icon: '📦', keys: ['supply_red_window_days', 'supply_eta_margin_days'] },
  { axis: 'crew', icon: '👷', keys: ['crew_green_pct', 'crew_red_pct', 'crew_window_days'] },
  { axis: 'issues', icon: '⚠', keys: ['issue_open_days', 'issue_block_resolve_days'] },
  { axis: 'gray', icon: '📓', keys: ['gray_missing_workdays', 'gray_gantt_days'] },
]

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
 * Admin screen for the twelve numeric thresholds that decide every color the traffic-light
 * report shows company-wide. Rarely visited, high consequence: grouped by the axis each
 * number governs (rather than one flat list of identical inputs) so the reader can see
 * which colors a given change touches, with the unit and meaning spelled out in the label.
 */
export default function TrafficSettings() {
  const { lang } = useI18n()
  const [s, setS] = useState<Settings | null>(null)
  const [fetchErr, setFetchErr] = useState('')
  const [saveErrs, setSaveErrs] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
      .then(setS)
      // The runtime may not have the settings row yet (migration not applied) — show the
      // error but still hand the admin an editable form instead of hanging on a loader.
      .catch((e) => { setFetchErr(String((e as Error).message ?? e)); setS(DEFAULT_SETTINGS) })
  }, [])

  if (!s) return <Loader label={tl(lang, 'loading')} />

  const setField = (k: keyof Settings, raw: string) => {
    const n = Number(raw)
    setS({ ...s, [k]: Number.isFinite(n) ? n : NaN })
    setSaved(false)
  }

  const save = () => {
    setSaveErrs([]); setSaved(false)
    const errs = validate(s, lang)
    if (errs.length) { setSaveErrs(errs); return }
    setSaving(true)
    updateSettings(s)
      .then(() => setSaved(true))
      .catch((e) => setSaveErrs([String((e as Error).message ?? e)]))
      .finally(() => setSaving(false))
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Admin</div>
          <h1 className="page-title">🚦 {tl(lang, 'settings_title')}</h1>
        </div>
      </div>
      {fetchErr && <div className="alert">⚠ {fetchErr}</div>}
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

      <Button variant="primary" type="button" disabled={saving} style={{ marginTop: 14 }} onClick={save}>
        {tl(lang, 'save')}
      </Button>
    </div>
  )
}
