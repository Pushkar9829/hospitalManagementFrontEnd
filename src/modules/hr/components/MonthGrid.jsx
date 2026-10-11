import { useTranslation } from 'react-i18next';
import { ATT_CODE, ATT_TONE } from '../api.js';

/** Attendance cell: a one-letter code coloured by status; a button when HR may correct it. */
function Cell({ c, onPick }) {
  const { t } = useTranslation();
  if (!c.status) return <td className="px-1 py-1 text-center text-muted">·</td>;
  const tone = ATT_TONE[c.status];
  const cls =
    tone === 'success'
      ? 'text-success'
      : tone === 'critical'
        ? 'bg-critical-bg text-critical'
        : tone === 'warning'
          ? 'bg-warning-bg text-warning'
          : tone === 'info'
            ? 'bg-info-bg text-info'
            : 'text-muted';
  const label = `${c.date} · ${t(`hr.att.${c.status}`)}${c.inAt ? ` · ${c.inAt}–${c.outAt}` : ''}`;
  return (
    <td className="px-0.5 py-0.5 text-center">
      {onPick ? (
        <button
          type="button"
          title={label}
          aria-label={label}
          onClick={() => onPick(c)}
          className={`w-full rounded px-1 py-0.5 text-xs font-semibold ${cls}`}
        >
          {ATT_CODE[c.status]}
        </button>
      ) : (
        <span title={label} className={`block rounded px-1 py-0.5 text-xs font-semibold ${cls}`}>
          {ATT_CODE[c.status]}
        </span>
      )}
    </td>
  );
}

/** Month grid of attendance rows; `onPick(row, cell)` lets HR correct a day. */
export function MonthGrid({ data, onPick }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('hr.att.caption', { month: data.month })}</caption>
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th className="sticky left-0 bg-surface-2 px-2 py-2 text-left font-semibold">
              {t('hr.col.name')}
            </th>
            {data.days.map((d) => (
              <th key={d} className="px-0.5 py-2 text-center text-xs font-semibold">
                {Number(d.slice(8))}
              </th>
            ))}
            {['present', 'lop', 'late', 'ot'].map((k) => (
              <th key={k} className="px-2 py-2 text-right text-xs font-semibold">
                {t(`hr.att.sum.${k}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.items.map((r) => (
            <tr key={r.employee.id}>
              <th
                scope="row"
                className="sticky left-0 bg-surface px-2 py-1 text-left font-normal whitespace-nowrap"
              >
                {r.employee.name}{' '}
                <span className="font-mono text-xs text-muted">{r.employee.empNo}</span>
              </th>
              {r.cells.map((c) => (
                <Cell
                  key={c.date}
                  c={c}
                  onPick={onPick && !data.locked ? (cell) => onPick(r, cell) : undefined}
                />
              ))}
              <td className="tabular px-2 text-right">{r.summary.present}</td>
              <td className="tabular px-2 text-right">{r.summary.lop}</td>
              <td className="tabular px-2 text-right">{r.summary.late}</td>
              <td className="tabular px-2 text-right">{Math.floor(r.summary.overtimeMin / 60)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        {Object.entries(ATT_CODE)
          .map(([s, code]) => `${code} ${t(`hr.att.${s}`)}`)
          .join(' · ')}
      </p>
    </div>
  );
}
