import { sourceBytes, sourceSha256, sourceUrl } from '../source.js'

function invalid() {
  throw new Error('invalid_deck')
}

function shortText(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) invalid()
  return value
}

function textList(value, count, limit) {
  if (!Array.isArray(value) || !value.length || value.length > count) invalid()
  return value.map((item) => shortText(item, limit))
}

export function normalizeDeck(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000) invalid()
  const ids = new Set()
  return rows.map((row) => {
    if (
      row?.level !== 'N5' ||
      typeof row.id !== 'string' ||
      !/^[0-9a-f]{10}$/.test(row.id) ||
      ids.has(row.id)
    )
      invalid()
    ids.add(row.id)
    let example = null
    if (row.examples !== undefined) {
      if (!Array.isArray(row.examples) || row.examples.length > 4) invalid()
      const first = row.examples[0]
      if (first !== undefined) {
        if (!Number.isSafeInteger(first?.tatoeba_id) || first.tatoeba_id <= 0) invalid()
        example = { ja: shortText(first.ja, 1024), sentenceId: first.tatoeba_id }
      }
    }
    return {
      id: row.id,
      word: shortText(row.word, 64),
      reading: shortText(row.reading, 64),
      meanings: textList(row.meanings, 12, 512),
      pos: textList(row.pos, 12, 32),
      example,
    }
  })
}

export async function loadDeck(net) {
  const response = await net.fetch(sourceUrl)
  if (response.status === 429) {
    const header = response.headers?.['retry-after']
    const seconds = /^\d+$/.test(header) ? Number(header) : (Date.parse(header) - Date.now()) / 1000
    const cooldown = Number.isFinite(seconds) ? Math.min(300, Math.max(1, seconds)) : 30
    throw Object.assign(new Error('busy_source'), { retryAt: Date.now() + cooldown * 1000 })
  }
  if (response.status !== 200) throw new Error('unavailable')
  if (typeof response.body !== 'string' || response.body.length > Math.ceil(sourceBytes / 3) * 4)
    invalid()
  const bytes = response.isBase64Encoded
    ? Uint8Array.from(atob(response.body), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(response.body)
  if (bytes.length !== sourceBytes) invalid()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  if (hash !== sourceSha256) invalid()
  return normalizeDeck(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
}
