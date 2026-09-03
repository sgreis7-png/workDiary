// DEV-ONLY visual harness: renders defect-module screens with mock data so
// mobile layout can be screenshot-tested without auth. Not part of the app build.
import ReactDOM from 'react-dom/client'
import { useState } from 'react'
import './styles/global.css'
import './styles/components.css'
import { I18nProvider } from './i18n'
import { ProjectOpenTab } from './screens/defects/ProjectOpenTab'
import { GateTab } from './screens/defects/GateTab'
import { DefectLogTab } from './screens/defects/DefectLogTab'
import { StatusSummaryTab } from './screens/defects/StatusSummaryTab'
import { GATES, GATE_ORDER } from './defects/model'
import { buildCoopReportHtml } from './defects/report'
import type { Coop, CoopBundle, CoopResponsibility, Defect } from './defects/api'
import type { AppUser } from './data'
import { TrafficDot } from './components/TrafficDot'
import './styles/traffic.css'

const coop: Coop = {
  id: 'c1', project_id: 'p1', name: 'לול 1', coop_type: 'broiler', farm_coop_count: 4,
  equipment_supplier: 'חקלאי ציוד בע"מ', has_heating: true, has_cooling_pads: true, has_tunnel_shutter: false,
  execution_manager: 'יוסי לוי', field_supervisor: 'דנה כהן', opened_on: '2026-07-01', created_by: null, created_at: '',
}
const responsibilities: CoopResponsibility[] = [
  { coop_id: 'c1', domain_key: 'gas', responsible: 'agrotop', external_who: 'חברת הגז הצפונית', notes: 'ממתין לאישור' },
  { coop_id: 'c1', domain_key: 'generator', responsible: 'customer', external_who: null, notes: null },
]
const defects: Defect[] = [
  { id: 'd1', coop_id: 'c1', seq: 1, gate: 'pre_pour', item_no: 1, description: 'המצעים לא הודקו לפי דרישת התוכנית באזור הצפוני', severity: 'major', assignee: 'יוסי לוי', assignee_email: 'yossi@a.co', due_date: '2026-07-25', status: 'open', closed_on: null, closure_note: null, created_at: '' } as unknown as Defect,
  { id: 'd2', coop_id: 'c1', seq: 2, gate: 'gate1', item_no: 3, description: 'סדק ביסוד', severity: 'critical', assignee: null, assignee_email: null, due_date: null, status: 'closed', closed_on: '2026-07-20', closure_note: 'תוקן ואושר', created_at: '' } as unknown as Defect,
]
const bundle: CoopBundle = {
  coop, responsibilities, defects,
  items: [
    { coop_id: 'c1', gate: 'pre_pour', item_no: 1, status: 'done', severity: null, note: 'בוצע היטב אחרי תיקון', external_by: null, auto_na_reason: null },
    { coop_id: 'c1', gate: 'pre_pour', item_no: 2, status: 'not_done', severity: 'major', note: null, external_by: 'קבלן משנה', auto_na_reason: null },
  ],
  signatures: [], concessions: [],
} as unknown as CoopBundle
const users: AppUser[] = [{ email: 'yossi@a.co', name: 'יוסי לוי', role: 'member', active: true, registered: true } as unknown as AppUser]
const noop = () => {}

function Preview() {
  const [zoom] = useState(() => Math.max(0.3, (Math.min(window.innerWidth, 900) - 60) / 905))
  const html = buildCoopReportHtml(bundle, 'מעלה גמלא', { senderName: 'סטפני' })
  const section = (id: string, title: string, el: React.ReactNode) => (
    <div id={id} style={{ marginBottom: 40 }}>
      <div style={{ background: '#123', color: '#fff', padding: '4px 10px', fontSize: 12 }}>{title}</div>
      {el}
    </div>
  )
  return (
    <div className="shell" style={{ display: 'block' }}>
      <div className="main" style={{ padding: 12 }}>
        <div className="page coop-view">
          <div className="page__head">
            <div>
              <div className="kicker">מעלה גמלא · תפיסת סיום שלב</div>
              <h1 className="page-title">לול 1</h1>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn--primary">📄 דוח / ייצוא</button>
              <button className="btn btn--ghost">→ כל הלולים</button>
              <button className="btn btn--ghost" style={{ color: 'var(--clay)' }}>🗑 מחיקת לול</button>
            </div>
          </div>
          <div className="coop-tabs">
            {['פתיחת פרויקט', 'ריכוז סטטוס', ...GATE_ORDER.map((g) => GATES[g].shortName), 'יומן ליקויים'].map((t, i) => (
              <button key={i} className={`coop-tab ${i === 0 ? 'on' : ''}`}>{t}</button>
            ))}
          </div>
          {section('s-po', 'ProjectOpenTab', (
            <ProjectOpenTab coop={coop} responsibilities={responsibilities} projectName="מעלה גמלא" onCoop={noop} onResponsibility={noop} />
          ))}
          {section('s-sum', 'StatusSummaryTab', (
            <StatusSummaryTab items={bundle.items} defs={GATES} onGoGate={noop} />
          ))}
          {section('s-gate', 'GateTab', (
            <GateTab gate={GATES.pre_pour} defs={GATES} bundle={bundle} onItem={noop} onSign={noop} onUnsign={noop} onConcession={noop} onGoDefects={noop} />
          ))}
          {section('s-dlog', 'DefectLogTab', (
            <DefectLogTab defects={defects} defs={GATES} users={users} photos={[]} onAdd={noop} onPatch={noop} onRemove={noop} />
          ))}
          {section('s-tl-board', 'TrafficBoard: row grid + header', (
            <div className="tl-board">
              <div className="tl-head" aria-hidden>
                <span /><span>פרויקט</span><span>זמן · אספ · צוו · בלת&quot;מ</span>
                <span>יעד</span><span>פעולה</span><span>עדכון</span>
              </div>
              {[
                { color: 'red' as const, name: 'כפר יובל', manager: 'דני' },
                { color: 'amber' as const, name: 'מעלה גמלא', manager: 'רונית' },
                { color: 'gray' as const, name: 'שדה אליהו', manager: 'עומר' },
              ].map((p) => (
                <div key={p.name} className={`tl-row tl-row--${p.color}`}>
                  <TrafficDot color={p.color} size="lg" />
                  <div>
                    <div className="tl-row__name">{p.name}</div>
                    <div className="tl-row__manager">{p.manager}</div>
                  </div>
                  <div className="tl-axes">
                    {(['time', 'supply', 'crew', 'issues'] as const).map((a) => (
                      <span key={a}><TrafficDot color={p.color === 'gray' ? 'gray' : 'amber'} />{a}</span>
                    ))}
                  </div>
                  <div className="tl-delta tl-delta--bad">+5</div>
                  <div className="tl-action">יש לפנות לקבלן לגבי כוח אדם חסר</div>
                  <div className="tl-last">02/09</div>
                </div>
              ))}
            </div>
          ))}
          {section('s-tl-project', 'TrafficProject: drill-down block stack', (
            <div className="tl-blocks">
              {(['red', 'amber', 'green'] as const).map((c, i) => (
                <section key={c} className={`tl-block tl-block--${c}`}>
                  <div className="tl-block__head">
                    <TrafficDot color={c} size="lg" />
                    <div className="tl-block__title">{['זמן', 'אספקות', 'צוות'][i]}</div>
                    <button className="btn btn--ghost">☑ צור משימה</button>
                  </div>
                  <div className="tl-block__reason">דוגמת סיבה קצרה להדגמת פריסת הבלוק ברוחב טלפון.</div>
                  <table className="tl-table m-cards">
                    <thead><tr><th>שם</th><th>ת. יעד</th><th>סטטוס</th><th /></tr></thead>
                    <tbody>
                      <tr className="is-critical">
                        <td data-label="שם">מוט פלדה ★</td>
                        <td className="mono" data-label="ת. יעד">10/09</td>
                        <td data-label="סטטוס">לא הוזמן</td>
                        <td data-label="צבע"><TrafficDot color="red" /></td>
                      </tr>
                      <tr>
                        <td data-label="שם">בטון</td>
                        <td className="mono" data-label="ת. יעד">15/09</td>
                        <td data-label="סטטוס">הוזמן</td>
                        <td data-label="צבע"><TrafficDot color="green" /></td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          ))}
          {section('s-report', 'Report preview', (
            <div className="report-frame">
              <div style={{ zoom }} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<I18nProvider><Preview /></I18nProvider>)
