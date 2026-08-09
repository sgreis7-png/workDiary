import { chromium } from 'playwright'
// Credentials come from the environment, never from the file. A literal password here
// is committed forever, ships to anyone who clones, and outlives the account.
//   SHOTS_EMAIL=... SHOTS_PASSWORD=... node <this script>
const EMAIL = process.env.SHOTS_EMAIL
const PASSWORD = process.env.SHOTS_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('set SHOTS_EMAIL and SHOTS_PASSWORD before running this script')
  process.exit(1)
}
const OUT = process.argv[2] || '.'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await page.fill('input[type=email]', EMAIL)
await page.fill('input[type=password]', PASSWORD)
await page.click('button[type=submit]')
await page.waitForTimeout(1200)
await page.click('text=לוח שנה')
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/calendar.png` })
console.log('calendar')
await page.click('text=רשימות תפוצה')
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/lists.png` })
console.log('lists')
await b.close()
