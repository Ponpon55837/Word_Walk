import { quizFormats } from '../quiz-formats.js'

const text = {
  zh: {
    title: '小測驗',
    language: '學習語言',
    ja: '日文 N5',
    en: '生活英文',
    format: '題型',
    count: '題數',
    mixed: '混合題型',
    meaning: '詞義選擇',
    reading: '讀音選擇',
    writing: '假名選字',
    cloze: '句子填空',
    spelling: '字母重組',
    start: '開始測驗',
    submit: '送出答案',
    next: '下一題',
    finish: '查看結果',
    restart: '再做一組',
    exit: '結束這一組',
    answer: '你的答案',
    correct: '答對了',
    wrong: '正確答案',
    result: '測驗結果',
    missed: '錯題回顧',
    info: '作答後會顯示正解與本輪得分。測驗成績只保留在本次執行期間。',
    credit: '生活英文的 48 個單字、繁中釋義與填空例句由 Word Walk 編寫，隨插件提供，可離線測驗。',
    spellingTip: '根據中文提示，將下列字母重組成英文單字。',
    readingTip: '選出單字在此詞義下的讀音。',
    writingTip: '根據假名與詞義，選出日文單字。',
    meaningTip: '選出符合這個單字的意思。',
    clozeTip: '選出最適合填入句中的單字。',
  },
  en: {
    title: 'Quiz',
    language: 'Study language',
    ja: 'Japanese N5',
    en: 'Everyday English',
    format: 'Question type',
    count: 'Questions',
    mixed: 'Mixed questions',
    meaning: 'Word meaning',
    reading: 'Kana reading',
    writing: 'Identify the written word',
    cloze: 'Fill in the blank',
    spelling: 'Unscramble letters',
    start: 'Start quiz',
    submit: 'Submit answer',
    next: 'Next question',
    finish: 'See results',
    restart: 'New quiz',
    exit: 'End this quiz',
    answer: 'Your answer',
    correct: 'Correct',
    wrong: 'Correct answer',
    result: 'Quiz results',
    missed: 'Review missed questions',
    info: 'See the correct answer after each attempt. Your quiz score lasts for this session.',
    credit:
      'Word Walk provides 48 original English vocabulary entries with Traditional Chinese glosses and example sentences. The English quiz works offline.',
    spellingTip: 'Use the Chinese clue and arrange the letters to spell the English word.',
    readingTip: 'Choose the reading for this word and meaning.',
    writingTip: 'Choose the written word for this reading and meaning.',
    meaningTip: 'Choose the matching meaning.',
    clozeTip: 'Choose the word that completes the sentence.',
  },
}

export const quizCredit = (locale) => text[locale].credit

export function quizPanel({ content, node, button, heading, send, refresh }) {
  let language = 'ja'
  let format = 'mixed'
  let size = 5

  function field(title, values, selected, describe, change) {
    const label = node('label', title)
    const select = node('select')
    for (const value of values) select.add(new Option(describe(value), String(value)))
    select.value = String(selected)
    select.onchange = () => change(select.value)
    label.append(select)
    return label
  }

  return (round, locale, pending) => {
    const t = text[locale]
    if (!round) {
      content.append(
        heading(t.title),
        field(
          t.language,
          ['ja', 'en'],
          language,
          (key) => t[key],
          (value) => {
            language = value
            format = 'mixed'
            refresh()
          },
        ),
        field(
          t.format,
          ['mixed', ...quizFormats[language]],
          format,
          (key) => t[key],
          (value) => {
            format = value
          },
        ),
        field(t.count, [3, 5, 10], size, String, (value) => {
          size = Number(value)
        }),
        node('p', t.info, 'meta'),
        button(t.start, () => send('quizStart', { language, format, size }), 'primary'),
      )
      return
    }
    if (round.complete) {
      content.append(
        heading(t.result),
        node('strong', round.score + ' / ' + round.total, 'quiz-score'),
      )
      if (round.missed.length) content.append(node('h3', t.missed))
      for (const item of round.missed) {
        const row = node('article')
        row.append(
          node('strong', item.prompt),
          node('p', t.answer + ' · ' + item.given),
          node('p', t.wrong + ' · ' + item.answer),
        )
        content.append(row)
      }
      content.append(button(t.restart, () => send('quizExit'), 'primary'))
      return
    }
    const title = heading(round.prompt, 'quiz-prompt')
    title.lang = round.promptLang
    content.append(
      node(
        'p',
        t[round.language] +
          ' · ' +
          t[round.format] +
          ' · ' +
          (round.position + 1) +
          ' / ' +
          round.total,
        'meta',
      ),
      node('p', t[round.format + 'Tip']),
      title,
    )
    if (round.clue) content.append(node('p', round.clue, 'reading'))
    if (round.feedback) {
      const f = round.feedback
      if (!f.correct) content.append(node('p', t.answer + ' · ' + f.given))
      content.append(
        node('strong', (f.correct ? t.correct : t.wrong) + ' · ' + f.answer),
        node('p', f.explanation, 'meta'),
        button(
          round.position + 1 === round.total ? t.finish : t.next,
          () => send('quizNext'),
          'primary',
        ),
      )
    } else if (round.options) {
      const choices = node('div', undefined, 'quiz-options')
      for (const option of round.options) {
        const b = button(option, () => send('quizAnswer', { answer: option }))
        b.lang = round.optionLang
        choices.append(b)
      }
      content.append(choices)
    } else {
      const form = node('form')
      const label = node('label', t.answer)
      const input = node('input')
      input.lang = 'en'
      input.required = true
      input.maxLength = 64
      input.autocomplete = 'off'
      input.spellcheck = false
      input.setAttribute('autocapitalize', 'none')
      input.disabled = pending
      const submit = node('button', t.submit, 'primary')
      submit.type = 'submit'
      submit.disabled = pending
      form.onsubmit = (event) => {
        event.preventDefault()
        if (input.value.trim()) send('quizAnswer', { answer: input.value })
      }
      label.append(input)
      form.append(label, submit)
      content.append(form)
    }
    content.append(button(t.exit, () => send('quizExit'), 'quiet'))
  }
}
