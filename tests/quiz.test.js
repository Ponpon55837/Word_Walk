import assert from 'node:assert/strict'
import test from 'node:test'
import { quizFormats } from '../plugin/quiz-formats.js'
import { englishWords } from '../plugin/worker/english.js'
import { makeQuiz, answerQuiz, nextQuestion, quizView } from '../plugin/worker/quiz.js'
import { connect } from '../plugin/worker/main.js'

const japanese = [
  ['九', 'きゅう', 'nine'],
  ['句', 'く', 'phrase'],
  ['四', 'よん', 'four'],
  ['川', 'かわ', 'river'],
  ['山', 'やま', 'mountain'],
  ['犬', 'いぬ', 'dog'],
  ['猫', 'ねこ', 'cat'],
  ['きょう', 'きょう', 'today'],
  ['本', 'ほん', 'book'],
  ['雨', 'あめ', 'rain'],
  ['花', 'はな', 'flower'],
  ['七', 'しち', 'seven'],
].map(([word, reading, meaning]) => ({
  word,
  reading,
  meanings: [meaning],
  otherReadings: word === '九' ? ['く'] : [],
}))

test('English content has distinct words, complete original sentences and three curated distractors', () => {
  assert.equal(englishWords.length, 48)
  assert.equal(new Set(englishWords.map((c) => c.word)).size, 48)
  assert.equal(new Set(englishWords.map((c) => c.meaning)).size, 48)
  for (const c of englishWords) {
    assert.match(c.word, /^[a-z]+$/)
    assert.equal(c.sentence.split('____').length, 2)
    assert.equal(new Set([c.word, ...c.alternatives]).size, 4)
    assert.ok(c.alternatives.every((word) => englishWords.some((other) => other.word === word)))
  }
})

test('each format can fill ten questions, mixed rounds balance formats and avoid repeated prompts', () => {
  for (const [language, formats] of Object.entries(quizFormats)) {
    for (const mode of ['mixed', ...formats]) {
      const round = makeQuiz(language, mode, 10, japanese, () => 0.42)
      assert.equal(round.questions.length, 10)
      const counts = new Map()
      for (const q of round.questions) {
        counts.set(q.format, (counts.get(q.format) ?? 0) + 1)
        if (q.options) {
          assert.equal(new Set(q.options).size, 4)
          assert.ok(q.options.includes(q.answer))
        }
        if (q.format === 'reading') {
          assert.notEqual(q.prompt, 'きょう')
          if (q.prompt === '九') assert.ok(!q.options.includes('く'))
        }
        if (q.format === 'spelling')
          assert.equal(q.clue.split(' · ').sort().join(''), [...q.answer].sort().join(''))
      }
      if (mode === 'mixed') assert.deepEqual([...counts.values()].sort(), [3, 3, 4])
      else assert.equal(new Set(round.questions.map((q) => q.prompt)).size, 10)
    }
  }
})

test('answers stay in the worker until submitted, input is bounded, and each question scores once', () => {
  const round = makeQuiz('en', 'spelling', 3, [], () => 0.33)
  assert.equal(Object.hasOwn(quizView(round), 'answer'), false)
  assert.equal(quizView(round).feedback, null)
  assert.throws(() => nextQuestion(round), /stale/)
  for (const invalid of [null, 42, {}, '', '   ', 'a'.repeat(65)])
    assert.throws(() => answerQuiz(round, invalid), /stale/)
  answerQuiz(round, '  ' + round.questions[0].answer.toUpperCase() + '  ')
  assert.equal(quizView(round).feedback.correct, true)
  assert.throws(() => answerQuiz(round, round.questions[0].answer), /stale/)
  nextQuestion(round)
  answerQuiz(round, 'wrong')
  nextQuestion(round)
  answerQuiz(round, round.questions[2].answer)
  nextQuestion(round)
  assert.equal(quizView(round).score, 2)
  assert.equal(quizView(round).missed.length, 1)
  assert.equal(quizView(round).missed[0].given, 'wrong')
  assert.throws(() => nextQuestion(round), /stale/)
})

test('invalid language, format, size, option or insufficient safe choices are rejected', () => {
  for (const args of [
    ['toString', 'mixed', 3],
    ['ja', 'cloze', 3],
    ['en', 'mixed', '3'],
    [{}, 'meaning', 5],
  ]) {
    assert.throws(() => makeQuiz(...args, japanese), /stale/)
  }
  assert.throws(() => makeQuiz('ja', 'reading', 3, japanese.slice(0, 2)), /quiz_unavailable/)
  const round = makeQuiz('en', 'cloze', 3, [])
  assert.throws(() => answerQuiz(round, 'unlisted answer'), /stale/)
})

test('English quiz works offline without progress writes and stale submissions never change scores', async () => {
  let listener, reply
  let fetches = 0,
    writes = 0
  connect(
    {
      ui: {
        onMessage(fn) {
          listener = fn
        },
        postMessage(m) {
          reply = m
        },
      },
      schedule: { every() {} },
      storage: {
        async get() {
          return { found: false }
        },
        async set() {
          writes++
        },
      },
    },
    async () => {
      fetches++
      throw Error('offline')
    },
  )
  async function send(type, fields = {}) {
    await listener({ type, id: crypto.randomUUID(), token: reply?.token, ...fields })
    return reply
  }
  await send('sync')
  const before = (await send('export')).detail
  await send('quizStart', { language: 'en', format: 'meaning', size: 3 })
  const token = reply.token
  await send('quizAnswer', { answer: reply.state.quiz.options[0] })
  const feedback = reply.state.quiz.feedback
  await send('quizNext', { token })
  assert.equal(reply.error, 'stale')
  assert.deepEqual(reply.state.quiz.feedback, feedback)
  await send('quizExit')
  assert.equal((await send('export')).detail, before)
  assert.equal(fetches, 0)
  assert.equal(writes, 0)
})
