import { useI18n } from '../i18n'
import { gt } from '../gantt/i18n'
import type { Project } from '../data'

/** Star toggle that sits beside a project picker. */
export function FavStar({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { lang } = useI18n()
  return (
    <button
      type="button"
      className={`cc-star ${on ? 'on' : ''}`}
      aria-pressed={on}
      title={gt(lang, on ? 'o_fav_remove' : 'o_fav_add')}
      onClick={onToggle}
    >
      {on ? '★' : '☆'}
    </button>
  )
}

/** One-click shortcuts to the starred projects, in the order they were starred. */
export function FavChips({ projects, favs, activeId, onPick }: {
  projects: Project[]; favs: string[]; activeId?: string; onPick: (id: string) => void
}) {
  const { lang } = useI18n()
  const shortcuts = favs
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => p !== undefined)
  if (!shortcuts.length) return null
  return (
    <div className="cc-favs" role="group" aria-label={gt(lang, 'o_favs')}>
      {shortcuts.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`coop-tab ${p.id === activeId ? 'on' : ''}`}
          onClick={() => onPick(p.id)}
        >
          ★ {p.name}
        </button>
      ))}
    </div>
  )
}
