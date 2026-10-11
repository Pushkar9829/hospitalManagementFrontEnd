import { useTranslation } from 'react-i18next';
import { cn } from '@hms/ui';
import { FLAG_TEXT_CLASS } from '../lab.js';

/**
 * Results with unit, reference range, flag (as text, never colour alone) and the delta from the
 * last released value.
 */
export function ResultsTable({ results, caption }) {
  const { t } = useTranslation();
  const shown = (results ?? []).filter((r) => r.value);
  if (!shown.length) return <p className="text-sm text-muted">{t('lab.res.noValues')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">{caption ?? t('lab.res.title')}</caption>
        <thead className="bg-surface-2 text-left text-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">{t('lab.res.col.test')}</th>
            <th className="px-3 py-2 font-semibold">{t('lab.res.col.value')}</th>
            <th className="px-3 py-2 font-semibold">{t('lab.res.col.flag')}</th>
            <th className="px-3 py-2 font-semibold">{t('lab.res.col.range')}</th>
            <th className="px-3 py-2 font-semibold">{t('lab.res.col.previous')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((r) => (
            <tr key={r.code}>
              <td className="px-3 py-2">{r.name}</td>
              <td className={cn('tabular px-3 py-2', FLAG_TEXT_CLASS[r.flag])}>
                {r.value} {r.unit && <span className="font-normal text-muted">{r.unit}</span>}
              </td>
              <td className="px-3 py-2">
                {r.flag && r.flag !== 'N' ? (
                  <span className={FLAG_TEXT_CLASS[r.flag]}>{t(`lab.flag.${r.flag}`)}</span>
                ) : (
                  <span className="text-muted">{r.flag === 'N' ? t('lab.flag.N') : '-'}</span>
                )}
              </td>
              <td className="tabular px-3 py-2 text-muted">{r.range ?? '-'}</td>
              <td className="tabular px-3 py-2 text-muted">
                {r.delta ? t('lab.res.delta', { prev: r.delta.prev, pct: r.delta.changePct }) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
