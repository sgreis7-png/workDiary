import { chromium } from 'playwright'

const OUT = process.argv[2] || '.'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const go = async (path, name, wait = 900) => {
  await page.goto('http://localhost:5173' + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot', name)
}

// login
await go('/login', '01-login')
// sign in
await page.click('button[type=submit]')
await page.waitForTimeout(1400)
await page.screenshot({ path: `${OUT}/02-logbook.png` })
console.log('shot 02-logbook')

await go('/new', '03-new-entry')
await go('/entry/e1', '04-detail')
await go('/search', '05-search')
// run a search
await page.click('button:has-text("חיפוש")').catch(() => {})
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/06-search-results.png` })
console.log('shot 06-search-results')
await go('/admin/fields', '07-form-builder')
await go('/admin/users', '08-users')

// english + mobile
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await page.click('.lang-toggle button:has-text("EN")').catch(() => {})
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/09-login-en.png` })
console.log('shot 09-login-en')

const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await m.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await m.waitForTimeout(600)
await m.click('button[type=submit]')
await m.waitForTimeout(1500)
await m.screenshot({ path: `${OUT}/10-mobile-logbook.png` })
console.log('shot 10-mobile')

await b.close()
console.log('done')
