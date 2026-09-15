import {
  HOME_SECTION_TITLE_ACCENT_VAR,
  HOME_SECTION_TITLE_CLASS,
  HOME_SECTION_TITLE_RULE_CLASS,
  homeSectionAccentStyle,
  TOP3_HEADING,
  TOP3_SUBLINE_CLASS,
  TOP3_SUBLINE_PARTS,
} from '@/lib/displayHome';

/**
 * Top 3 H2 + S8-colored mix subline. Same chrome on first paint and live.
 */
export default function Top3SectionHeading() {
  return (
    <div>
      <h2 className={HOME_SECTION_TITLE_CLASS}>
        <span
          className={HOME_SECTION_TITLE_RULE_CLASS}
          style={homeSectionAccentStyle(HOME_SECTION_TITLE_ACCENT_VAR)}
        >
          {TOP3_HEADING}
        </span>
      </h2>
      <p data-top3-subline="" className={TOP3_SUBLINE_CLASS}>
        {TOP3_SUBLINE_PARTS.map((part, i) => (
          <span key={part.cssVar}>
            {i > 0 ? <span className="font-normal text-culture-muted"> · </span> : null}
            <span className="font-semibold" style={{ color: `var(${part.cssVar})` }}>
              {part.label}
            </span>
          </span>
        ))}
      </p>
    </div>
  );
}
