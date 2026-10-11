import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addReportsStrings } from '@hms/i18n/reports';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Page,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { inr } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate } from '../../dx-kit/format.js';
import {
  useCreateReportScheduleMutation,
  useDeleteReportScheduleMutation,
  useExportReportMutation,
  useLazyExportDownloadQuery,
  useReportCatalogueQuery,
  useReportExportsQuery,
  useReportSchedulesQuery,
  useRunReportQuery,
  useSetReportScheduleMutation,
} from '../api.js';
import { ReportValue } from '../format.jsx';
import { NUMERIC } from '../kinds.js';

const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const kpiText = (k, t) => {
  const v = k.value;
  if (v == null) return '–';
  if (k.kind === 'money') return inr(v);
  if (k.kind === 'percent') return `${v}%`;
  if (k.kind === 'minutes') return t('rep.unit.minutes', { n: v });
  return typeof v === 'number' ? v.toLocaleString('en-IN') : String(v);
};

function Runner({ code }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [from, setFrom] = useUrlState('from', todayIST());
  const [to, setTo] = useUrlState('to', todayIST());
  const [q, setQ] = useUrlState('search', '');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const run = useRunReportQuery({ code, from, to, q: q || undefined, page, limit: 50, ...filters });
  const [exportReport, exporting] = useExportReportMutation();
  const [failure, setFailure] = useState(null);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('rep.from')} className="w-40">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label={t('rep.to')} className="w-40">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
        {(run.data?.filters ?? []).map((f) => (
          <FormField key={f.key} label={f.label} className="w-48">
            <Select
              value={filters[f.key] ?? ''}
              placeholder={t('rep.all')}
              onChange={(e) => {
                setFilters({ ...filters, [f.key]: e.target.value || undefined });
                setPage(1);
              }}
              options={f.options}
            />
          </FormField>
        ))}
        <FormField label={t('rep.search')} className="w-56">
          <Input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <div className="ml-auto flex gap-2">
          {['XLSX', 'PDF'].map((format) => (
            <Button
              key={format}
              variant="secondary"
              loading={exporting.isLoading}
              onClick={async () => {
                setFailure(null);
                try {
                  const out = await exportReport({
                    code,
                    format,
                    filters: { from, to, ...filters },
                  }).unwrap();
                  toast({
                    tone: out.status === 'READY' ? 'success' : 'warning',
                    title:
                      out.status === 'READY'
                        ? t('rep.exported', { format })
                        : t('rep.exportFailed'),
                  });
                } catch (err) {
                  setFailure(err);
                }
              }}
            >
              {t('rep.export', { format })}
            </Button>
          ))}
        </div>
      </div>
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView query={run} rows={8}>
        {(r) => (
          <div className="flex min-w-0 flex-col gap-3">
            {r.description && <p className="text-sm text-muted">{r.description}</p>}
            {r.kpis.length > 0 && (
              <KpiRow
                items={r.kpis.map((k) => ({
                  label: k.label,
                  value: kpiText(k, t),
                  sub: k.note ?? undefined,
                }))}
              />
            )}
            {r.items.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <caption className="sr-only">{r.name}</caption>
                  <thead className="bg-surface-2 text-left text-muted">
                    <tr>
                      {r.columns.map((c) => (
                        <th
                          key={c.key}
                          className={`px-3 py-2 font-semibold whitespace-nowrap ${NUMERIC.has(c.kind) ? 'text-right' : ''}`}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.items.map((row, i) => (
                      <tr key={i}>
                        {r.columns.map((c) => (
                          <td
                            key={c.key}
                            className={`px-3 py-1.5 ${NUMERIC.has(c.kind) ? 'tabular text-right' : ''} ${c.kind === 'id' ? 'font-mono' : ''}`}
                          >
                            <ReportValue kind={c.kind} value={row[c.key]} t={t} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState bordered={false} title={t('rep.noRows')} />
            )}
            {r.total > r.limit && (
              <Pagination page={r.page} limit={r.limit} total={r.total} onPageChange={setPage} />
            )}
            <p className="text-xs text-muted">{t('rep.generated', { n: r.total })}</p>
          </div>
        )}
      </QueryView>
    </div>
  );
}

function ReportsTab() {
  const { t } = useTranslation();
  const cat = useReportCatalogueQuery();
  const [code, setCode] = useUrlState('report', '');
  return (
    <QueryView
      query={cat}
      rows={8}
      empty={<EmptyState title={t('rep.noneAllowed')} />}
      isEmpty={(d) => !d.groups.length}
    >
      {(d) => {
        const current = code || d.groups[0]?.reports[0]?.code;
        const name = d.groups.flatMap((g) => g.reports).find((r) => r.code === current)?.name;
        return (
          <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
            <nav aria-label={t('rep.list')} className="flex flex-col gap-3">
              {d.groups.map((g) => (
                <div key={g.code}>
                  <h3 className="mb-1 text-xs font-semibold text-muted uppercase">{g.name}</h3>
                  <ul className="flex flex-col">
                    {g.reports.map((r) => (
                      <li key={r.code}>
                        <button
                          type="button"
                          aria-current={r.code === current}
                          onClick={() => setCode(r.code)}
                          className={`w-full rounded-control px-2 py-1 text-left text-sm ${r.code === current ? 'bg-info-bg font-semibold' : 'hover:bg-surface-2'}`}
                        >
                          {r.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="flex min-w-0 flex-col gap-2">
              <h2 className="text-lg font-semibold">{name}</h2>
              {current && <Runner key={current} code={current} />}
            </div>
          </div>
        );
      }}
    </QueryView>
  );
}

function ExportsTab() {
  const { t } = useTranslation();
  const q = useReportExportsQuery({});
  const [download] = useLazyExportDownloadQuery();
  const [failure, setFailure] = useState(null);
  return (
    <div className="flex flex-col gap-3">
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView
        query={q}
        rows={4}
        empty={<EmptyState bordered={false} title={t('rep.ex.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-56 flex-1">
                  <span className="font-semibold">{e.reportName}</span> · {e.format}
                  <span className="block text-xs text-muted">
                    {e.filtersLabel} ·{' '}
                    {t('rep.ex.by', { by: e.requestedBy, date: fmtDate(e.requestedAt) })}
                    {e.rows != null && ` · ${t('rep.ex.rows', { n: e.rows })}`}
                  </span>
                </span>
                <StatusBadge
                  tone={
                    e.status === 'READY'
                      ? 'success'
                      : e.status === 'FAILED'
                        ? 'critical'
                        : 'warning'
                  }
                  label={t(`rep.ex.status.${e.status}`)}
                />
                {e.status === 'READY' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      setFailure(null);
                      try {
                        const { url } = await download(e.id).unwrap();
                        window.open(url, '_blank', 'noopener');
                      } catch (err) {
                        setFailure(err);
                      }
                    }}
                  >
                    {t('rep.ex.download')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

const DAYS = [0, 1, 2, 3, 4, 5, 6];

function SchedulesTab() {
  const { t } = useTranslation();
  const cat = useReportCatalogueQuery();
  const q = useReportSchedulesQuery();
  const [create, creating] = useCreateReportScheduleMutation();
  const [setActive] = useSetReportScheduleMutation();
  const [remove] = useDeleteReportScheduleMutation();
  const [f, setF] = useState({
    reportCode: '',
    frequency: 'DAILY',
    time: '07:00',
    dayOfWeek: '1',
    dayOfMonth: '1',
    format: 'XLSX',
    recipients: '',
  });
  const [failure, setFailure] = useState(null);
  const run = async (fn) => {
    setFailure(null);
    try {
      await fn();
    } catch (err) {
      setFailure(err);
    }
  };
  const reports = (cat.data?.groups ?? []).flatMap((g) => g.reports);
  return (
    <div className="flex flex-col gap-4">
      {failure && <ApiErrorNotice error={failure} />}
      <Card title={t('rep.sch.new')} description={t('rep.sch.hint')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t('rep.sch.report')} className="sm:col-span-2">
            <Select
              value={f.reportCode}
              placeholder={t('rep.sch.pick')}
              onChange={(e) => setF({ ...f, reportCode: e.target.value })}
              options={reports.map((r) => ({ value: r.code, label: r.name }))}
            />
          </FormField>
          <FormField label={t('rep.sch.format')}>
            <Select
              value={f.format}
              onChange={(e) => setF({ ...f, format: e.target.value })}
              options={['XLSX', 'PDF'].map((x) => ({ value: x, label: x }))}
            />
          </FormField>
          <FormField label={t('rep.sch.frequency')}>
            <Select
              value={f.frequency}
              onChange={(e) => setF({ ...f, frequency: e.target.value })}
              options={['DAILY', 'WEEKLY', 'MONTHLY'].map((x) => ({
                value: x,
                label: t(`rep.sch.freq.${x}`),
              }))}
            />
          </FormField>
          {f.frequency === 'WEEKLY' && (
            <FormField label={t('rep.sch.day')}>
              <Select
                value={f.dayOfWeek}
                onChange={(e) => setF({ ...f, dayOfWeek: e.target.value })}
                options={DAYS.map((d) => ({ value: String(d), label: t(`rep.sch.dow.${d}`) }))}
              />
            </FormField>
          )}
          {f.frequency === 'MONTHLY' && (
            <FormField label={t('rep.sch.dom')}>
              <Input
                inputMode="numeric"
                value={f.dayOfMonth}
                onChange={(e) => setF({ ...f, dayOfMonth: e.target.value })}
              />
            </FormField>
          )}
          <FormField label={t('rep.sch.time')}>
            <Input
              type="time"
              value={f.time}
              onChange={(e) => setF({ ...f, time: e.target.value })}
            />
          </FormField>
          <FormField
            label={t('rep.sch.recipients')}
            hint={t('rep.sch.recipientsHint')}
            className="sm:col-span-3"
          >
            <Input
              value={f.recipients}
              onChange={(e) => setF({ ...f, recipients: e.target.value })}
            />
          </FormField>
        </div>
        <Button
          className="mt-3"
          loading={creating.isLoading}
          disabled={!f.reportCode}
          onClick={() =>
            run(async () => {
              await create({
                reportCode: f.reportCode,
                frequency: f.frequency,
                time: f.time,
                dayOfWeek: f.frequency === 'WEEKLY' ? Number(f.dayOfWeek) : undefined,
                dayOfMonth: f.frequency === 'MONTHLY' ? Number(f.dayOfMonth) : undefined,
                format: f.format,
                recipients: f.recipients
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              }).unwrap();
              setF({ ...f, reportCode: '', recipients: '' });
            })
          }
        >
          {t('rep.sch.save')}
        </Button>
      </Card>
      <Banner tone="info">{t('rep.sch.mailNote')}</Banner>
      <QueryView
        query={q}
        rows={3}
        empty={<EmptyState bordered={false} title={t('rep.sch.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-56 flex-1">
                  <span className="font-semibold">{s.reportName}</span> ·{' '}
                  {t(`rep.sch.freq.${s.frequency}`)} · {s.time} · {s.format}
                  <span className="block text-xs text-muted">
                    {s.nextRunAt && t('rep.sch.next', { date: fmtDate(s.nextRunAt) })}
                    {s.lastRunAt && ` · ${t('rep.sch.last', { date: fmtDate(s.lastRunAt) })}`}
                  </span>
                </span>
                <StatusBadge
                  tone={s.active ? 'success' : 'neutral'}
                  label={s.active ? t('rep.sch.active') : t('rep.sch.paused')}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => run(() => setActive({ id: s.id, active: !s.active }).unwrap())}
                >
                  {s.active ? t('rep.sch.pause') : t('rep.sch.resume')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => remove(s.id).unwrap())}>
                  {t('rep.sch.delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

/**
 * Reports centre (board Reports, route /reports): every report the user may run, grouped, with
 * period, filters, search, KPIs and the table; XLSX and PDF exports; scheduled reports.
 */
export default function ReportsPage() {
  useStrings(addDxkitStrings, addReportsStrings);
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('rep.title') }]}
        title={t('rep.title')}
        description={t('rep.description')}
      />
      <UrlTabs
        param="tab"
        label={t('rep.tabsLabel')}
        reset={['report', 'search', 'from', 'to']}
        tabs={[
          { id: 'reports', label: t('rep.tabs.reports'), body: <ReportsTab /> },
          { id: 'exports', label: t('rep.tabs.exports'), body: <ExportsTab /> },
          { id: 'schedules', label: t('rep.tabs.schedules'), body: <SchedulesTab /> },
        ]}
      />
    </Page>
  );
}
