import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every `name: b.query(` / `name: b.mutation(` across the module API files. */
function endpointNames(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...endpointNames(p));
    else if (f === 'api.js' || f === 'baseApi.js')
      for (const m of readFileSync(p, 'utf8').matchAll(
        /^\s+([A-Za-z0-9]+): b\.(?:query|mutation)\(/gm,
      ))
        out.push(`${m[1]} (${p})`);
  }
  return out;
}

describe('RTK Query endpoints', () => {
  // injectEndpoints keeps the first definition of a name, so a second module with the same
  // name silently calls the first module's URL.
  it('has no endpoint name defined twice', () => {
    const all = endpointNames(join(import.meta.dirname, '..'));
    const seen = new Map();
    const dupes = [];
    for (const e of all) {
      const name = e.split(' ')[0];
      if (seen.has(name)) dupes.push(`${e} and ${seen.get(name)}`);
      else seen.set(name, e);
    }
    expect(dupes).toEqual([]);
  });
});
