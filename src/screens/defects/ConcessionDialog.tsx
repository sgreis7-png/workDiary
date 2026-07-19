import { useState } from 'react'
import { SEVERITY_LABELS, defectItemLabel } from '../../defects/model'
import type { Defect } from '../../defects/api'
import { SignaturePad } from './SignaturePad'

/** טופס ויתור (Concession) — double signature over an open 🟠 major defect. */
export function ConcessionDialog({ defect, onClose, onSubmit }: {
  defect: Defect
  onClose: () => void
  onSubmit: (reason: string, manager: { name: string; png: Blob }, supervisor: { name: string; png: Blob }) => void
}) {
  const [reason, setReason] = useState('')
  const [mName, setMName] = useState('')
  const [sName, setSName] = useState('')
  const [mPng, setMPng] = useState<Blob | null>(null)
  const [sPng, setSPng] = useState<Blob | null>(null)
  const ready = reason.trim() && mName.trim() && sName.trim() && mPng && sPng

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal concession" onClick={(e) => e.stopPropagation()} dir="rtl">
        <h2>טופס ויתור (Concession)</h2>
        <p className="concession__defect">
          ליקוי #{defect.seq} · {defect.severity ? SEVERITY_LABELS[defect.severity] : ''} ·{' '}
          {defect.item_no ? defectItemLabel(defect.gate, defect.item_no) : defect.description ?? ''}
        </p>
        <p className="concession__note">
          מז'ורי — רק עם טופס ויתור (Concession) בחתימה כפולה של מנהל הביצוע והמפקח.
        </p>
        <label className="field">
          <span className="field__label">נימוק הוויתור</span>
          <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="concession__signs">
          <div>
            <b>מנהל ביצוע</b>
            <input className="input" placeholder="שם מלא…" value={mName} onChange={(e) => setMName(e.target.value)} />
            <SignaturePad onChange={setMPng} height={90} />
          </div>
          <div>
            <b>מפקח</b>
            <input className="input" placeholder="שם מלא…" value={sName} onChange={(e) => setSName(e.target.value)} />
            <SignaturePad onChange={setSPng} height={90} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn--ghost" onClick={onClose}>ביטול</button>
          <button
            className="btn btn--primary" disabled={!ready}
            onClick={() => ready && onSubmit(reason.trim(), { name: mName.trim(), png: mPng! }, { name: sName.trim(), png: sPng! })}
          >
            ✍️ אישור בחתימה כפולה
          </button>
        </div>
      </div>
    </div>
  )
}
