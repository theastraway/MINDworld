// Headless verification of the MINDworld standalone via CDP.
// Boots chrome-headless-shell, opens /LandingV2, waits ~8s, dumps state.
// Run after `npm run preview`. Used by the F1+F2 extraction handoff.
import { spawn } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'
import http from 'node:http'

// Full Chrome for Testing supports WebGL via real GPU on macOS — required
// because the LandingV2 scene only mounts when WebGL is available, and the
// headless-shell variant falls back to swiftshader which our WebGL probe
// rejects.
const CHROME = '/Users/anthonyjconti/.cache/puppeteer/chrome/mac-148.0.7778.167/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const PORT = 9223

const proc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--no-sandbox',
  '--use-angle=metal',
  '--enable-webgl',
  '--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--window-size=1280,800',
  '--user-data-dir=/tmp/mindworld-chrome-profile',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

await wait(1500)

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, res => {
      let data = ''
      res.on('data', d => (data += d))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

const tabs = await getJSON('/json/version')
const wsUrl = tabs.webSocketDebuggerUrl

const { default: WS } = await import('ws')
const ws = new WS(wsUrl, { perMessageDeflate: false })
let id = 0
const pending = new Map()

await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej) })

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const myId = ++id
    pending.set(myId, { resolve, reject })
    const payload = { id: myId, method, params }
    if (sessionId) payload.sessionId = sessionId
    ws.send(JSON.stringify(payload))
  })
}

ws.on('message', raw => {
  const m = JSON.parse(raw.toString())
  if (m.id != null && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    if (m.error) reject(new Error(m.error.message))
    else resolve(m.result)
  }
})

const target = await send('Target.createTarget', { url: 'about:blank' })
const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
const sessionId = attached.sessionId

await send('Page.enable', {}, sessionId)
await send('Runtime.enable', {}, sessionId)
await send('Network.enable', {}, sessionId)
await send('Log.enable', {}, sessionId)

const networkUrls = []
const consoleMsgs = []
const runtimeErrors = []

ws.on('message', raw => {
  const m = JSON.parse(raw.toString())
  if (m.sessionId !== sessionId) return
  if (m.method === 'Network.requestWillBeSent') {
    networkUrls.push(m.params.request.url)
  } else if (m.method === 'Runtime.consoleAPICalled') {
    const args = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')
    consoleMsgs.push({ type: m.params.type, text: args })
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails
    const detail = d?.exception?.description || d?.text || JSON.stringify(m.params)
    const where = d?.url ? `${d.url}:${d.lineNumber || '?'}:${d.columnNumber || '?'}` : ''
    runtimeErrors.push(`${detail} @ ${where}`)
  } else if (m.method === 'Log.entryAdded') {
    if (m.params.entry.level === 'error' || m.params.entry.level === 'warning') {
      consoleMsgs.push({ type: 'log:' + m.params.entry.level, text: m.params.entry.text })
    }
  }
})

await send('Page.navigate', { url: 'http://localhost:4173/LandingV2' }, sessionId)
await wait(8000)

const evalExpr = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)
const title = (await evalExpr('document.title')).result.value
const canvasCount = (await evalExpr('document.querySelectorAll("canvas").length')).result.value
const loaderVisible = (await evalExpr('!!document.querySelector("[role=\'status\']")')).result.value
const srOnlyHeading = (await evalExpr('document.querySelector(".sr-only h1")?.textContent || null')).result.value
const introVisible = (await evalExpr('!!document.querySelector("[data-garage-intro], [aria-label*=\'intro\' i]")')).result.value
const webglSupported = (await evalExpr(`(() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })()`)).result.value
const bodyHTML = (await evalExpr('document.body.innerHTML.length')).result.value
const rootHTML = (await evalExpr('document.getElementById("root")?.innerHTML?.length || 0')).result.value
const reducedMotion = (await evalExpr('window.matchMedia("(prefers-reduced-motion: reduce)").matches')).result.value

const out = {
  title,
  canvasCount,
  loaderVisible,
  introVisible,
  srOnlyHeading,
  webglSupported,
  reducedMotion,
  bodyHTMLBytes: bodyHTML,
  rootHTMLBytes: rootHTML,
  totalRequests: networkUrls.length,
  networkUrlSample: networkUrls.slice(0, 30),
  fetchedWorldStats: networkUrls.some(u => u.includes('/public/world-stats')),
  fetchedSubscribe: networkUrls.some(u => u.includes('/public/landingv2/subscribe')),
  worldStatsUrls: networkUrls.filter(u => u.includes('world-stats')),
  errors: runtimeErrors,
  warningSample: consoleMsgs.filter(c => c.type === 'error' || c.type === 'log:error').slice(0, 10),
}

console.log(JSON.stringify(out, null, 2))

ws.close()
proc.kill('SIGTERM')
