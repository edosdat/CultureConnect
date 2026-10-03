import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * WCAG 2.x contrast, no dependency.
 * Relative luminance: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

function mix(fg: string, bg: string, amount: number): string {
  const a = fg.replace('#', '');
  const b = bg.replace('#', '');
  const ch = (i: number) =>
    Math.round(
      parseInt(a.slice(i, i + 2), 16) * amount +
        parseInt(b.slice(i, i + 2), 16) * (1 - amount),
    );
  return (
    '#' +
    [0, 2, 4].map((i) => ch(i).toString(16).padStart(2, '0')).join('')
  );
}

const NUIT = '#1A0B1E';
const VELOURS = '#2A1231';
const SABLE = '#3A1840';
const CREME = '#FFF1F4';
const MUTED = '#D3B3CE';
const ROSE = '#FF2E7E';
const ROSE_HOVER = '#FF6FA5';
/** muted à 60 % sur velours. */
const CONTROLE = mix(MUTED, VELOURS, 0.6);

const SRC = path.join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

describe('contraste thème nuit — PR 1', () => {
  it('texte crème et muted sur nuit, velours, sable ≥ 4.5', () => {
    for (const bg of [NUIT, VELOURS, SABLE]) {
      assert.ok(contrast(CREME, bg) >= 4.5, `crème sur ${bg} = ${contrast(CREME, bg)}`);
      assert.ok(contrast(MUTED, bg) >= 4.5, `muted sur ${bg} = ${contrast(MUTED, bg)}`);
    }
  });

  it('rose sur nuit et velours ≥ 4.5, pas de petit texte rose sur sable', () => {
    assert.ok(contrast(ROSE, NUIT) >= 4.5);
    assert.ok(contrast(ROSE, VELOURS) >= 4.5);
    const onSable = contrast(ROSE, SABLE);
    assert.ok(onSable < 4.5, `rose sur sable devrait rester sous 4.5 (mesuré ${onSable.toFixed(2)})`);
  });

  it('nuit sur rose et sur rose-hover ≥ 4.5', () => {
    assert.ok(contrast(NUIT, ROSE) >= 4.5);
    assert.ok(contrast(NUIT, ROSE_HOVER) >= 4.5);
  });

  it('bordure de contrôle sur nuit, velours et sable ≥ 3', () => {
    assert.equal(CONTROLE.toLowerCase(), '#8f738f');
    for (const bg of [NUIT, VELOURS, SABLE]) {
      assert.ok(
        contrast(CONTROLE, bg) >= 3,
        `contrôle ${CONTROLE} sur ${bg} = ${contrast(CONTROLE, bg).toFixed(2)}`,
      );
    }
  });

  it('pose les tokens planc et les alias culture / --cc-*', () => {
    const tw = fs.readFileSync(path.join(process.cwd(), 'tailwind.config.ts'), 'utf8');
    for (const hex of [NUIT, VELOURS, SABLE, CREME, MUTED, ROSE, ROSE_HOVER, '#8F738F']) {
      assert.ok(tw.includes(hex), `tailwind manque ${hex}`);
    }
    assert.match(tw, /alias temporaire, à renommer en planc/);
    const css = fs.readFileSync(path.join(SRC, 'app/globals.css'), 'utf8');
    assert.match(css, /--cc-cream:\s*#1a0b1e/i);
    assert.match(css, /--cc-surface:\s*#2a1231/i);
    assert.match(css, /--cc-ink:\s*#fff1f4/i);
    assert.match(css, /--cc-terracotta:\s*#ff2e7e/i);
    assert.match(css, /alias temporaire, à renommer en planc/);
  });

  it('ne laisse ni bg-white ni text-white dans src', () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      if (file.endsWith(`${path.sep}nightContrast.test.ts`)) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (/\bbg-white\b/.test(text) || /\btext-white\b/.test(text)) {
        hits.push(path.relative(process.cwd(), file));
      }
    }
    assert.deepEqual(hits, []);
  });
});
