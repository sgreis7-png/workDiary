import { GUIDELINES } from '../../defects/model'

export function GuidelinesTab() {
  return (
    <div className="gate-panel">
      <h2 className="gate-panel__title">{GUIDELINES.title}</h2>
      <div className="guidelines">
        {GUIDELINES.blocks.map((b, i) => (
          <div key={i} className="guidelines__block">
            {b.heading && <h3>{b.heading}</h3>}
            <p>{b.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
