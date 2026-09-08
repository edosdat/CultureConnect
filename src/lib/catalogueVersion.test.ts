import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOGUE_STAMP_FILES,
  catalogueSourceStamp,
  catalogueVersion,
} from './catalogueVersion';

describe('catalogueVersion', () => {
  it('hashes programme / events / films mtimes into 12 hex chars', () => {
    const stamp = catalogueSourceStamp();
    for (const name of CATALOGUE_STAMP_FILES) {
      assert.ok(stamp.includes(`${name}:`));
    }
    const version = catalogueVersion(stamp);
    assert.match(version, /^[0-9a-f]{12}$/);
    assert.equal(catalogueVersion(stamp), version);
    assert.notEqual(catalogueVersion(`${stamp}|rotated`), version);
  });
});
