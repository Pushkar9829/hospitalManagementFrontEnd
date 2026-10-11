import { makeBundle } from './bundle.js';
import { financeEn } from './finance.en.js';
import { financeHi } from './finance.hi.js';

export { financeEn, financeHi };

/** Adds the finance screens' strings to an i18next instance (once). */
export const addFinanceStrings = makeBundle(financeEn, financeHi);
