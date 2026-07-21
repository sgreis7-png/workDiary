import { useState } from 'react'
import { MicButton } from '../../components/MicButton'

/** Debounced-on-blur text input so each keystroke doesn't hit the DB. Includes voice dictation. */
export function TextCell({ value, onCommit, placeholder, disabled }: {
  value: string | null; onCommit: (v: string) => void; placeholder?: string; disabled?: boolean
}) {
  const [v, setV] = useState(value ?? '')
  const commit = (nv: string) => { if (nv !== (value ?? '')) onCommit(nv) }
  return (
    <div className="input-affix">
      <input
        className="input" value={v} placeholder={placeholder} disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => commit(v)}
      />
      {!disabled && <MicButton onText={(txt) => { const nv = (v ? v + ' ' : '') + txt; setV(nv); commit(nv) }} />}
    </div>
  )
}
