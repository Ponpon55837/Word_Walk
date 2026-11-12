import assert from 'node:assert/strict'
import test from 'node:test'
import { connect } from '../plugin/worker/main.js'
import {
  freshProfile,
  localDay,
  nextReview,
  parseBackup,
  planDay,
  profileKey,
} from '../plugin/worker/profile.js'

const deck = Array.from({ length: 16 }, (_, i) => ({
  id: i.toString(16).padStart(10, '0'),
  word: '語' + i,
  reading: 'ご',
  meanings: ['word'],
  pos: ['n'],
  example: null,
}))
function host() {
  const values = new Map()
  let date = new Date(2026, 10, 11, 18, 15)
  let fail = false
  let receive, tick, token
  const messages = new Map()
  const effects = { feed: [], react: [], badge: [] }
  function restart() {
    connect(
      {
        ui: {
          onMessage(fn) {
            receive = fn
            return () => {}
          },
          postMessage(m) {
            messages.set(m.id, m)
          },
        },
        net: {},
        storage: {
          async get(key) {
            return { found: values.has(key), value: structuredClone(values.get(key)) }
          },
          async set(key, v) {
            if (fail) throw Error('quota')
            values.set(key, structuredClone(v))
          },
        },
        pet: {
          async react(x) {
            effects.react.push(x)
          },
        },
        feed: {
          async notify(x) {
            effects.feed.push(x)
          },
        },
        badge: {
          async set(x) {
            effects.badge.push(x)
          },
        },
        schedule: {
          every(sec, fn) {
            assert.equal(sec, 60)
            tick = fn
            return () => {}
          },
        },
      },
      async () => deck,
      () => date,
    )
  }
  async function send(type, fields = {}) {
    const id = crypto.randomUUID()
    await receive({ type, id, token, ...fields })
    const reply = messages.get(id)
    token = reply.token
    return reply
  }
  restart()
  return {
    send,
    values,
    restart,
    tick: () => tick(),
    effects,
    fail: (v) => {
      fail = v
    },
    nextDay: () => {
      date = new Date(2026, 10, 12, 18, 15)
    },
  }
}

test('civil dates, zero new words, due priority and interval cap', () => {
  const day = localDay(new Date(2024, 1, 29, 23, 59))
  assert.equal(day + 1, localDay(new Date(2024, 2, 1, 0, 1)))
  const p = freshProfile()
  p.prefs.goal = 0
  assert.deepEqual(planDay(p, deck, day).ids, [])
  p.words[deck[0].id] = [6, day, day - 120, 'good', false]
  assert.deepEqual(planDay(p, deck, day).ids, [deck[0].id])
  assert.deepEqual(nextReview(p.words[deck[0].id], 'good', day), { stage: 6, due: day + 120 })
})

test('daily commits are atomic, resume after restart, and repeated cards schedule only once', async () => {
  const h = host()
  await h.send('sync')
  await h.send('daily')
  await h.send('hint')
  await h.send('flip')
  h.fail(true)
  assert.equal((await h.send('grade', { rating: 'again' })).error, 'storage_error')
  assert.equal(h.values.get(profileKey).plan.position, 0)
  h.fail(false)
  await h.send('grade', { rating: 'again' })
  h.restart()
  await h.send('sync')
  let reply = await h.send('daily')
  assert.equal(reply.state.position, 2)
  while (reply.state.page === 'card') {
    await h.send('flip')
    reply = await h.send('grade', { rating: 'good' })
  }
  assert.equal(reply.state.size, 5)
  assert.equal(h.effects.react.length, 1)
  const first = h.values.get(profileKey).words[deck[0].id]
  assert.equal(first[0], 0)
  assert.equal(first[1], first[2] + 1)
  h.nextDay()
  assert.equal((await h.send('daily')).state.total, 10)
  assert.equal((await h.send('library', { query: '', filter: 'due', page: 0 })).detail.total, 5)
})

test('backup preview, explicit replacement, undo, and corrupt profile recovery', async () => {
  const h = host()
  await h.send('sync')
  await h.send('daily')
  const original = (await h.send('export')).detail
  assert.deepEqual(parseBackup(original), h.values.get(profileKey))
  assert.throws(() => parseBackup(original.replace('"schema":1', '"schema":2')))
  const preview = await h.send('resetPreview')
  assert.equal((await h.send('restore', { confirm: 'wrong' })).error, 'stale')
  await h.send('restore', { confirm: preview.detail.id })
  assert.equal(h.values.get(profileKey).plan, null)
  const previous = await h.send('previous')
  await h.send('restore', { confirm: previous.detail.id })
  assert.deepEqual(h.values.get(profileKey), JSON.parse(original))
  h.values.set(profileKey, { schema: 3 })
  h.restart()
  assert.equal((await h.send('sync')).state.damaged, true)
  assert.equal((await h.send('daily')).error, 'damaged')
  assert.deepEqual(h.values.get(profileKey), { schema: 3 })
  const valid = await h.send('restorePreview', { text: original })
  assert.equal((await h.send('restore', { confirm: valid.detail.id })).state.damaged, false)
})

test('badge visibility persists, clears on save, and defaults to visible for legacy backups', async () => {
  const h = host()
  const legacy = freshProfile()
  delete legacy.prefs.showBadge
  const day = localDay(new Date(2026, 10, 11))
  legacy.words[deck[0].id] = [0, day, day - 1, 'good', false]
  h.values.set(profileKey, legacy)
  const { state } = await h.send('sync')
  assert.equal(state.prefs.showBadge, true)
  await h.tick()
  const visible = { text: '1', tone: 'info' }
  assert.deepEqual(h.effects.badge, [visible])
  const prefs = { ...state.prefs, showBadge: false }
  assert.equal((await h.send('prefs', { prefs })).error, null)
  assert.deepEqual(h.effects.badge, [visible, null])
  h.restart()
  const afterRestart = (await h.send('sync')).state
  assert.equal(afterRestart.due, 1)
  assert.equal(afterRestart.prefs.showBadge, false)
  await h.tick()
  assert.equal(h.effects.badge.at(-1), null)
  assert.equal(
    (await h.send('prefs', { prefs: { ...prefs, showBadge: 'false' } })).error,
    'invalid_backup',
  )
  const preview = await h.send('restorePreview', { text: JSON.stringify(legacy) })
  await h.send('restore', { confirm: preview.detail.id })
  assert.deepEqual(h.effects.badge.at(-1), visible)
  const reset = await h.send('resetPreview')
  await h.send('restore', { confirm: reset.detail.id })
  assert.equal(h.effects.badge.at(-1), null)
})

test('reminders are opt-in and deduplicated across worker restarts', async () => {
  const h = host()
  const { state } = await h.send('sync')
  await h.tick()
  assert.equal(h.effects.feed.length, 0)
  await h.send('prefs', { prefs: { ...state.prefs, reminder: true } })
  await h.tick()
  h.restart()
  await h.tick()
  assert.equal(h.effects.feed.length, 1)
  h.nextDay()
  await h.tick()
  assert.equal(h.effects.feed.length, 2)
})
