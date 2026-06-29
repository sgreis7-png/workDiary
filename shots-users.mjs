import { chromium } from 'playwright'
const OUT = process.argv[2] || '.'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await page.fill('input[type=email]', 'pavel@agrotop.co.il')
await page.fill('input[type=password]', 'demo')
await page.click('button[type=submit]')
await page.waitForTimeout(1200)
await page.click('text=משתמשים והרשאות')
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/users.png` })
console.log('done')
await b.close()
