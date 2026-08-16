// Spoken-digit normalization for dictating numbers (ת"ז, phone).
//
// he-IL recognition returns an unpredictable mix: numerals ("305"), digit
// words ("אפס חמש"), or compounds. Numerals pass through; single-digit words
// are mapped; everything else is dropped. Tens/compound words are NOT mapped
// on purpose — "עשרים ושלוש" would concatenate to "203", worse than nothing —
// and the recognizer renders compounds as numerals anyway.
const HE_DIGIT_WORDS: Record<string, string> = {
  'אפס': '0',
  'אחת': '1', 'אחד': '1',
  'שתיים': '2', 'שניים': '2', 'שתים': '2', 'שנים': '2',
  'שלוש': '3', 'שלושה': '3',
  'ארבע': '4', 'ארבעה': '4',
  'חמש': '5', 'חמישה': '5',
  'שש': '6', 'שישה': '6',
  'שבע': '7', 'שבעה': '7',
  'שמונה': '8',
  'תשע': '9', 'תשעה': '9',
}

/** "אפס חמש 43 שבע" -> "05437". */
export function spokenToDigits(raw: string): string {
  return raw
    .split(/\s+/)
    .map((w) => {
      const clean = w.replace(/[.,!?"'״׳]/g, '')
      const word = clean.startsWith('ו') && HE_DIGIT_WORDS[clean.slice(1)] ? clean.slice(1) : clean
      return HE_DIGIT_WORDS[word] ?? clean.replace(/\D+/g, '')
    })
    .join('')
}
