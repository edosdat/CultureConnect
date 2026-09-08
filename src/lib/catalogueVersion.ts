import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

/** Files whose mtime turns over when the published catalogue rotates. */
export const CATALOGUE_STAMP_FILES = [
  'programme.csv',
  'evenements.csv',
  'films.csv',
] as const;

function fileMtimeMs(filename: string): number {
  try {
    return fs.statSync(path.join(process.cwd(), 'data', filename)).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Stable stamp for ETag / cache keys: CSV mtimes + deploy id when present.
 * Server-only (fs). Pass the hex from `catalogueVersion()` to the client.
 */
export function catalogueSourceStamp(): string {
  const bits = CATALOGUE_STAMP_FILES.map(
    (name) => `${name}:${fileMtimeMs(name)}`,
  );
  const build = (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    ''
  ).trim();
  if (build) bits.push(`build:${build}`);
  return bits.join('|');
}

/** 12-char sha1 of the catalogue stamp — cheap to put on the slim boot JSON. */
export function catalogueVersion(stamp = catalogueSourceStamp()): string {
  return createHash('sha1').update(stamp).digest('hex').slice(0, 12);
}
