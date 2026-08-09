// Ad-hoc check that the schedule board scrolls inside its container instead of widening
// the page. Loads the harness, feeds it a converted schedule, and reports the widths that
// matter plus a screenshot.
//
//   node .shots-tmp/gantt-shot.mjs <path to converted .json> [baseUrl]
import { chromium } from 'playwright'

const schedule = process.argv[2]
const base = process.argv[3] ?? 'http://localhost:5173'
if (!schedule) throw new Error('pass the path to a converted schedule .json')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
await page.goto(`${base}/gantt-preview.html`, { waitUntil: 'networkidle' })
await page.setInputFiles('input[type=file]', schedule)
await page.waitForSelector('.gantt__board', { timeout: 15000 })
await page.waitForTimeout(500)

const metrics = await page.evaluate(() => {
  const box = (s) => {
    const e = document.querySelector(s)
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { w: Math.round(r.width), left: Math.round(r.left), scrollW: e.scrollWidth, clientW: e.clientWidth }
  }
  return {
    win: innerWidth,
    docScrollW: document.documentElement.scrollWidth,
    gantt: box('.gantt'),
    board: box('.gantt__board'),
    paneTasks: box('.gantt__pane-tasks'),
    firstTaskName: document.querySelector('.gantt__name')?.textContent,
  }
})
console.log(JSON.stringify(metrics, null, 1))

const verdict = []
if (metrics.docScrollW > metrics.win + 1) verdict.push(`FAIL page overflows: ${metrics.docScrollW} > ${metrics.win}`)
if (metrics.board.scrollW <= metrics.board.clientW) verdict.push('FAIL board is not scrolling internally')
if (metrics.paneTasks.left < 0) verdict.push(`FAIL task column is off-screen at ${metrics.paneTasks.left}`)
console.log(verdict.length ? verdict.join('\n') : 'PASS board scrolls inside its container')

await page.screenshot({ path: '.shots-tmp/gantt-fixed.png' })
await browser.close()
