/**
 * The web app keeps its own copy of @hms/shared (permissions, catalogue, schemas) so web/ deploys
 * on its own. The API's copy in ../api/packages/shared is the source: run `npm run sync:shared`
 * after changing it. `--check` only reports differences (used by the test suite).
 */
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(here, '../../api/packages/shared/src');
export const COPY = resolve(here, '../packages/shared/src');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/** Relative paths that differ, are missing, or are extra in the copy. */
export function differences() {
  if (!existsSync(SOURCE)) return null; // web/ deployed on its own: nothing to compare with
  const src = new Map(files(SOURCE).map((p) => [relative(SOURCE, p), p]));
  const copy = new Map(files(COPY).map((p) => [relative(COPY, p), p]));
  const out = [];
  for (const [rel, p] of src) {
    const c = copy.get(rel);
    if (!c) out.push(`missing ${rel}`);
    else if (
      readFileSync(p, 'utf8').replace(/\r\n/g, '\n') !==
      readFileSync(c, 'utf8').replace(/\r\n/g, '\n')
    )
      out.push(`differs ${rel}`);
  }
  for (const rel of copy.keys()) if (!src.has(rel)) out.push(`extra ${rel}`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const diff = differences();
  if (diff === null) {
    console.log('No ../api folder here; the copy stays as it is.');
  } else if (process.argv.includes('--check')) {
    console.log(diff.length ? diff.join('\n') : 'web/packages/shared matches the API copy.');
    process.exitCode = diff.length ? 1 : 0;
  } else {
    rmSync(COPY, { recursive: true, force: true });
    cpSync(SOURCE, COPY, { recursive: true });
    console.log(`Copied ${SOURCE} -> ${COPY}`);
  }
}
