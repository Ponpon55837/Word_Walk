export const quizFormats = Object.freeze({
  ja: Object.freeze(['reading', 'meaning', 'writing']),
  en: Object.freeze(['meaning', 'cloze', 'spelling']),
})

export function supportsQuiz(language, format) {
  return (
    typeof language === 'string' &&
    typeof format === 'string' &&
    Object.hasOwn(quizFormats, language) &&
    (format === 'mixed' || quizFormats[language].includes(format))
  )
}
