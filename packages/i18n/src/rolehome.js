import { makeBundle } from './bundle.js';
import { roleHomeEn } from './rolehome.en.js';
import { roleHomeHi } from './rolehome.hi.js';

export { roleHomeEn, roleHomeHi };

/** Adds the role home pages' strings to an i18next instance (once). */
export const addRoleHomeStrings = makeBundle(roleHomeEn, roleHomeHi);
