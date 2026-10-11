import { describe, expect, it } from 'vitest';
import { differences } from '../scripts/sync-shared.mjs';

describe('@hms/shared copy', () => {
  it('matches the API copy (run `npm run sync:shared` after changing api/packages/shared)', () => {
    const diff = differences();
    if (diff === null) return; // web/ checked out on its own
    expect(diff).toEqual([]);
  });
});
