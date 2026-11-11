const labels = {
  quiz: ['小測驗', 'Quiz'],
  quizDeck: ['日文 N5 · 生活英文', 'Japanese N5 · Everyday English'],
  quiz_unavailable: [
    '本題庫缺少足夠的不同選項，請改選其他題型。',
    'This deck has too few distinct choices. Select another question type.',
  ],
  daily: ['每日練習', 'Daily practice'],
  library: ['單字本', 'Vocabulary'],
  settings: ['設定與備份', 'Settings & backup'],
  home: ['今天', 'Today'],
  due: ['到期複習', 'Due'],
  known: ['已學單字', 'Seen'],
  goal: ['每日新字', 'New words per day'],
  budget: ['每日複習上限', 'Daily review limit'],
  ready: ['開始每日練習', 'Start daily practice'],
  resume: ['接續今天的進度', 'Resume today’s plan'],
  result: ['查看今日結果', 'See today’s results'],
  extra: ['繼續複習到期單字', 'Review more due words'],
  guest: ['本次練習', 'Practice without saving'],
  privacy: [
    '每日練習會在本機保存作答與複習日期。本次練習只使用記憶體。兩種模式都由 GitHub 下載日文 N5 題庫。',
    'Daily practice saves ratings and review dates on this device. Practice without saving keeps answers in memory. Both modes download the Japanese N5 deck from GitHub.',
  ],
  remaining: ['無待辦單字', 'No words due'],
  reminder: ['每日提醒', 'Daily reminder'],
  time: ['提醒時間', 'Reminder time'],
  celebrate: ['完成後讓寵物鼓勵我', 'Celebrate with my pet'],
  apply: ['套用設定', 'Save settings'],
  backup: ['備份與還原', 'Backup and restore'],
  export: ['顯示備份文字', 'Show backup text'],
  restore: ['預覽還原', 'Preview restore'],
  confirm: ['確認覆蓋本機進度', 'Replace local progress'],
  undo: ['預覽上次還原前的備份', 'Preview previous backup'],
  paste: ['貼上或複製 JSON', 'Paste or copy backup JSON'],
  overwrite: [
    '還原會取代所有本機學習紀錄與設定。備份中的單字數',
    'Restoring replaces all local progress and settings. Words in backup',
  ],
  search: ['單字、讀音或英文', 'Word, reading or meaning'],
  filter: ['篩選', 'Filter'],
  all: ['全部', 'All'],
  weak: ['需要再練', 'Needs practice'],
  find: ['搜尋', 'Search'],
  prev: ['上一頁', 'Previous'],
  next: ['下一頁', 'Next'],
  empty: ['沒有符合條件的單字。', 'No matching words.'],
  saved: ['已儲存設定', 'Settings saved'],
  restored: ['已還原本機進度', 'Local progress restored'],
  nextDue: ['下次複習', 'Next review'],
  reset: ['預覽清除全部進度', 'Preview clearing all progress'],
  storage_error: [
    '無法存取本機進度。請檢查插件儲存額度後重試。',
    'Could not access local progress. Check the plugin’s storage allowance and retry.',
  ],
  invalid_backup: [
    '備份或題庫版本不相容。請使用此版本匯出的完整 JSON。',
    'Incompatible backup. Use a complete JSON export from this deck version.',
  ],
  damaged: [
    '無法讀取本機進度。可從設定還原備份，或使用本次練習。',
    'Local progress could not be read. Restore a backup in Settings or practice without saving.',
  ],
  changes: [
    '新字與複習上限於下次建立計畫時生效。提醒依本機時間，在 App 運行時發送。',
    'Limits apply to the next plan. Reminders use local time while Agent Pets is running.',
  ],
}

export const label = (key, locale) => labels[key]?.[locale === 'en' ? 1 : 0] || ''
export const dateLabel = (day) => new Date(day * 86400000).toISOString().slice(0, 10)

export function dailyPages({ content, node, button, heading, send, refresh }) {
  let backup = ''
  let preview
  let query = ''
  let filter = 'all'
  let words
  let notice = ''
  let draft
  const getWords = (page = 0) => send('library', { query, filter, page })
  function enter(page) {
    notice = ''
    draft = null
    preview = null
    backup = ''
    if (page === 'library') getWords()
  }
  function receive(type, detail) {
    if (type === 'library') words = detail
    if (type === 'export') backup = detail
    if (['restorePreview', 'previous', 'resetPreview'].includes(type)) preview = detail
    if (type === 'prefs') {
      draft = null
      notice = 'saved'
    }
    if (type === 'restore') {
      preview = null
      backup = ''
      draft = null
      words = null
      notice = 'restored'
    }
  }
  function field(title, input) {
    const wrap = node('label', title)
    wrap.append(input)
    return wrap
  }
  function select(values, current, update) {
    const input = node('select')
    for (const [value, title] of values) input.add(new Option(title, String(value)))
    input.value = String(current)
    input.onchange = () => update(input.value)
    return input
  }
  function render(page, state, locale, t) {
    const l = (key) => label(key, locale)
    if (page === 'library') {
      const input = node('input')
      input.maxLength = 64
      input.value = query
      input.oninput = () => {
        query = input.value
      }
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.isComposing) getWords()
      }
      content.append(
        heading(l('library')),
        field(l('search'), input),
        field(
          l('filter'),
          select(
            ['all', 'weak', 'due'].map((key) => [key, l(key)]),
            filter,
            (v) => {
              filter = v
              getWords()
            },
          ),
        ),
        button(l('find'), () => getWords()),
      )
      if (words) {
        if (!words.rows.length) content.append(node('p', l('empty')))
        for (const row of words.rows) {
          const item = node('article')
          const word = node('strong', row.word + ' · ' + row.reading)
          word.lang = 'ja'
          item.append(
            word,
            node('p', row.meaning),
            node('p', t[row.rating] + ' · ' + dateLabel(row.date), 'meta'),
          )
          content.append(item)
        }
        if (words.page) content.append(button(l('prev'), () => getWords(words.page - 1)))
        if ((words.page + 1) * 12 < words.total)
          content.append(button(l('next'), () => getWords(words.page + 1)))
      }
      return
    }
    draft ??= { ...state.prefs }
    const choices = (key, values) =>
      field(
        l(key),
        select(
          values.map((v) => [v, String(v)]),
          draft[key],
          (v) => {
            draft[key] = Number(v)
          },
        ),
      )
    const checkbox = (key) => {
      const input = node('input')
      input.type = 'checkbox'
      input.checked = draft[key]
      input.onchange = () => {
        draft[key] = input.checked
      }
      return field(l(key), input)
    }
    const time = node('input')
    time.type = 'time'
    time.value = draft.time
    time.onchange = () => {
      draft.time = time.value
    }
    content.append(
      heading(l('settings')),
      choices('goal', [0, 3, 5, 10]),
      choices('budget', [5, 10, 20]),
      checkbox('reminder'),
      field(l('time'), time),
      checkbox('celebrate'),
      node('p', l('changes'), 'meta'),
      button(l('apply'), () => send('prefs', { prefs: { ...draft, lang: locale } }), 'primary'),
      node('h3', l('backup')),
    )
    const area = node('textarea')
    area.rows = 4
    area.maxLength = 100000
    area.value = backup
    area.oninput = () => {
      backup = area.value
      if (preview) {
        preview = null
        refresh()
      }
    }
    content.append(
      field(l('paste'), area),
      button(l('export'), () => send('export')),
      button(l('restore'), () => send('restorePreview', { text: backup })),
      button(l('undo'), () => send('previous')),
      button(l('reset'), () => send('resetPreview')),
    )
    if (preview)
      content.append(
        node('p', l('overwrite') + ' · ' + preview.count),
        button(l('confirm'), () => send('restore', { confirm: preview.id })),
      )
    if (notice) content.append(node('p', l(notice)))
  }
  return { render, enter, receive }
}
