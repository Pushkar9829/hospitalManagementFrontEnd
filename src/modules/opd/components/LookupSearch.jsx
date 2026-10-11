import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { FormField, Input, Spinner } from '@hms/ui';
import { useDebounced } from '../../../lib/useDebounced.js';

/**
 * A search box over a look-up list (ICD-10, formulary, orderables). `useQuery(term)` is the
 * RTK Query hook; results are buttons (Tab and Enter pick one), the count is announced, and
 * picking clears the box for the next entry. `render(item)` draws one result.
 */
export function LookupSearch({ label, hint, useQuery, params, render, onPick, itemKey }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 250);
  const listId = useId();
  const short = term.length < 2;
  const { data, isFetching } = useQuery(params ? { ...params, q: term } : term, { skip: short });
  const items = short ? [] : (data?.items ?? []);

  return (
    <div className="flex flex-col gap-2">
      <FormField label={label} hint={hint}>
        <div className="relative">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            className="pl-9"
            autoComplete="off"
            aria-controls={listId}
            placeholder={t('opd.consult.search.placeholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {isFetching && <Spinner className="absolute top-1/2 right-3 -translate-y-1/2" />}
        </div>
      </FormField>
      <div id={listId} aria-live="polite">
        {!short && !isFetching && data && (
          <p className="sr-only">{t('opd.consult.search.count', { count: items.length })}</p>
        )}
        {!short && !isFetching && data && items.length === 0 && (
          <p className="text-sm text-muted">{t('opd.consult.search.none', { q: term })}</p>
        )}
        {items.length > 0 && (
          <ul className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto rounded-control border border-line">
            {items.map((it) => (
              <li key={itemKey(it)}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(it);
                    setQ('');
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2"
                >
                  {render(it)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
