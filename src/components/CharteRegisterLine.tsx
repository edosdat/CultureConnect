'use client';

import {
  HOME_SECTION_TITLE_ACCENT_VAR,
  HOME_SECTION_TITLE_CLASS,
  HOME_SECTION_TITLE_RULE_CLASS,
  homeSectionAccentStyle,
} from '@/lib/displayHome';
import type { CharteCopy, CharteRegister } from '@/lib/charteCopy';

type Props = {
  register: CharteRegister;
  copy: CharteCopy;
};

/**
 * Page-level charte labels. The parent passes one already-resolved register
 * for the view — this component does not look at cards. The Enfants chip
 * selects the register upstream.
 */
export default function CharteRegisterLine({ register, copy }: Props) {
  return (
    <div data-charte-register={register} className="space-y-1 pt-1">
      <p className={HOME_SECTION_TITLE_CLASS}>
        <span
          data-charte="mes-crushs"
          className={HOME_SECTION_TITLE_RULE_CLASS}
          style={homeSectionAccentStyle(HOME_SECTION_TITLE_ACCENT_VAR)}
        >
          {copy.mesCrushs}
        </span>
      </p>
      <p data-charte="deux-soirs" className="text-sm text-culture-muted">
        {copy.deuxSoirs}
      </p>
    </div>
  );
}
