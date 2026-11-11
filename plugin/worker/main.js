import { loadDeck } from './provider.js'
import { supportsQuiz } from '../quiz-formats.js'
import { makeQuiz, answerQuiz, nextQuestion, quizView } from './quiz.js'
import { createRound, grade, roundSizes, ratings, view } from './study.js'
import {
  backupKey,
  profileKey,
  freshProfile,
  localDay,
  checkPrefs,
  validateProfile,
  parseBackup,
  planDay,
  dailyRound,
  gradeDaily,
  dueIds,
  nextReview,
} from './profile.js'

export function connect(api, provider = loadDeck, clock = () => new Date()) {
  let token = crypto.randomUUID()
  let deck
  let byId
  let guest
  let quiz
  let daily = false
  let profile = freshProfile()
  let damaged = false
  let retryAt = 0
  let busy = false
  let pendingRestore
  let lastBadge

  async function read(key) {
    try {
      return await api.storage.get(key)
    } catch {
      throw new Error('storage_error')
    }
  }

  async function write(key, value) {
    try {
      await api.storage.set(key, value)
    } catch {
      throw new Error('storage_error')
    }
  }

  async function initialize() {
    const saved = await read(profileKey)
    if (saved.found) {
      try {
        profile = validateProfile(saved.value)
      } catch {
        damaged = true
      }
    }
  }
  let ready
  function ensureReady() {
    ready ??= initialize().catch((error) => {
      ready = null
      throw error
    })
    return ready
  }

  async function save(next) {
    if (damaged) throw new Error('damaged')
    await write(profileKey, next)
    profile = next
  }

  async function load() {
    if (deck) return
    if (Date.now() < retryAt) throw new Error('busy_source')
    try {
      deck = await provider(api.net)
      byId = new Map(deck.map((c) => [c.id, c]))
    } catch (cause) {
      if (cause?.message === 'busy_source') retryAt = cause.retryAt
      throw cause
    }
  }

  const today = () => localDay(clock())
  const remaining = () => dueIds(profile, today()).length

  async function badge() {
    const count = remaining()
    const next = count ? String(count) : null
    if (lastBadge === next) return
    try {
      await api.badge.set(next ? { text: next, tone: 'info' } : null)
      lastBadge = next
    } catch {
      /* Retry on the next tick. */
    }
  }

  async function tick() {
    await ensureReady()
    if (busy || damaged) return
    busy = true
    try {
      const now = clock()
      const day = localDay(now)
      const { reminder, time, lang } = profile.prefs
      const [hour, minute] = time.split(':').map(Number)
      const elapsed = now.getHours() * 60 + now.getMinutes() - hour * 60 - minute
      const complete =
        profile.plan?.day === day && profile.plan.position === profile.plan.ids.length
      if (
        reminder &&
        !complete &&
        profile.notified !== day &&
        elapsed >= 0 &&
        elapsed < 60 &&
        (profile.prefs.goal || remaining())
      ) {
        await api.feed
          .notify({
            title: lang === 'en' ? 'Word Walk' : '單字散步',
            body:
              lang === 'en'
                ? 'Your daily practice is ready in the Word Walk tab.'
                : '今天的單字準備好了，可以到單字散步分頁練習。',
            dedupeKey: 'word-walk-' + day,
          })
          .catch((error) => {
            if (error?.code !== 'duplicate') throw error
          })
        await save({ ...profile, notified: day })
      }
      await badge()
    } finally {
      busy = false
    }
  }

  function snapshot() {
    const day = today()
    const plan = profile.plan
    const active = daily ? dailyRound(profile, byId) : guest
    const state = view(active)
    const extra = {
      local: daily,
      damaged,
      prefs: profile.prefs,
      known: Object.keys(profile.words).length,
      due: remaining(),
      today: day,
      hasPlan: Boolean(plan && plan.day === day),
      finished: Boolean(plan && plan.day === day && plan.position === plan.ids.length),
    }
    if (daily && state.page === 'card' && plan.revealed) {
      extra['dates'] = Object.fromEntries(
        ratings.map((r) => [
          r,
          nextReview(profile.words[plan.ids[plan.position]], r, plan.day).due,
        ]),
      )
    }
    return { ...state, ...extra, quiz: quizView(quiz) }
  }

  async function handle(message) {
    const { type } = message
    if (type === 'sync') return
    if (message.token !== token) throw new Error('stale')
    if (type === 'quizStart') {
      if (
        quiz ||
        !supportsQuiz(message.language, message.format) ||
        !roundSizes.includes(message.size)
      )
        throw new Error('stale')
      if (message.language === 'ja') await load()
      quiz = makeQuiz(message.language, message.format, message.size, deck)
      return
    }
    if (type === 'quizAnswer') {
      answerQuiz(quiz, message.answer)
      return
    }
    if (type === 'quizNext') {
      nextQuestion(quiz)
      return
    }
    if (type === 'quizExit') {
      quiz = null
      return
    }
    if (type === 'home') {
      daily = false
      guest = null
      return
    }
    if (type === 'start') {
      if (!roundSizes.includes(message.size) || (guest && guest.position < guest.queue.length))
        throw new Error('stale')
      await load()
      daily = false
      guest = createRound(deck, message.size)
      return
    }
    if (type === 'export') {
      if (damaged) throw new Error('damaged')
      return JSON.stringify(profile)
    }
    if (['restorePreview', 'previous', 'resetPreview'].includes(type)) {
      pendingRestore = null
      const data =
        type === 'resetPreview'
          ? freshProfile()
          : type === 'previous'
            ? validateProfile((await read(backupKey)).value)
            : parseBackup(message.text)
      if (Object.keys(data.words).length || data.plan?.ids.length) {
        await load()
        if (![...Object.keys(data.words), ...(data.plan?.ids ?? [])].every((id) => byId.has(id)))
          throw new Error('invalid_backup')
      }
      pendingRestore = { data, id: crypto.randomUUID() }
      return { id: pendingRestore.id, count: Object.keys(data.words).length }
    }
    if (type === 'restore') {
      if (!pendingRestore || message.confirm !== pendingRestore.id) throw new Error('stale')
      const saved = await read(profileKey)
      if (saved.found) await write(backupKey, saved.value)
      await write(profileKey, pendingRestore.data)
      profile = pendingRestore.data
      pendingRestore = null
      damaged = false
      daily = false
      guest = null
      return
    }
    if (damaged && type !== 'flip' && type !== 'hint' && type !== 'grade')
      throw new Error('damaged')
    if (type === 'prefs') {
      checkPrefs(message.prefs)
      await save({ ...profile, prefs: message.prefs })
      return
    }
    if (type === 'library') {
      if (
        typeof message.query !== 'string' ||
        message.query.length > 64 ||
        !['all', 'weak', 'due'].includes(message.filter) ||
        !Number.isInteger(message.page) ||
        message.page < 0 ||
        message.page > 100
      )
        throw new Error('stale')
      if (Object.keys(profile.words).length) await load()
      const query = message.query.trim().toLowerCase()
      const matches = Object.entries(profile.words).filter(([id, row]) => {
        const word = byId?.get(id)
        return (
          word &&
          (message.filter !== 'weak' || row[3] !== 'good') &&
          (message.filter !== 'due' || row[1] <= today()) &&
          [word.word, word.reading, ...word.meanings].some((text) =>
            text.toLowerCase().includes(query),
          )
        )
      })
      const page = Math.min(message.page, Math.max(0, Math.ceil(matches.length / 12) - 1))
      return {
        page,
        total: matches.length,
        rows: matches.slice(page * 12, page * 12 + 12).map(([id, row]) => {
          const card = byId.get(id)
          return {
            word: card.word,
            reading: card.reading,
            meaning: card.meanings.join(' · '),
            date: row[1],
            rating: row[3],
          }
        }),
      }
    }
    if (type === 'daily' || type === 'extra') {
      await load()
      const day = today()
      const extra = type === 'extra'
      const plan = profile.plan
      if (extra && (!plan || plan.day !== day || plan.position !== plan.ids.length || !remaining()))
        throw new Error('stale')
      if (!plan || plan.day !== day || extra)
        await save({ ...profile, plan: planDay(profile, deck, day, extra) })
      if (!dailyRound(profile, byId)) throw new Error('invalid_backup')
      daily = true
      guest = null
      return
    }
    if (!['hint', 'flip', 'grade'].includes(type)) throw new Error('stale')
    if (!daily) {
      if (!guest || guest.position >= guest.queue.length) throw new Error('stale')
      if (type === 'grade') grade(guest, message.rating)
      else if (type === 'flip') guest.revealed = true
      else guest.hint = true
      return
    }
    const next = structuredClone(profile)
    const p = next.plan
    if (!p || p.position >= p.ids.length) throw new Error('stale')
    if (type === 'grade') gradeDaily(next, message.rating)
    else if (type === 'flip') p.revealed = true
    else p.hint = true
    await save(next)
    if (type === 'grade') {
      if (p.position === p.ids.length && !p.extra && next.prefs.celebrate)
        await api.pet.react('encouraging').catch(() => {})
      if (p.day !== today()) daily = false
    }
  }

  const off = api.ui.onMessage(async (message) => {
    if (typeof message?.id !== 'string' || !/^[a-f0-9-]{36}$/.test(message.id)) return
    let error = null
    let detail = null
    let acquired = false
    try {
      await ensureReady()
      if (busy) throw new Error('stale')
      acquired = true
      busy = true
      detail = (await handle(message)) ?? null
      if (message.type !== 'sync') token = crypto.randomUUID()
    } catch (cause) {
      const known = [
        'invalid_deck',
        'busy_source',
        'stale',
        'storage_error',
        'invalid_backup',
        'damaged',
        'quiz_unavailable',
      ]
      error = known.includes(cause?.message) ? cause.message : 'unavailable'
    } finally {
      if (acquired) busy = false
    }
    await api.ui.postMessage({ id: message.id, token, state: snapshot(), detail, error })
  })
  const cancel = api.schedule.every(60, () => tick().catch(() => {}))
  return () => {
    off()
    cancel()
  }
}

let stop
export default {
  activate(api) {
    stop = connect(api)
  },
  deactivate() {
    stop?.()
  },
}
