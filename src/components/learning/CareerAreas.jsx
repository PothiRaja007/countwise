import { careerAreasFor, CAREER_AREAS_LABEL } from '../../lib/learningCareerAreas.js'

// Compact "possible job areas" chips under a learning item. Renders nothing
// when the item doesn't match the catalogue — it never guesses.
export default function CareerAreas({ item }) {
  const match = careerAreasFor(item)
  if (!match) return null

  return (
    <div className="mt-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted dark:text-mutedDark mb-1">{CAREER_AREAS_LABEL}</p>
      <ul className="flex flex-wrap gap-1.5">
        {match.areas.map((area) => (
          <li
            key={area}
            className="px-2 py-0.5 rounded-md text-xs border border-line dark:border-lineDark text-ink dark:text-offwhite"
          >
            {area}
          </li>
        ))}
      </ul>
    </div>
  )
}
