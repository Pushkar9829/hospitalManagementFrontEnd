import { makeBundle } from './bundle.js';
import { consoleEn } from './console.en.js';
import { consoleHi } from './console.hi.js';

export { consoleEn, consoleHi };

/** Adds the platform console's strings to an i18next instance (once). */
export const addConsoleStrings = makeBundle(consoleEn, consoleHi);
