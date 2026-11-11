// Run against the host's offscreen e2e-isolated-electron.mjs launcher.
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve, basename } from 'node:path'
import { writeFile } from 'node:fs/promises'

const [inspect, debug, isolatedRoot] = process.argv.slice(2)
for (const port of [inspect, debug]) assert.match(port ?? '', /^\d{1,5}$/)
assert.match(basename(isolatedRoot), /^agent-pets-e2e-[a-zA-Z0-9]+$/)

async function target(port, predicate) {
  const url = `http://127.0.0.1:${port}/json/list`
  const targets = await (await fetch(url, { signal: AbortSignal.timeout(3000) })).json()
  return targets.find(predicate)
}

async function command(page, method, params) {
  const socket = page.connection ?? new WebSocket(page.webSocketDebuggerUrl)
  try {
    return await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('Electron evaluation timed out')), 15000)
      const send = () => socket.send(JSON.stringify({ id: 1, method, params }))
      socket.onerror = () => {
        clearTimeout(timer)
        fail(new Error('Inspector disconnected'))
      }
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== 1) return
        clearTimeout(timer)
        if (message.error || message.result.exceptionDetails)
          fail(
            new Error(
              message.error?.message ||
                message.result?.exceptionDetails?.exception?.description ||
                'Evaluation failed',
            ),
          )
        else done(message.result)
      }
      if (socket.readyState === WebSocket.OPEN) send()
      else socket.onopen = send
    })
  } finally {
    if (!page.connection) socket.close()
  }
}

async function evaluate(page, expression) {
  const reply = await command(page, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  return reply.result.value
}

async function waitFor(read, description) {
  const deadline = Date.now() + 22000
  do {
    const value = await read()
    if (value) return value
    await delay(200)
  } while (Date.now() < deadline)
  throw new Error(`Timed out waiting for ${description}`)
}

const main = await target(inspect, (item) => item.type === 'node')
assert.equal(await evaluate(main, 'globalThis.__agentPetsE2E?.root'), resolve(isolatedRoot))
const temp = await evaluate(main, "process.mainModule.require('node:os').tmpdir()")
assert.equal(resolve(temp, basename(isolatedRoot)), resolve(isolatedRoot))
const args = await evaluate(main, 'process.argv.concat(process.execArgv)')
assert.ok(args.includes(`--remote-debugging-port=${debug}`))
const panel = await target(debug, (item) => item.url === 'agent-pets://app/index.html#panel')
const pet = await target(debug, (item) => item.url === 'agent-pets://app/index.html')
const archive = resolve('build', 'word-walk.agentpet-plugin')

async function hostCall(name, ...args) {
  const result = await evaluate(panel, `window.electronAPI.${name}(...${JSON.stringify(args)})`)
  assert.equal(result?.ok, true, `${name}: ${result?.error}`)
  return result.value
}

await hostCall('setPluginGlobalPreferences', { pluginsEnabled: true })
async function install(file, expectedKind) {
  await evaluate(main, `globalThis.__agentPetsE2E.dialogQueue.push(${JSON.stringify(file)})`)
  const plan = await hostCall('selectPluginArchive')
  assert.equal(plan.pluginId, 'word-walk')
  assert.equal(plan.signatureStatus, 'valid')
  assert.equal(plan.signatureFingerprint, '42436e4d75b74141')
  assert.equal(plan.kind, expectedKind)
  assert.equal(plan.requiresReconsent, false)
  await hostCall(
    'installPluginPlan',
    plan.token,
    plan.requiresReconsent,
    Boolean(plan.requiresSignatureConfirmation),
  )
}
const previous = process.argv[5]
await install(previous ? resolve(previous) : archive, 'new')
await hostCall('setPluginInstancePreferences', 'word-walk', { enabled: true })
await evaluate(panel, 'window.electronAPI.setPanelBlurLock({ pinned: true })')
console.log('Installed and enabled the local package in the isolated profile.')
const open = () => evaluate(pet, 'window.electronAPI.openPluginPanelFromPet("word-walk")')
assert.ok(await open())

const getPage = () =>
  target(
    debug,
    (item) => item.url.startsWith('agent-pets://plugin/') && item.url.endsWith('/ui/index.html'),
  )
let page = await waitFor(getPage, 'plugin panel')
page.connection = new WebSocket(page.webSocketDebuggerUrl)
const click = async (label) => {
  const selector = `Array.from(document.querySelectorAll('button')).find(b => b.textContent === ${JSON.stringify(label)} && !b.disabled)`
  await waitFor(() => evaluate(page, `Boolean(${selector})`), label)
  await evaluate(page, `${selector}.click()`)
}
await click('題庫與授權')
assert.ok(await evaluate(page, "document.body.textContent.includes('Jonathan Waller')"))
await click('返回練習')
await click('開始練習')
console.log('Requested a round from the installed panel.')
await waitFor(
  () => evaluate(page, "document.activeElement?.classList.contains('word')"),
  'focused prompt',
)
await command(page, 'Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: ' ',
  code: 'Space',
  windowsVirtualKeyCode: 32,
})
await command(page, 'Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: ' ',
  code: 'Space',
  windowsVirtualKeyCode: 32,
})
await waitFor(
  () => evaluate(page, "Boolean(document.querySelector('p[lang=en]'))"),
  'keyboard reveal',
)
const word = await evaluate(page, "document.querySelector('.word').textContent")
assert.ok(await evaluate(page, "document.querySelector('p[lang=en]').textContent.length > 0"))
console.log('Verified archive installation, real network download, disclosure and answer reveal.')
const size = { width: 540, height: 650, deviceScaleFactor: 1, mobile: false }
await command(page, 'Emulation.setDeviceMetricsOverride', size)
await waitFor(() => evaluate(page, 'innerWidth === 540'), '540px viewport')
await evaluate(page, 'document.activeElement.blur()')
const screenshot = await command(page, 'Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
})
await writeFile(resolve('build', 'word-walk-card.png'), Buffer.from(screenshot.data, 'base64'))
await command(page, 'Emulation.setDeviceMetricsOverride', { ...size, width: 360 })
await waitFor(() => evaluate(page, 'innerWidth === 360'), '360px viewport')
assert.ok(await evaluate(page, 'document.documentElement.scrollWidth <= 360'))
await command(page, 'Emulation.clearDeviceMetricsOverride', {})
console.log('Verified keyboard reveal and 360px width; saved a screenshot of the answer.')

// Reload the isolated panel to exercise listener registration and worker resynchronization.
await evaluate(page, 'setTimeout(() => location.reload(), 10); true')
await delay(650)
await waitFor(
  () => evaluate(page, "document.querySelector('.word')?.textContent === " + JSON.stringify(word)),
  'same word after panel reload',
)
await click('再練一次')
for (let index = 0; index < 5; index++) {
  await click('顯示答案')
  await click('記得')
}
await waitFor(
  () => evaluate(page, "document.querySelector('h2')?.textContent === '走完這一回了。'"),
  'round completion',
)
assert.ok(await evaluate(page, "document.body.textContent.includes('記得 5')"))
await click('English')
assert.ok(await evaluate(page, "document.body.textContent.includes('Remembered 5')"))
console.log('Verified round recovery, one repeat, five distinct ratings and English summary.')
await evaluate(
  page,
  "Array.from(document.querySelectorAll('#content button')).find(b => b.textContent === 'Today').click()",
)
await click('Start daily practice')
await click('Reveal answer')
await waitFor(
  () =>
    evaluate(
      page,
      "Array.from(document.querySelectorAll('button')).some(b => b.textContent.startsWith('Remembered ·'))",
    ),
  'review date',
)
await evaluate(
  page,
  "Array.from(document.querySelectorAll('button')).find(b => b.textContent.startsWith('Remembered ·')).click()",
)
await waitFor(
  () => evaluate(page, "document.body.textContent.includes('Card 2 of 5')"),
  'saved grade',
)
const resumeWord = await evaluate(page, "document.querySelector('.word').textContent")
await click('Vocabulary')
await waitFor(
  () => evaluate(page, "document.querySelectorAll('#content article').length === 1"),
  'word in vocabulary',
)
await click('Settings & backup')
await click('Show backup text')
await waitFor(
  () => evaluate(page, "document.querySelector('textarea')?.value.includes('schema')"),
  'backup text',
)
assert.equal(
  await evaluate(page, "JSON.parse(document.querySelector('textarea').value).plan.position"),
  1,
)
await click('Preview restore')
await click('Replace local progress')
await waitFor(
  () => evaluate(page, "document.body.textContent.includes('Local progress restored')"),
  'confirmed restore',
)
page.connection.close()
await hostCall('setPluginInstancePreferences', 'word-walk', { enabled: false })
if (previous) await install(archive, 'update')
await hostCall('setPluginInstancePreferences', 'word-walk', { enabled: true })
assert.ok(await open())
page = await waitFor(getPage, 'restarted plugin panel')
page.connection = new WebSocket(page.webSocketDebuggerUrl)
await click('接續今天的進度')
await waitFor(
  () =>
    evaluate(
      page,
      "document.querySelector('.word')?.textContent === " + JSON.stringify(resumeWord),
    ),
  'saved second card',
)
console.log('Verified Ed25519, daily plan, vocabulary, backup restore and worker restart.')
await click('小測驗')
async function choose(label, value) {
  await evaluate(
    page,
    `(() => { const el=Array.from(document.querySelectorAll('label')).find(l=>l.firstChild.textContent===${JSON.stringify(label)}).querySelector('select');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change')); })()`,
  )
}
for (const language of ['ja', 'en']) {
  await choose('學習語言', language)
  await choose('題數', '3')
  await click('開始測驗')
  for (let i = 0; i < 3; i++) {
    await waitFor(
      () =>
        evaluate(
          page,
          "Boolean(document.querySelector('.quiz-options button:enabled, #content form input:enabled'))",
        ),
      'answerable quiz',
    )
    await evaluate(
      page,
      `(() => { const option=document.querySelector('.quiz-options button'); if(option) option.click(); else {const input=document.querySelector('#content form input');input.value='practice';input.form.requestSubmit()} })()`,
    )
    await click(i === 2 ? '查看結果' : '下一題')
  }
  await waitFor(
    () => evaluate(page, "Boolean(document.querySelector('.quiz-score'))"),
    'quiz results',
  )
  await click('再做一組')
  await waitFor(
    () =>
      evaluate(
        page,
        "Boolean(document.querySelector('#content select:enabled')) && !document.querySelector('.quiz-score')",
      ),
    'quiz setup',
  )
}
await click('今天')
assert.equal(await evaluate(page, "document.querySelector('.word').textContent"), resumeWord)
console.log('Verified Japanese and English mixed quizzes and preserved daily progress.')
page.connection.close()

await hostCall('setPluginInstancePreferences', 'word-walk', { enabled: false })
await hostCall('removeInstalledPlugin', 'word-walk', false)
await evaluate(
  main,
  "setTimeout(() => process.mainModule.require('electron').app.quit(), 50); true",
)
