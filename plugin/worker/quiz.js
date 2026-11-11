import { quizFormats, supportsQuiz } from '../quiz-formats.js'
import { englishWords } from './english.js'
import { roundSizes } from './study.js'

function shuffled(values, random) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const normalize = (value) => value.normalize('NFKC').trim().toLowerCase()
const hasKanji = (word) => /\p{Script=Han}/u.test(word)

function choices(answer, candidates, excluded, random) {
  const seen = new Set([...excluded, answer].map(normalize))
  const options = [answer]
  for (const candidate of candidates) {
    const key = normalize(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    options.push(candidate)
    if (options.length === 4) return shuffled(options, random)
  }
  return null
}

function englishQuestion(card, format, pool, random) {
  const { word, meaning, sentence, alternatives } = card
  const explanation = word + ' · ' + meaning
  if (format === 'cloze')
    return {
      format,
      prompt: sentence,
      promptLang: 'en',
      answer: word,
      options: shuffled([word, ...alternatives], random),
      optionLang: 'en',
      explanation: sentence.replace('____', word) + ' · ' + meaning,
    }
  if (format === 'spelling') {
    const letters = shuffled(word, random)
    if (letters.join('') === word) letters.push(letters.shift())
    return {
      format,
      prompt: meaning,
      promptLang: 'zh-Hant',
      clue: letters.join(' · '),
      answer: word,
      options: null,
      optionLang: 'en',
      explanation,
    }
  }
  return {
    format,
    prompt: word,
    promptLang: 'en',
    answer: meaning,
    optionLang: 'zh-Hant',
    options: choices(
      meaning,
      pool.map((other) => other.meaning),
      [],
      random,
    ),
    explanation,
  }
}

function japaneseQuestion(card, format, pool, random) {
  const { word, reading, meanings } = card
  if (format !== 'meaning' && !hasKanji(word)) return null
  const sameWord = pool.filter((other) => other.word === word)
  const explanation = word + ' · ' + reading + ' · ' + meanings.join(', ')
  let answer, prompt, clue, options
  if (format === 'meaning') {
    answer = meanings[0]
    prompt = word
    clue = reading === word ? '' : reading
    options = choices(
      answer,
      pool.map((other) => other.meanings[0]),
      sameWord.flatMap((other) => other.meanings),
      random,
    )
  } else if (format === 'reading') {
    answer = reading
    prompt = word
    clue = meanings.join(', ')
    options = choices(
      answer,
      pool.map((other) => other.reading),
      sameWord.flatMap((other) => [other.reading, ...(other.otherReadings ?? [])]),
      random,
    )
  } else {
    answer = word
    prompt = reading
    clue = meanings.join(', ')
    options = choices(
      answer,
      pool
        .filter((other) => other.reading !== reading && hasKanji(other.word))
        .map((other) => other.word),
      card.otherForms ?? [],
      random,
    )
  }
  if (!options) return null
  return {
    format,
    prompt,
    clue,
    promptLang: 'ja',
    optionLang: format === 'meaning' ? 'en' : 'ja',
    options,
    answer,
    explanation,
  }
}

export function makeQuiz(language, mode, size, japaneseDeck, random = Math.random) {
  if (!supportsQuiz(language, mode) || !roundSizes.includes(size)) throw new Error('stale')
  const formats = mode === 'mixed' ? shuffled(quizFormats[language], random) : [mode]
  const pool = shuffled(language === 'en' ? englishWords : japaneseDeck, random)
  const questions = []
  const used = new Set()
  for (let index = 0; index < size; index++) {
    const format = formats[index % formats.length]
    let question
    // Rotate the distractor pool per question so adjacent cards do not share the same options.
    const alternatives = shuffled(pool, random)
    for (const card of pool) {
      if (used.has(card.word)) continue
      question =
        language === 'en'
          ? englishQuestion(card, format, alternatives, random)
          : japaneseQuestion(card, format, alternatives, random)
      if (!question) continue
      used.add(card.word)
      questions.push(question)
      break
    }
    if (!question) throw new Error('quiz_unavailable')
  }
  return { language, mode, questions, position: 0, results: [] }
}

export function answerQuiz(round, input) {
  const question = round?.questions[round.position]
  if (
    !question ||
    round.results.length !== round.position ||
    typeof input !== 'string' ||
    !input.trim() ||
    input.length > 512 ||
    (question.options && !question.options.includes(input)) ||
    (!question.options && input.length > 64)
  )
    throw new Error('stale')
  round.results.push({
    given: input.trim(),
    correct: normalize(input) === normalize(question.answer),
  })
}

export function nextQuestion(round) {
  if (
    !round ||
    round.position >= round.questions.length ||
    round.results.length !== round.position + 1
  )
    throw new Error('stale')
  round.position++
}

export function quizView(round) {
  if (!round) return null
  const { language, mode, position, questions, results } = round
  const common = { language, mode, position, total: questions.length }
  if (position === questions.length)
    return {
      ...common,
      complete: true,
      score: results.filter((r) => r.correct).length,
      missed: questions.flatMap((q, i) =>
        results[i].correct
          ? []
          : [{ prompt: q.prompt, given: results[i].given, answer: q.answer, format: q.format }],
      ),
    }
  const { format, prompt, promptLang, clue, options, optionLang, answer, explanation } =
    questions[position]
  return {
    ...common,
    complete: false,
    format,
    prompt,
    promptLang,
    clue: clue || '',
    options,
    optionLang,
    feedback: results[position] ? { ...results[position], answer, explanation } : null,
  }
}
