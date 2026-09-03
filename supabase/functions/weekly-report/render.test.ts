// Sunday's board turns into a VP-facing email here. These tests pin the parts a mail
// client can't get wrong silently: every project must appear, only non-green projects
// get a reason block, an empty task list must not leave a dangling empty section, and
// user-entered text (project names, task titles) must never reach the HTML unescaped.
import { describe, expect, it } from 'vitest'
import { renderWeeklyReport } from './render'

const red = {
  project_id: 'p1', name: 'כפר יובל', manager: 'משה', color: 'red', gray_reason: null,
  action_line: 'בלת"מ חוסם עבודה', due: { contract: '2026-11-30', forecast: '2026-12-20', delta_days: 20 },
  axes: {
    time: { color: 'amber', reason: 'סיום חזוי +20 ימים' }, supply: { color: 'green', reason: 'הכל באתר' },
    client: { color: 'na', reason: 'לא הוזנו התחייבויות לקוח' }, crew: { color: 'na', reason: 'לא הוגדרו קבלנים' },
    issues: { color: 'red', reason: 'בלת"מ #3 חוסם עבודה' },
  },
  last_entry_on: '2026-09-02',
}
const green = { ...red, project_id: 'p2', name: 'נחם', color: 'green', action_line: '',
  axes: { ...red.axes, issues: { color: 'green', reason: 'אין בלת"מ פתוח' } } }

describe('renderWeeklyReport', () => {
  it('names every project and the reason behind a red one', () => {
    const { html } = renderWeeklyReport({ payload: [red, green], tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test' })
    expect(html).toContain('כפר יובל')
    expect(html).toContain('נחם')
    expect(html).toContain('בלת"מ #3 חוסם עבודה')
  })
  it('details the non-green projects only', () => {
    const { html } = renderWeeklyReport({ payload: [red, green], tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test' })
    const detailStart = html.indexOf('פירוט')
    expect(html.slice(detailStart)).toContain('כפר יובל')
    expect(html.slice(detailStart)).not.toContain('נחם')
  })
  it('renders no task section when there are no tasks', () => {
    const { html } = renderWeeklyReport({ payload: [green], tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test' })
    expect(html).not.toContain('משימות פתוחות')
  })
  it('groups tasks by assignee and names an unassigned one', () => {
    const { html } = renderWeeklyReport({
      payload: [red], appUrl: 'https://x.test', takenAt: '2026-09-06T04:00:00Z',
      tasks: [
        { title: 'לשלוח הודעה ללקוח', assignee_email: 'a@x.co', due_date: '2026-09-10', project_id: 'p1', axis: 'client' },
        { title: 'להשלים נתונים: קבלנים', assignee_email: null, due_date: null, project_id: 'p1', axis: 'crew' },
      ],
    })
    expect(html).toContain('משימות פתוחות')
    expect(html).toContain('a@x.co')
    expect(html).toContain('ללא אחראי')
  })
  it('counts the colours in the subject', () => {
    const { subject } = renderWeeklyReport({ payload: [red, green], tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test' })
    expect(subject).toContain('1 אדום')
  })
  it('escapes a project name that contains markup', () => {
    const { html } = renderWeeklyReport({
      payload: [{ ...green, name: '<script>x</script>' }], tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test' })
    expect(html).not.toContain('<script>')
  })
  // A snapshot written before a schema change can lack `axes`/`due` entirely (not just a
  // missing axis key) — the field this renders from is the database's, not this file's
  // type. Losing the whole weekly mail to one stale row would be worse than a blank row.
  it('renders a project whose axes and due are entirely absent, without throwing', () => {
    const bare: Record<string, unknown> = { ...red, project_id: 'p3', name: 'שדה בר' }
    delete bare.axes
    delete bare.due
    expect(() => renderWeeklyReport({
      payload: [bare as unknown as typeof red],
      tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test',
    })).not.toThrow()
    const { html } = renderWeeklyReport({
      payload: [bare as unknown as typeof red],
      tasks: [], takenAt: '2026-09-06T04:00:00Z', appUrl: 'https://x.test',
    })
    expect(html).toContain('שדה בר')
  })
})
