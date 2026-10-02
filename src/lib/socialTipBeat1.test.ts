import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import path from 'node:path';
import { HOME_ACCROCHE_H1, HOME_ACCROCHE_H2 } from './displayHome';
import {
  SOCIAL_TIP_B1_COPY,
  SOCIAL_TIP_B1_SEEN_KEY,
  claimSocialTipBeat1,
  claimSocialTipPreview,
  dismissSocialTip,
  readSocialTipSeen,
  releaseSocialTipPreview,
  socialTipPreviewRequested,
  socialTipSeen,
  writeSocialTipSeen,
} from './socialTipBeat1';

const COPY = 'Un Plan C, c\u2019est pas pour \u00eatre tout seul.';

describe('social tip beat 1 copy and once-gate', () => {
  it('locks the Eloi sentence, accents, and typographic apostrophe', () => {
    assert.equal(SOCIAL_TIP_B1_COPY, COPY);
    assert.equal(SOCIAL_TIP_B1_COPY.includes("'"), false);
    assert.equal(SOCIAL_TIP_B1_COPY.includes('\u2019'), true);
    assert.equal(SOCIAL_TIP_B1_COPY.endsWith('.'), true);
    assert.equal(/[«»]/.test(SOCIAL_TIP_B1_COPY), false);
  });

  it('treats only the seen flag as already shown', () => {
    assert.equal(socialTipSeen(null), false);
    assert.equal(socialTipSeen(''), false);
    assert.equal(socialTipSeen('0'), false);
    assert.equal(socialTipSeen('1'), true);
    assert.equal(SOCIAL_TIP_B1_SEEN_KEY, 'cc_social_tip_b1_seen');
  });

  it('shows once, then stays silent, including after dismiss', () => {
    const bag = new Map<string, string>();
    const storage = {
      getItem: (key: string) => bag.get(key) ?? null,
      setItem: (key: string, value: string) => {
        bag.set(key, value);
      },
      removeItem: (key: string) => {
        bag.delete(key);
      },
      clear: () => bag.clear(),
      key: (index: number) => [...bag.keys()][index] ?? null,
      get length() {
        return bag.size;
      },
    };
    const prev = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    try {
      bag.delete(SOCIAL_TIP_B1_SEEN_KEY);
      assert.equal(readSocialTipSeen(), false);
      assert.equal(claimSocialTipBeat1(), true);
      assert.equal(readSocialTipSeen(), true);
      assert.equal(claimSocialTipBeat1(), false);
      dismissSocialTip();
      assert.equal(storage.getItem(SOCIAL_TIP_B1_SEEN_KEY), '1');
      assert.equal(claimSocialTipBeat1(), false);
      writeSocialTipSeen();
      assert.equal(readSocialTipSeen(), true);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: prev,
      });
    }
  });

  it('returns the design preview slot if that row unmounts before dismiss', () => {
    assert.equal(claimSocialTipPreview(), true);
    assert.equal(claimSocialTipPreview(), false);
    releaseSocialTipPreview();
    assert.equal(claimSocialTipPreview(), true);
    releaseSocialTipPreview();
  });

  it('reads the Soft Design preview query and ignores other values', () => {
    assert.equal(socialTipPreviewRequested('?apercu=social'), true);
    assert.equal(socialTipPreviewRequested('apercu=social&x=1'), true);
    assert.equal(socialTipPreviewRequested('?apercu=digeste'), false);
    assert.equal(socialTipPreviewRequested('?apercu=1'), false);
    assert.equal(socialTipPreviewRequested(''), false);
  });
});

describe('social tip beat 1 wiring', () => {
  it('places one dismissable line under Envie / J’y vais, not on guest or J’y vais', async () => {
    const root = process.cwd();
    const social = await readFile(
      path.join(root, 'src/components/ShareSocial.tsx'),
      'utf8',
    );
    const share = await readFile(
      path.join(root, 'src/components/ShareButton.tsx'),
      'utf8',
    );
    const cta = await readFile(
      path.join(root, 'src/components/EventCtaRow.tsx'),
      'utf8',
    );
    const mother = social.slice(
      social.indexOf('function MotherStatsBlock'),
      social.indexOf('function DaughterRsvp'),
    );
    const daughter = social.slice(social.indexOf('function DaughterRsvp'));
    for (const block of [mother, daughter]) {
      const envieAt = block.indexOf("void tap('envie')");
      const goingAt = block.indexOf("void tap('going')");
      const tipAt = block.indexOf('<SocialTipLine');
      assert.ok(envieAt > 0 && goingAt > envieAt && tipAt > goingAt);
    }
    const labelAt = mother.indexOf('{label ?');
    assert.ok(labelAt > mother.indexOf('<SocialTipLine'));
    assert.match(social, /SOCIAL_TIP_B1_COPY/);
    assert.match(social, /noteConnectedEnvie\(\)/);
    assert.match(mother, /payload\.mine === 'envie'/);
    assert.match(daughter, /data\.kind === 'envie'/);
    assert.equal(social.includes("payload.mine === 'going'"), false);
    assert.equal(social.includes("data.kind === 'going'"), false);
    assert.match(social, /if \(!authed\) return/);
    assert.match(social, /aria-label="Fermer"/);
    assert.match(social, /claimSocialTipBeat1/);
    assert.match(social, /shareActionOwnsSocialTip/);

    const handleStart = share.indexOf('function handleShare');
    const handle = share.slice(handleStart, share.indexOf('function onShareClick'));
    const flashAt = handle.indexOf('flashCopied()');
    const notifyAt = handle.indexOf('notifySocialTip(');
    const shareAt = handle.indexOf('navigator');
    assert.ok(flashAt >= 0 && notifyAt > flashAt && shareAt > notifyAt);
    assert.match(handle, /status === 'authenticated'/);
    assert.match(share, /el\.textContent = 'Lien copié'/);
    assert.equal(cta.includes('socialTip'), false);
    assert.equal(cta.includes('notifySocialTip'), false);
  });

  it('leaves H1, H2, Réserver, toast, carousel rails, and auth gate alone', async () => {
    assert.equal(HOME_ACCROCHE_H1, 'L’agenda culturel de Toulouse.');
    assert.equal(HOME_ACCROCHE_H2, 'Trouvez une sortie, partagez, voyez qui vient.');
    const root = process.cwd();
    const files = [
      'src/lib/displayHome.ts',
      'src/components/SeanceCard.tsx',
      'src/components/LiveCarousel.tsx',
      'src/components/SeanceGrid.tsx',
      'src/components/AuthActionGate.tsx',
      'src/components/BootShellReady.tsx',
      'src/lib/bootShell.ts',
    ];
    for (const file of files) {
      const src = await readFile(path.join(root, file), 'utf8');
      assert.equal(src.includes('SOCIAL_TIP_B1_COPY'), false, file);
      assert.equal(src.includes('cc_social_tip_b1_seen'), false, file);
      assert.equal(src.includes(COPY), false, file);
    }
    const share = await readFile(
      path.join(root, 'src/components/ShareButton.tsx'),
      'utf8',
    );
    assert.match(share, /el\.textContent = 'Lien copié'/);
    assert.equal(share.includes(COPY), false);
  });
});
