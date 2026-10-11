import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Card, DataTable, EmptyState, StatusBadge, cn } from '@hms/ui';
import { inr } from '../../../lib/money.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, fmtDateTime, fmtMonth, fmtTime, localeOf } from '../../dx-kit/format.js';
import { useRoleHomeQuery } from '../api.js';

const TONE = {
  critical: 'border-critical bg-critical-bg',
  warning: 'border-warning bg-warning-bg',
};
const humanize = (code) =>
  String(code ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
/** home.w.opd.myToday: widget ids are module.name, which nest naturally. */
const wKey = (id, part) => `rh.w.${id}.${part}`;

/** A widget's parameters ready for its subtitle: money, dates and statuses formatted. */
function useParams(params = {}) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === 'context') continue;
    if (k === 'amount') out[k] = inr(v);
    else if (k === 'since') out[k] = fmtTime(v, locale);
    else if (k === 'date') out[k] = fmtDate(v, locale);
    else if (k === 'month') out[k] = fmtMonth(v, locale);
    else if (k === 'status') out[k] = t(`rh.status.${v}`, { defaultValue: humanize(v) });
    else out[k] = typeof v === 'number' ? v.toLocaleString(locale) : v;
  }
  return out;
}

function kpiValue(w, t, locale) {
  if (w.value == null) return t('rh.none');
  if (w.format === 'money') return inr(w.value);
  if (w.format === 'percent') return `${w.value}%`;
  if (w.format === 'month') return fmtMonth(w.value, locale);
  if (typeof w.value === 'number') return w.value.toLocaleString(locale);
  return String(w.value);
}

function Kpi({ w }) {
  const { t, i18n } = useTranslation();
  const params = useParams(w.params);
  const sub = t(wKey(w.id, 'sub'), { ...params, context: w.params?.context, defaultValue: '' });
  const body = (
    <>
      <span className="text-sm text-muted">{t(wKey(w.id, 'label'))}</span>
      <span className="tabular text-2xl font-semibold text-ink">
        {kpiValue(w, t, localeOf(i18n))}
      </span>
      {sub && <span className="text-sm text-muted">{sub}</span>}
    </>
  );
  const cls = cn(
    'flex min-h-28 flex-col gap-1 rounded-card border border-line bg-surface p-4 shadow-card',
    TONE[w.tone],
  );
  return w.link ? (
    <Link to={w.link} className={cn(cls, 'hover:border-muted')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Cell({ kind, value }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  if (value == null || value === '') return <span className="text-muted">–</span>;
  switch (kind) {
    case 'status':
      return (
        <StatusBadge
          tone={value.tone ?? 'neutral'}
          label={t(`rh.status.${value.code}`, { defaultValue: humanize(value.code) })}
        />
      );
    case 'id':
      return <span className="font-mono">{value}</span>;
    case 'money':
      return <span className="tabular">{inr(value)}</span>;
    case 'minutes':
      return <span className="tabular">{t('rh.minutes', { n: value })}</span>;
    case 'count':
      return <span className="tabular">{Number(value).toLocaleString(locale)}</span>;
    case 'date':
      return fmtDate(value, locale);
    case 'datetime':
      return fmtDateTime(value, locale);
    case 'time':
      return fmtTime(value, locale);
    case 'month':
      return fmtMonth(value, locale);
    default:
      return String(value);
  }
}

function WorkList({ w }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const title = t(wKey(w.id, 'label'));
  return (
    <Card
      title={title}
      padding={false}
      actions={
        w.link ? (
          <Link to={w.link} className="text-sm font-semibold text-primary hover:underline">
            {t('rh.openAll')}
          </Link>
        ) : null
      }
    >
      <DataTable
        caption={title}
        data={w.rows}
        empty={t('rh.listEmpty')}
        onRowClick={(row) => row.link && navigate(row.link)}
        columns={w.columns.map((c) => ({
          id: c.key,
          header: t(`rh.col.${c.key}`, { defaultValue: humanize(c.key) }),
          cell: ({ row }) => <Cell kind={c.kind} value={row.original[c.key]} />,
        }))}
      />
    </Card>
  );
}

function Alerts({ items }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  return (
    <Card title={t('rh.alertsTitle')}>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((a, i) => (
            <li key={i}>
              <Link
                to={a.link ?? '#'}
                className={cn(
                  'flex items-start gap-2 rounded-control border p-2.5 hover:border-muted',
                  TONE[a.tone] ?? 'border-line',
                )}
              >
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-critical"
                />
                <span className="flex flex-col">
                  <span className="font-semibold text-ink">
                    {t(`rh.alert.${a.type}`, a.params)}
                  </span>
                  {a.at && <span className="text-sm text-muted">{fmtDateTime(a.at, locale)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('rh.noAlerts')} />
      )}
    </Card>
  );
}

/** The panel's widgets: KPI tiles, then the worklist beside the alerts. */
export function RoleHome({ panel }) {
  const { t } = useTranslation();
  const query = useRoleHomeQuery(panel, { pollingInterval: 60_000 });
  return (
    <QueryView query={query} errorTitle={t('rh.failed')} rows={3}>
      {(data) => {
        const kpis = data.widgets.filter((w) => w.kind === 'kpi');
        const lists = data.widgets.filter((w) => w.kind === 'list');
        const alerts = data.widgets.filter((w) => w.kind === 'alerts').flatMap((w) => w.items);
        const hasAlerts = data.widgets.some((w) => w.kind === 'alerts');
        return (
          <div className="flex flex-col gap-4">
            {kpis.length > 0 && (
              <section
                aria-label={t('rh.kpisLabel')}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
              >
                {kpis.map((w) => (
                  <Kpi key={w.id} w={w} />
                ))}
              </section>
            )}
            {(lists.length > 0 || hasAlerts) && (
              <div
                className={cn('grid gap-4', hasAlerts && lists.length && 'xl:grid-cols-[2fr_1fr]')}
              >
                {lists.length > 0 && (
                  <div className="flex min-w-0 flex-col gap-4">
                    {lists.map((w) => (
                      <WorkList key={w.id} w={w} />
                    ))}
                  </div>
                )}
                {hasAlerts && <Alerts items={alerts} />}
              </div>
            )}
          </div>
        );
      }}
    </QueryView>
  );
}
