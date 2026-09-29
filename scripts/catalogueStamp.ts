/**
 * Identité du catalogue lu par l'audit et par les archives de banc.
 * Lecture seule : ne réécrit aucun CSV.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function sha256File(rel: string): string {
  const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

/** SHA court (7) de HEAD. Chaîne vide si git est indisponible. */
export function gitCommitShort(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}
