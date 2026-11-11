import { noticeUrl, licenseUrl, revision } from '../source.js'
import { copy } from './copy.js'
import { dailyPages, label, dateLabel } from './daily.js'

const api = window.agentPetsPlugin
const find = (id) => document.getElementById(id)
const content = find('content')
let locale = 'zh'
let state = null
let token = null
let pending = null
let showingSources = false
let size = 5
let status = ''
let page = 'home'
let localized = false
const pages = dailyPages({ content, node, button, heading, send, refresh: () => render() })
const l = (key) => label(key, locale)

function node(tag, text, className) {
  const element = document.createElement(tag)
  if (text !== undefined) element.textContent = text
  if (className) element.className = className
  return element
}

function button(text, action, className) {
  const element = node('button', text, className)
  element.type = 'button'
  element.addEventListener('click', action)
  element.disabled = Boolean(pending)
  return element
}

function link(text, url) {
  return button(
    text,
    () =>
      api.links.openExternal(url).catch(() => {
        find('status').textContent = copy[locale].linkError
      }),
    'quiet',
  )
}

function heading(text, className) {
  const element = node('h2', text, className)
  element.id = 'heading'
  element.tabIndex = -1
  return element
}

function japanese(element) {
  element.lang = 'ja'
  return element
}

function startControls(t, label) {
  const field = node('label', t.size)
  const select = node('select')
  for (const count of [3, 5, 10]) select.add(new Option(String(count), String(count)))
  select.value = String(size)
  select.disabled = Boolean(pending)
  select.onchange = () => {
    size = Number(select.value)
  }
  field.append(select)
  content.append(
    field,
    button(label, () => send('start', { size }), 'primary'),
  )
}

function card(t) {
  content.append(
    node('p', t.progress(state.position, state.total), 'meta'),
    japanese(heading(state.word, 'word')),
  )
  if (state.reading) content.append(japanese(node('p', state.reading, 'reading')))
  const actions = node('div', undefined, 'actions')
  if (state.answer) {
    const meaning = node('p', state.answer.meanings.join(' · '))
    meaning.lang = 'en'
    content.append(meaning, node('p', `${t.pos} · ${state.answer.pos.join(', ')}`, 'meta'))
    const example = state.answer.example
    if (example) {
      const box = node('div', undefined, 'example')
      box.append(
        japanese(node('p', example.ja)),
        link(
          `${t.sentence} · Tatoeba #${example.sentenceId}`,
          `https://tatoeba.org/sentences/show/${example.sentenceId}`,
        ),
      )
      content.append(box)
    }
    for (const rating of ['again', 'hard', 'good']) {
      actions.append(
        button(
          state.dates ? t[rating] + ' · ' + dateLabel(state.dates[rating]) : t[rating],
          () => send('grade', { rating }),
          rating === 'good' ? 'primary' : '',
        ),
      )
    }
  } else {
    actions.append(button(t.flip, () => send('flip'), 'primary'))
    if (state.hasHint && !state.reading) actions.append(button(t.hint, () => send('hint')))
  }
  content.append(actions)
}

function render(focus = false) {
  const t = copy[locale]
  document.documentElement.lang = locale === 'zh' ? 'zh-Hant' : 'en'
  find('brand').textContent = t.brand
  find('deck').textContent = t.deck
  find('sources').textContent = showingSources ? t.back : t.sources
  find('language').textContent = locale === 'zh' ? 'English' : '繁體中文'
  find('status').textContent = t[status] || l(status) || (state?.damaged ? l('damaged') : '')
  const nav = find('pages')
  nav.replaceChildren()
  if (state)
    for (const key of ['home', 'library', 'settings']) {
      const tab = button(l(key), () => {
        page = key
        showingSources = false
        pages.enter(key)
        render(true)
      })
      if (!showingSources && page === key) tab.setAttribute('aria-current', 'page')
      nav.append(tab)
    }
  content.replaceChildren()
  if (showingSources) {
    content.append(
      heading(t.sources),
      node('p', t.attribution),
      node('p', `${t.version} · ${revision}`, 'meta'),
      link(t.notice, noticeUrl),
      link(t.license, licenseUrl),
    )
  } else if (!state || status === 'disconnected') {
    content.append(
      heading(t.brand),
      button(t.retry, () => send('sync')),
    )
  } else if (page !== 'home') {
    pages.render(page, state, locale, t)
  } else if (state.page === 'setup') {
    content.append(
      heading(l('daily')),
      node('p', l('privacy')),
      node(
        'p',
        l('due') +
          ' ' +
          state.due +
          ' · ' +
          l('goal') +
          ' ' +
          state.prefs.goal +
          ' · ' +
          l('known') +
          ' ' +
          state.known,
      ),
      button(
        l(state.finished ? 'result' : state.hasPlan ? 'resume' : 'ready'),
        () => send('daily'),
        'primary',
      ),
      node('h3', l('guest')),
    )
    startControls(t, t.start)
  } else if (state.page === 'complete') {
    content.append(heading(t.done), node('p', t.summary(state.size)))
    content.append(
      node(
        'p',
        ['again', 'hard', 'good'].map((key) => `${t[key]} ${state.counts[key]}`).join(' · '),
      ),
    )
    if (state.local && state.due) content.append(button(l('extra'), () => send('extra')))
    if (state.local) content.append(button(l('home'), () => send('home')))
    else {
      startControls(t, t.next)
      content.append(button(l('home'), () => send('home')))
    }
  } else {
    card(t)
    if (state.local) content.append(button(l('home'), () => send('home'), 'quiet'))
  }
  if (focus) find('heading')?.focus()
}

function disconnect(id) {
  if (pending?.id !== id) return
  clearTimeout(pending.timer)
  pending = null
  status = 'disconnected'
  render(true)
}

async function send(type, payload = {}) {
  if (pending) return
  const id = crypto.randomUUID()
  pending = { id, type, timer: setTimeout(() => disconnect(id), 65000) }
  status = type === 'start' ? 'loading' : 'syncing'
  render()
  try {
    if (!(await api.ui.postMessage({ type, id, token, ...payload })).delivered) disconnect(id)
  } catch {
    disconnect(id)
  }
}

api.ui.onMessage((reply) => {
  if (
    !reply ||
    typeof reply !== 'object' ||
    Array.isArray(reply) ||
    !pending ||
    reply.id !== pending.id
  )
    return
  const next = reply.state
  if (
    typeof reply.token !== 'string' ||
    (reply.error !== null && typeof reply.error !== 'string') ||
    !next ||
    typeof next !== 'object' ||
    Array.isArray(next) ||
    !['setup', 'card', 'complete'].some((page) => page === next.page)
  ) {
    disconnect(pending.id)
    return
  }
  clearTimeout(pending.timer)
  if (!reply.error) pages.receive(pending.type, reply.detail)
  pending = null
  state = next
  if (!localized && next.prefs && typeof next.prefs === 'object' && !Array.isArray(next.prefs)) {
    locale = next.prefs.lang === 'en' ? 'en' : 'zh'
    localized = true
  }
  token = reply.token
  status = typeof reply.error === 'string' ? reply.error : ''
  render(true)
})

find('language').onclick = () => {
  locale = locale === 'zh' ? 'en' : 'zh'
  render()
}
find('sources').onclick = () => {
  showingSources = !showingSources
  render(true)
}
document.addEventListener('keydown', (event) => {
  if (
    pending ||
    showingSources ||
    page !== 'home' ||
    status === 'disconnected' ||
    state?.page !== 'card' ||
    event.repeat ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !(event.target instanceof Element) ||
    event.target.closest('button, input, select, textarea, a, [contenteditable]')
  )
    return
  if (event.code === 'Space' && !state.answer) {
    event.preventDefault()
    send('flip')
  } else if (state.answer && ['1', '2', '3'].includes(event.key)) {
    send('grade', { rating: ['again', 'hard', 'good'][Number(event.key) - 1] })
  }
})
const applyMode = (theme) => {
  document.documentElement.style.colorScheme = theme.mode
}
api.theme.onDidChange(applyMode)
api.theme
  .get()
  .then(applyMode)
  .catch(() => {})
send('sync')
