import { useRef, useState } from 'react'

// Minimal Web Speech API shape (not in this TS lib version).
interface SpeechRec {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
  onend: () => void
  onerror: () => void
}
type WinSR = Window & { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }
const Recognizer = (window as WinSR).SpeechRecognition || (window as WinSR).webkitSpeechRecognition

export function MicButton({ onText, lang = 'he-IL' }: { onText: (t: string) => void; lang?: string }) {
  const [on, setOn] = useState(false)
  const ref = useRef<SpeechRec | null>(null)
  if (!Recognizer) return null

  const toggle = () => {
    if (on) { ref.current?.stop(); return }
    const rec = new Recognizer()
    ref.current = rec
    rec.lang = lang
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim()
      if (text) onText(text)
    }
    rec.onend = () => setOn(false)
    rec.onerror = () => setOn(false)
    rec.start()
    setOn(true)
  }

  return (
    <button type="button" className={`mic ${on ? 'mic--on' : ''}`} onClick={toggle} title="דיבור לטקסט" aria-label="voice input">
      {on ? '⏺' : '🎤'}
    </button>
  )
}
