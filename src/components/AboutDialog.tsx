import { useRef } from 'react'
import { Logo } from './Logo'
import { useDialog } from '../lib/useDialog'

const VERSION = '1.0.0'

/** ⓘ מידע על התוכנה. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useDialog(panel, onClose)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal about" ref={panel} role="dialog" aria-modal="true" aria-label="מידע על התוכנה" tabIndex={-1} onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="about__head">
          <Logo height={30} />
          <span className="tag tag--green mono">v{VERSION}</span>
        </div>
        <h2>יומן עבודה · Agrotop</h2>
        <p className="about__lead">מערכת תיעוד שטח וניהול איכות לפרויקטי הקמת לולים בשיטת עד־מפתח.</p>

        <div className="about__grid">
          <div className="about__block">
            <h3>▤ ניהול עבודה</h3>
            <p>יומן עבודה יומי מהשטח: רשומות עם תמונות, לוח שנה, חיפוש, סקירת פרויקטים, דוחות במייל וייצוא.</p>
          </div>
          <div className="about__block">
            <h3>🛡 ניהול ליקויים</h3>
            <p>תפיסת סיום שלב (Hold Points) per־לול: בדיקת טרום־יציקה, שערים 1–6, יומן ליקויים, חתימות דיגיטליות וטופסי ויתור — לפי כלי בקרת האיכות של Agrotop.</p>
          </div>
        </div>

        <ul className="about__facts">
          <li><b>עובד גם בנייד</b> — אפליקציית PWA, ניתנת להתקנה ממסך הבית.</li>
          <li><b>עבודה לא מקוונת</b> — רשומות יומן נשמרות ומסתנכרנות כשהחיבור חוזר.</li>
          <li><b>מצב כהה / בהיר</b> — החלפה בכפתור 🌓 בתפריט.</li>
          <li><b>אבטחה</b> — מידע עסקי מאובטח, לעובדי אגרוטופ בלבד.</li>
        </ul>

        <div className="about__foot">
          <span className="mono">Agrotop · Agriculture Turnkey Projects</span>
          <button className="btn btn--primary" onClick={onClose}>סגירה</button>
        </div>
      </div>
    </div>
  )
}
