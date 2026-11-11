import { revision } from '../source.js'
import { ratings } from './study.js'

const intervals = [1, 3, 7, 14, 30, 60, 120]
export const profileKey = 'word-walk-profile-v1'
export const backupKey = 'word-walk-before-restore'
const idPattern = /^[a-f0-9]{10}$/
const isId = (value) => typeof value === 'string' && idPattern.test(value)
const isDay = (value) => Number.isSafeInteger(value) && value >= 0 && value < 100000
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
function keys(value, expected) {
  return (
    record(value) &&
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  )
}

export function localDay(date = new Date()) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
}

export function freshProfile() {
  return {
    schema: 1,
    deck: revision,
    words: {},
    plan: null,
    notified: null,
    prefs: { goal: 5, budget: 10, reminder: false, time: '18:00', celebrate: true, lang: 'zh' },
  }
}

export function checkPrefs(p) {
  if (
    !keys(p, ['goal', 'budget', 'reminder', 'time', 'celebrate', 'lang']) ||
    ![0, 3, 5, 10].includes(p.goal) ||
    ![5, 10, 20].includes(p.budget) ||
    !['en', 'zh'].includes(p.lang) ||
    typeof p.reminder !== 'boolean' ||
    typeof p.celebrate !== 'boolean' ||
    typeof p.time !== 'string' ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)
  )
    throw new Error('invalid_backup')
}

export function validateProfile(data) {
  const invalid = () => {
    throw new Error('invalid_backup')
  }
  if (
    !keys(data, ['schema', 'deck', 'words', 'plan', 'prefs', 'notified']) ||
    data.schema !== 1 ||
    data.deck !== revision ||
    !record(data.words) ||
    Object.keys(data.words).length > 1000 ||
    !(data.notified === null || isDay(data.notified))
  )
    invalid()
  checkPrefs(data.prefs)
  for (const [id, row] of Object.entries(data.words)) {
    if (
      !isId(id) ||
      !Array.isArray(row) ||
      row.length !== 5 ||
      !Number.isInteger(row[0]) ||
      row[0] < 0 ||
      row[0] >= intervals.length ||
      !isDay(row[1]) ||
      !isDay(row[2]) ||
      row[1] <= row[2] ||
      !ratings.includes(row[3]) ||
      typeof row[4] !== 'boolean'
    )
      invalid()
  }
  const p = data.plan
  if (p !== null) {
    if (
      !keys(p, [
        'day',
        'ids',
        'position',
        'answers',
        'repeated',
        'size',
        'extra',
        'hint',
        'revealed',
      ]) ||
      !isDay(p.day) ||
      !Array.isArray(p.ids) ||
      p.ids.length > 60 ||
      !p.ids.every(isId) ||
      !Number.isInteger(p.position) ||
      p.position < 0 ||
      p.position > p.ids.length ||
      !Number.isInteger(p.size) ||
      p.size !== new Set(p.ids).size ||
      p.size > 30 ||
      !Array.isArray(p.repeated) ||
      !record(p.answers) ||
      ![p.extra, p.hint, p.revealed].every((x) => typeof x === 'boolean')
    )
      invalid()
    const seen = new Set(p.ids.slice(0, p.position))
    const duplicates = p.ids.filter((id, i) => p.ids.indexOf(id) < i)
    if (
      p.repeated.length !== duplicates.length ||
      new Set(p.repeated).size !== p.repeated.length ||
      new Set(duplicates).size !== duplicates.length ||
      !duplicates.every((id) => p.repeated.includes(id) && seen.has(id)) ||
      Object.keys(p.answers).length !== seen.size ||
      !Object.entries(p.answers).every(
        ([id, rating]) => seen.has(id) && Object.hasOwn(data.words, id) && ratings.includes(rating),
      )
    )
      invalid()
  }
  return data
}

export function parseBackup(text) {
  if (
    typeof text !== 'string' ||
    text.length > 100000 ||
    new TextEncoder().encode(text).length > 100000
  )
    throw new Error('invalid_backup')
  try {
    return validateProfile(JSON.parse(text))
  } catch {
    throw new Error('invalid_backup')
  }
}

export function dueIds(profile, day) {
  return Object.keys(profile.words)
    .filter((id) => profile.words[id][1] <= day)
    .sort((a, b) => profile.words[a][1] - profile.words[b][1] || a.localeCompare(b))
}

export function planDay(profile, deck, day, extra = false) {
  const available = new Set(deck.map((card) => card.id))
  const due = dueIds(profile, day)
    .filter((id) => available.has(id))
    .slice(0, profile.prefs.budget)
  const fresh = extra
    ? []
    : deck.filter((card) => !Object.hasOwn(profile.words, card.id)).slice(0, profile.prefs.goal)
  const ids = due.concat(fresh.map((card) => card.id))
  return {
    day,
    ids,
    position: 0,
    answers: {},
    repeated: [],
    size: ids.length,
    extra,
    hint: false,
    revealed: false,
  }
}

export function nextReview(previous, rating, day) {
  if (previous && previous[2] >= day) return { stage: previous[0], due: previous[1] }
  const lastStage = previous?.[0] ?? -1
  const stage =
    rating === 'good'
      ? Math.min(lastStage + 1, intervals.length - 1)
      : rating === 'hard'
        ? Math.max(lastStage - 1, 0)
        : 0
  return { stage, due: day + (rating === 'good' ? intervals[stage] : 1) }
}

export function gradeDaily(profile, rating) {
  const p = profile.plan
  if (!p?.revealed || !ratings.includes(rating) || p.position >= p.ids.length)
    throw new Error('stale')
  const id = p.ids[p.position]
  const prior = profile.words[id]
  const { stage, due } = nextReview(prior, rating, p.day)
  profile.words[id] = [
    stage,
    due,
    Math.max(prior?.[2] ?? 0, p.day),
    rating,
    p.hint || Boolean(prior?.[4] && prior[2] === p.day),
  ]
  p.answers[id] = rating
  if (rating === 'again' && !p.repeated.includes(id)) {
    p.ids.splice(p.position + 3, 0, id)
    p.repeated.push(id)
  }
  p.position++
  p.hint = false
  p.revealed = false
}

export function dailyRound(profile, byId) {
  const p = profile.plan
  if (!p || !byId || p.ids.some((id) => !byId.has(id))) return null
  return {
    queue: p.ids.map((id) => byId.get(id)),
    position: p.position,
    size: p.size,
    answers: new Map(Object.entries(p.answers)),
    repeated: new Set(p.repeated),
    hint: p.hint,
    revealed: p.revealed,
  }
}
