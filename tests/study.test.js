import assert from 'node:assert/strict'
import test from 'node:test'
import { connect } from '../plugin/worker/main.js'
import { createRound, grade, view } from '../plugin/worker/study.js'
import { loadDeck, normalizeDeck } from '../plugin/worker/provider.js'
import { sourceBytes, sourceUrl } from '../plugin/source.js'

const row = {
  id: '0123456789',
  level: 'N5',
  word: '雨',
  reading: 'あめ',
  meanings: ['rain'],
  pos: ['n'],
}
const deck = normalizeDeck([row, { ...row, id: '1234567890' }, { ...row, id: '2345678901' }])

test('normalization selects display fields and rejects ambiguous IDs and malformed content', () => {
  assert.equal(deck[0].example, null)
  assert.deepEqual(normalizeDeck([{ ...row, extra: 'unused' }]), [deck[0]])
  for (const rows of [
    [],
    [row, row],
    [{ ...row, meanings: [null] }],
    [{ ...row, examples: [null] }],
    [{ ...row, level: 'N1' }],
    [{ ...row, word: ' ' }],
    [{ ...row, id: 'wrong' }],
  ]) {
    assert.throws(() => normalizeDeck(rows), /invalid_deck/)
  }
})

test('provider rejects unexpected bytes, oversized bodies and failed HTTP responses', async () => {
  for (const [response, reason] of [
    [{ status: 200, body: 'a'.repeat(sourceBytes) }, /invalid_deck/],
    [{ status: 200, body: 'a'.repeat(sourceBytes * 2) }, /invalid_deck/],
    [{ status: 429 }, /busy_source/],
    [{ status: 404 }, /unavailable/],
  ]) {
    await assert.rejects(
      loadDeck({
        fetch(url) {
          assert.equal(url, sourceUrl)
          return response
        },
      }),
      reason,
    )
  }
})

test('front omits answers, a missed word repeats once and counts as one word', () => {
  const round = createRound(deck.slice(0, 1), 3)
  assert.equal(view(round).answer, null)
  assert.equal(view(round).reading, null)
  assert.throws(() => grade(round, 'good'), /stale/)
  for (let attempt = 0; attempt < 2; attempt++) {
    round.revealed = true
    grade(round, 'again')
  }
  assert.deepEqual(view(round), {
    page: 'complete',
    size: 1,
    counts: { again: 1, hard: 0, good: 0 },
  })
})

function worker(provider) {
  let listen
  const replies = new Map()
  connect(
    {
      storage: {
        async get() {
          return { found: false }
        },
        async set() {
          throw new Error('guest wrote storage')
        },
      },
      schedule: {
        every() {
          return () => {}
        },
      },
      ui: {
        onMessage(fn) {
          listen = fn
        },
        postMessage(reply) {
          replies.set(reply.id, reply)
        },
      },
    },
    provider,
  )
  return async (type, token, fields) => {
    const id = crypto.randomUUID()
    await listen({ id, type, token, ...fields })
    return replies.get(id)
  }
}

test('a delayed start is exclusive and a failed download can be retried', async () => {
  let attempts = 0
  let unblock
  const gate = new Promise((resolve) => {
    unblock = resolve
  })
  const send = worker(async () => {
    if (++attempts === 1) {
      await gate
      throw new Error('network')
    }
    return deck
  })
  const { token } = await send('sync')
  const pending = send('start', token, { size: 3 })
  assert.equal((await send('start', token, { size: 3 })).error, 'stale')
  unblock()
  assert.equal((await pending).state.page, 'setup')
  assert.equal((await send('start', token, { size: 3 })).state.page, 'card')
  assert.equal(attempts, 2)
})

test('panel reconnect and duplicate grade preserve the current word and summary', async () => {
  let fetches = 0
  const send = worker(async () => {
    fetches++
    return deck
  })
  let reply = await send('sync')
  assert.equal(fetches, 0)
  assert.equal((await send('start', reply.token, { size: 99 })).error, 'stale')
  reply = await send('start', reply.token, { size: 3 })
  for (let index = 0; index < 3; index++) {
    assert.deepEqual((await send('sync')).state, reply.state)
    assert.equal((await send('grade', reply.token, { rating: 'good' })).error, 'stale')
    reply = await send('flip', reply.token)
    const previous = reply.token
    reply = await send('grade', previous, { rating: 'good' })
    const duplicate = await send('grade', previous, { rating: 'good' })
    assert.equal(duplicate.error, 'stale')
    assert.deepEqual(duplicate.state, reply.state)
  }
  assert.deepEqual(reply.state.counts, { again: 0, hard: 0, good: 3 })
  await send('start', reply.token, { size: 5 })
  assert.equal(fetches, 1)
})

test('retrying during the provider cooldown does not send another request', async () => {
  let attempts = 0
  const send = worker(async () => {
    attempts++
    throw Object.assign(new Error('busy_source'), { retryAt: Date.now() + 5000 })
  })
  const { token } = await send('sync')
  for (let index = 0; index < 2; index++) {
    const reply = await send('start', token, { size: 3 })
    assert.equal(reply.error, 'busy_source')
    assert.equal(reply.state.page, 'setup')
  }
  assert.equal(attempts, 1)
})
