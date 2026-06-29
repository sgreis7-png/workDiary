import { chromium } from 'playwright'
const OUT = process.argv[2] || '.'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
// switch to register mode (the quiet link at bottom)
await page.click('.btn--quiet')
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/R1-register.png` })
console.log('shot register')

// try an un-authorized email to show the gate
await page.fill('input[type=email]', 'stranger@gmail.com')
await page.fill('input[type=password] >> nth=0', 'secret1')
await page.fill('input[type=password] >> nth=1', 'secret1')
await page.click('button[type=submit]')
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/R2-register-blocked.png` })
console.log('shot blocked')

// now admin users screen (sign in as admin first)
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await page.fill('input[type=email]', 'pavel@agrotop.co.il')
await page.fill('input[type=password]', 'demo')
await page.click('button[type=submit]')
await page.waitForTimeout(1200)
await page.goto('http://localhost:5173/admin/users', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/R3-users.png` })
console.log('shot users')

await b.close()
console.log('done')
