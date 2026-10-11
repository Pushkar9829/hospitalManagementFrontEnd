import { makeBundle } from './bundle.js';
import { peopleEn } from './people.en.js';
import { peopleHi } from './people.hi.js';

export { peopleEn, peopleHi };

/** Adds the HR, roster, payroll and My Space screens' strings to an i18next instance (once). */
export const addPeopleStrings = makeBundle(peopleEn, peopleHi);
