import { useId, useState } from 'react';
import { cn } from '@hms/ui';

/**
 * Vertical columns for one series over an ordered axis (arrivals by hour), no chart library.
 * One hue (primary), bars anchored to the baseline with rounded tops and a 2px gap. Each column
 * is focusable and shows its tooltip on hover or focus; `highlight` labels one column directly
 * (the peak). The same numbers are in a table under "Show as table" for screen readers and print.
 * items: [{ key, label, value, tooltip }]
 */
export function ColumnChart({
  items,
  label,
  highlight,
  height = 160,
  tableLabel,
  columnHeader,
  valueHeader,
  className,
}) {
  const [active, setActive] = useState(null);
  const tableId = useId();
  const max = Math.max(1, ...items.map((i) => i.value));
  const current = items.find((i) => i.key === active);
  const idx = items.findIndex((i) => i.key === active);
  // Over the hovered column, kept clear of the chart's edges.
  const tipLeft = `${Math.min(85, Math.max(15, ((idx + 0.5) / items.length) * 100))}%`;

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <div className="relative" style={{ height: height + 24 }}>
        {current && (
          <div
            role="status"
            style={{ left: tipLeft }}
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 rounded-control border border-line bg-surface px-2.5 py-1 text-sm whitespace-nowrap text-ink shadow-card"
          >
            {current.tooltip}
          </div>
        )}
        <ul
          aria-label={label}
          className="absolute inset-x-0 bottom-6 flex items-end gap-0.5 border-b border-line-strong"
          style={{ height }}
          onMouseLeave={() => setActive(null)}
        >
          {items.map((i) => {
            // 20px stays free above the tallest bar for the direct label.
            const h = Math.max(2, Math.round((i.value / max) * (height - 20)));
            return (
              <li key={i.key} className="h-full min-w-0 flex-1">
                {/* The hit target is the whole column height, larger than the bar. */}
                <button
                  type="button"
                  aria-label={i.tooltip}
                  onMouseEnter={() => setActive(i.key)}
                  onFocus={() => setActive(i.key)}
                  onBlur={() => setActive(null)}
                  className="flex h-full w-full cursor-default flex-col items-center justify-end"
                >
                  {highlight === i.key && (
                    <span
                      aria-hidden="true"
                      className="tabular mb-1 text-sm font-semibold text-ink"
                    >
                      {i.value}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'block w-full max-w-10 rounded-t-[4px] bg-primary transition-opacity',
                      active && active !== i.key ? 'opacity-50' : 'opacity-100',
                    )}
                    style={{ height: h }}
                  />
                </button>
              </li>
            );
          })}
        </ul>
        <ol aria-hidden="true" className="absolute inset-x-0 bottom-0 flex gap-0.5">
          {items.map((i) => (
            <li key={i.key} className="tabular flex-1 text-center text-xs text-muted">
              {i.label}
            </li>
          ))}
        </ol>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{tableLabel}</summary>
        <table id={tableId} className="mt-2 w-full max-w-sm text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 font-semibold">{columnHeader}</th>
              <th className="py-1 text-right font-semibold">{valueHeader}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => (
              <tr key={i.key}>
                <td className="py-1">{i.label}</td>
                <td className="tabular py-1 text-right">{i.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
