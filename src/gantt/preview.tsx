// DEV-ONLY visual harness for the schedule board: renders GanttChart from a converted
// schedule with no auth and no database, so layout and drag behaviour can be checked
// (and screenshot-tested) in isolation. Not part of the app build.
//
//   1. python services/mpp-converter/… -> some-schedule.json   (converter.convert)
//   2. npm run dev, open /gantt-preview.html, pick that JSON
//
// The JSON is loaded from disk by hand rather than committed as a fixture: a real
// schedule is customer data, and anything under public/ ships in the built bundle.
import { useState } from 'react'
import ReactDOM from 'react-dom/client'
import '../styles/global.css'
import '../styles/components.css'
import { I18nProvider } from '../i18n'
import { GanttChart, type TaskChange } from '../components/GanttChart'
import { toRows, type ConvertedProject, type GanttLink, type GanttTask } from './model'

function Preview() {
  const [tasks, setTasks] = useState<GanttTask[] | null>(null)
  const [links, setLinks] = useState<GanttLink[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])

  async function load(file: File | undefined) {
    if (!file) return
    setFailure(null)
    try {
      const payload = JSON.parse(await file.text()) as ConvertedProject
      const rows = toRows(payload)
      if (!rows.tasks.length) throw new Error('no dated tasks')
      setTasks(rows.tasks.map((t, i) => ({ ...t, id: `t${i}`, chart_id: 'preview' })))
      setLinks(rows.links.map((l, i) => ({ ...l, id: `l${i}`, chart_id: 'preview' })))
    } catch (e) {
      setFailure(`Could not read ${file.name}: ${(e as Error).message}`)
    }
  }

  // Stands in for the screen's persistence: apply locally and note what would be saved.
  const onEdit = (changes: TaskChange[]) => {
    setTasks((prev) => {
      if (!prev) return prev
      const byId = new Map(changes.map((c) => [c.task.id, c]))
      return prev.map((t) => {
        const c = byId.get(t.id)
        if (!c) return t
        return { ...t, ...(c.span ?? {}), ...(c.pct !== undefined ? { pct: c.pct } : {}) }
      })
    })
    setLog((prev) => [
      `${changes.length} row(s): ${changes.slice(0, 4).map((c) => c.task.name).join(', ')}${changes.length > 4 ? '…' : ''}`,
      ...prev,
    ].slice(0, 8))
  }

  return (
    <div className="shell" style={{ display: 'block' }}>
      <div className="main" style={{ padding: 12 }}>
        <div className="page">
          <div className="page__head">
            <div>
              <div className="kicker">DEV harness · GanttChart</div>
              <h1 className="page-title">לוח זמנים</h1>
            </div>
            <input type="file" accept=".json" onChange={(e) => void load(e.target.files?.[0])} />
          </div>
          {failure && <div className="tag tag--clay">{failure}</div>}
          {!tasks && !failure && <div className="empty">pick a converted schedule (.json)</div>}
          {tasks && <GanttChart tasks={tasks} links={links} canEdit onEdit={onEdit} today="2026-08-09" />}
          {log.length > 0 && (
            <div className="panel" style={{ marginTop: 14, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
              <b>would persist</b>
              {log.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
  .render(<I18nProvider><Preview /></I18nProvider>)
