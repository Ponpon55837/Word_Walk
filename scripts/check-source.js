import assert from 'node:assert/strict'
import { loadDeck } from '../plugin/worker/provider.js'
import { revision, sourceBytes, sourceSha256 } from '../plugin/source.js'

const deck = await loadDeck({
  async fetch(url) {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) })
    return { status: response.status, body: await response.text() }
  },
})
assert.equal(deck.length, 674)
console.log(
  `OpenJLPT ${revision}: ${deck.length} N5 entries, ${sourceBytes} bytes, SHA-256 ${sourceSha256}`,
)
