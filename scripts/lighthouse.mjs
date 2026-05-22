// Runs Lighthouse against the live production deployment and prints the
// performance / accessibility / SEO / best-practices scores. Used by the
// F1+F2 extraction handoff to confirm the standalone is fast.
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'

const URL_ = process.env.LH_URL || 'https://mindworld.vercel.app/LandingV2'
const OUT = '/tmp/mw-lh.json'

// Lighthouse needs the FULL Chrome binary (not chrome-headless-shell)
// because it relies on DevTools protocol features the shell strips. The
// `Google Chrome for Testing.app` bundle provides exactly that.
const CHROME_PATH = process.env.CHROME_PATH ||
  '/Users/anthonyjconti/.cache/puppeteer/chrome/mac-148.0.7778.167/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const proc = spawn('npx', [
  'lighthouse',
  URL_,
  '--only-categories=performance,accessibility,seo,best-practices',
  '--output=json',
  `--output-path=${OUT}`,
  '--quiet',
  // `--headless=old` reliably paints content on macOS Lighthouse runs;
  // `--headless=new` returns NO_FCP on heavy Three-scene pages because
  // the compositor short-circuits before first paint.
  '--chrome-flags=--headless --no-sandbox --hide-scrollbars --disable-dev-shm-usage',
  '--throttling-method=devtools',
  '--preset=desktop',
  '--max-wait-for-load=60000',
], { stdio: 'inherit', env: { ...process.env, CHROME_PATH } })

const exitCode = await new Promise((res) => proc.on('exit', res))
if (exitCode !== 0) {
  console.error('Lighthouse exited with code', exitCode)
  process.exit(exitCode || 1)
}

const raw = JSON.parse(await fs.readFile(OUT, 'utf8'))
const scores = {}
for (const [k, v] of Object.entries(raw.categories || {})) {
  scores[k] = v.score == null ? null : Math.round(v.score * 100)
}
const metrics = {
  fcp: raw.audits?.['first-contentful-paint']?.displayValue,
  lcp: raw.audits?.['largest-contentful-paint']?.displayValue,
  tbt: raw.audits?.['total-blocking-time']?.displayValue,
  cls: raw.audits?.['cumulative-layout-shift']?.displayValue,
  si:  raw.audits?.['speed-index']?.displayValue,
  tti: raw.audits?.['interactive']?.displayValue,
  totalByteWeight: raw.audits?.['total-byte-weight']?.displayValue,
}
console.log(JSON.stringify({ url: URL_, scores, metrics }, null, 2))
