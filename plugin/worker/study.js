export const ratings = ['again', 'hard', 'good']
export const roundSizes = [3, 5, 10]

export function createRound(deck, size, random = Math.random) {
  const pool = deck.slice()
  const count = Math.min(pool.length, size)
  for (let index = 0; index < count; index++) {
    const pick = index + Math.floor(random() * (pool.length - index))
    ;[pool[index], pool[pick]] = [pool[pick], pool[index]]
  }
  return {
    queue: pool.slice(0, count),
    size: count,
    position: 0,
    answers: new Map(),
    repeated: new Set(),
    revealed: false,
    hint: false,
  }
}

export function grade(round, rating) {
  const card = round.queue[round.position]
  if (!card || !round.revealed || !ratings.includes(rating)) throw new Error('stale')
  round.answers.set(card.id, rating)
  if (rating === 'again' && !round.repeated.has(card.id)) {
    round.queue.splice(round.position + 3, 0, card)
    round.repeated.add(card.id)
  }
  round.position++
  round.revealed = false
  round.hint = false
}

export function view(round) {
  if (!round) return { page: 'setup' }
  const card = round.queue[round.position]
  if (!card) {
    const counts = { again: 0, hard: 0, good: 0 }
    for (const rating of round.answers.values()) counts[rating]++
    return { page: 'complete', size: round.size, counts }
  }
  return {
    page: 'card',
    size: round.size,
    reviewed: round.answers.size,
    position: round.position + 1,
    total: round.queue.length,
    word: card.word,
    hasHint: card.word !== card.reading,
    reading: round.hint || round.revealed ? card.reading : null,
    answer: round.revealed
      ? { meanings: card.meanings, pos: card.pos, example: card.example }
      : null,
  }
}
