import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addReportsStrings } from '@hms/i18n/reports';
import { cn } from '@hms/ui';
import { inr } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useDashboardQuery } from '../api.js';

const TONE = {
  critical: 'border-critical bg-critical-bg',
  warning: 'border-warning bg-warning-bg',
};

const value = (tile) => {
  if (tile.value == null) return '–';
  if (tile.kind === 'money') return inr(tile.value);
  return typeof tile.value === 'number' ? tile.value.toLocaleString('en-IN') : String(tile.value);
};

/**
 * Management dashboard: today's live numbers from every module the user may report on, each
 * linking to its report. Nothing shows for a user without report access.
 */
export function HospitalDashboard() {
  useStrings(addReportsStrings);
  const { t } = useTranslation();
  const q = useDashboardQuery(undefined, { pollingInterval: 120_000 });
  const groups = q.data?.groups ?? [];
  if (!groups.length) return null;
  return (
    <section aria-label={t('rep.dash.title')} className="flex flex-col gap-3">
      <h2 className="text-md font-semibold">{t('rep.dash.title')}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {groups.flatMap((g) =>
          g.items.map((tile) => (
            <Link
              key={tile.key}
              to={tile.report ? `/reports?report=${tile.report}` : '/reports'}
              className={cn(
                'flex flex-col gap-1 rounded-card border border-line bg-surface p-4 hover:border-muted',
                TONE[tile.tone],
              )}
            >
              <span className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">
                {g.name}
              </span>
              <span className="text-sm text-muted">{tile.label}</span>
              <span className="tabular text-2xl font-semibold text-ink">{value(tile)}</span>
              {tile.note && <span className="text-sm text-muted">{tile.note}</span>}
            </Link>
          )),
        )}
      </div>
    </section>
  );
}
