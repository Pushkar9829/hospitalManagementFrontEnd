import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { addLabStrings } from '@hms/i18n/lab';
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
  StatusBadge,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { PickList } from '../../dx-kit/PickList.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDateTime, localeOf } from '../../dx-kit/format.js';
import {
  useCreateQcControlMutation,
  useLeveyJenningsQuery,
  useQcControlsQuery,
  useRecordQcRunMutation,
} from '../api.js';
import { EqasTab, LotsTab, MaintenanceTab, QcRulesTab } from '../components/Registers.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { QC_TONE } from '../lab.js';

const W = 640;
const H = 240;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

/**
 * Levey-Jennings chart: each run's value in SD units from the mean, with the ±1, ±2 and ±3 SD
 * lines. Rejected runs are drawn as squares and warnings as triangles, so shape (not only
 * colour) carries the state; the run list under the chart gives the same data as text.
 */
function LeveyJennings({ runs, label }) {
  const { t } = useTranslation();
  if (!runs.length) return <p className="text-sm text-muted">{t('lab.qc.noRuns')}</p>;
  const x = (i) => PAD.l + (runs.length === 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (runs.length - 1));
  const y = (z) => PAD.t + ((4 - Math.max(-4, Math.min(4, z))) * (H - PAD.t - PAD.b)) / 8;
  const line = runs.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r.z)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full">
      {[-3, -2, -1, 0, 1, 2, 3].map((sd) => (
        <g key={sd}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(sd)}
            y2={y(sd)}
            className={
              sd === 0
                ? 'stroke-ink'
                : Math.abs(sd) === 3
                  ? 'stroke-critical'
                  : Math.abs(sd) === 2
                    ? 'stroke-warning'
                    : 'stroke-line'
            }
            strokeWidth={sd === 0 ? 1.5 : 1}
            strokeDasharray={sd === 0 ? undefined : '4 4'}
          />
          <text x={PAD.l - 6} y={y(sd) + 4} textAnchor="end" className="fill-muted text-[11px]">
            {sd === 0 ? t('lab.qc.mean') : `${sd > 0 ? '+' : ''}${sd}SD`}
          </text>
        </g>
      ))}
      <path d={line} fill="none" className="stroke-primary" strokeWidth={2} />
      {runs.map((r, i) =>
        r.status === 'REJECTED' ? (
          <rect
            key={r.id}
            x={x(i) - 5}
            y={y(r.z) - 5}
            width={10}
            height={10}
            className="fill-critical stroke-surface"
            strokeWidth={2}
          >
            <title>{`${r.value} (${r.z} SD) · ${r.rules.join(', ')}`}</title>
          </rect>
        ) : r.status === 'WARNING' ? (
          <path
            key={r.id}
            d={`M${x(i)},${y(r.z) - 6} L${x(i) + 6},${y(r.z) + 5} L${x(i) - 6},${y(r.z) + 5} Z`}
            className="fill-warning stroke-surface"
            strokeWidth={2}
          >
            <title>{`${r.value} (${r.z} SD) · ${r.rules.join(', ')}`}</title>
          </path>
        ) : (
          <circle
            key={r.id}
            cx={x(i)}
            cy={y(r.z)}
            r={4.5}
            className="fill-primary stroke-surface"
            strokeWidth={2}
          >
            <title>{`${r.value} (${r.z} SD)`}</title>
          </circle>
        ),
      )}
    </svg>
  );
}

function ControlDetail({ control, canRun }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const lj = useLeveyJenningsQuery(control.id);
  const [value, setValue] = useState('');
  const [failure, setFailure] = useState(null);
  const [record, state] = useRecordQcRunMutation();
  const n = Number(value);
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">
            {control.analyser} · {control.name} · {control.level}
          </h2>
          {control.last && (
            <StatusBadge
              tone={QC_TONE[control.last.status]}
              label={t(`lab.qc.status.${control.last.status}`)}
            />
          )}
        </div>
        <p className="text-sm text-muted">
          {t('lab.qc.target', {
            mean: control.mean,
            sd: control.sd,
            unit: control.unit ?? '',
            lot: control.lot ?? '-',
          })}
        </p>
        {canRun && (
          <form
            noValidate
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setFailure(null);
              try {
                const r = await record({ controlId: control.id, value: n }).unwrap();
                setValue('');
                toast({
                  tone:
                    r.status === 'IN_CONTROL'
                      ? 'success'
                      : r.status === 'WARNING'
                        ? 'warning'
                        : 'critical',
                  title: t(`lab.qc.recorded.${r.status}`, { rule: r.rules[0] ?? '', z: r.z }),
                  description: r.held ? t('lab.qc.held', { count: r.held }) : undefined,
                });
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            <FormField label={t('lab.qc.value', { unit: control.unit ?? '' })} className="w-48">
              <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </FormField>
            <Button
              type="submit"
              loading={state.isLoading}
              disabled={!value.trim() || !Number.isFinite(n)}
            >
              {t('lab.qc.record')}
            </Button>
          </form>
        )}
        <ApiErrorNotice error={failure} />
        <QueryView query={lj} rows={4}>
          {(d) => (
            <>
              <LeveyJennings
                runs={d.runs}
                label={t('lab.qc.chartLabel', { name: control.name, level: control.level })}
              />
              <div className="flex flex-wrap gap-4 text-sm text-muted">
                <span>● {t('lab.qc.status.IN_CONTROL')}</span>
                <span>▲ {t('lab.qc.status.WARNING')}</span>
                <span>■ {t('lab.qc.status.REJECTED')}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm">
                  <caption className="sr-only">{t('lab.qc.runs')}</caption>
                  <thead className="bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{t('lab.qc.col.time')}</th>
                      <th className="px-3 py-2 font-semibold">{t('lab.qc.col.value')}</th>
                      <th className="px-3 py-2 font-semibold">{t('lab.qc.col.sd')}</th>
                      <th className="px-3 py-2 font-semibold">{t('lab.qc.col.status')}</th>
                      <th className="px-3 py-2 font-semibold">{t('lab.qc.col.by')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...d.runs]
                      .reverse()
                      .slice(0, 10)
                      .map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2">{fmtDateTime(r.at, locale)}</td>
                          <td className="tabular px-3 py-2">{r.value}</td>
                          <td className="tabular px-3 py-2">{r.z}</td>
                          <td className="px-3 py-2">
                            <StatusBadge
                              tone={QC_TONE[r.status]}
                              label={`${t(`lab.qc.status.${r.status}`)}${r.rules.length ? ` · ${r.rules.join(', ')}` : ''}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-muted">{r.by}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </QueryView>
      </div>
    </Card>
  );
}

/**
 * Quality control (board LabQC, route /lab/qc): controls per analyser with their latest run,
 * QC entry judged by Westgard rules (1-2s warning; 1-3s and 2-2s reject the run and hold its
 * patient results, rules R4 and R5) and the Levey-Jennings chart.
 */
function RunsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const [id, setId] = useUrlState('id', '');
  const [adding, setAdding] = useState(false);
  const controls = useQcControlsQuery();
  const [create] = useCreateQcControlMutation();
  const items = controls.data?.items ?? [];
  const current = items.find((c) => c.id === id) ?? items[0];
  const rejected = items.filter((c) => c.last?.status === 'REJECTED');
  return (
    <div className="flex flex-col gap-4">
      {can('lab:qc:update') && (
        <div className="flex justify-end">
          <Button onClick={() => setAdding(true)}>{t('lab.qc.add')}</Button>
        </div>
      )}
      {rejected.length > 0 && (
        <Banner tone="critical">
          {t('lab.qc.outOfControl', {
            list: rejected.map((c) => `${c.analyser} ${c.name} ${c.level}`).join(', '),
          })}
        </Banner>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <Card title={t('lab.qc.controls', { count: items.length })}>
          <QueryView
            query={controls}
            empty={<EmptyState bordered={false} title={t('lab.qc.none')} />}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <PickList
                label={t('lab.qc.title')}
                selectedId={current?.id}
                onPick={(v) => setId(v)}
                items={d.items.map((c) => ({
                  id: c.id,
                  lead: c.analyser,
                  title: `${c.name} · ${c.level}`,
                  sub: c.last ? t('lab.qc.lastZ', { z: c.last.z }) : t('lab.qc.noRuns'),
                  badge: c.last
                    ? { tone: QC_TONE[c.last.status], label: t(`lab.qc.status.${c.last.status}`) }
                    : { tone: 'neutral', label: t('lab.qc.noRunBadge') },
                }))}
              />
            )}
          </QueryView>
        </Card>
        {current ? (
          <ControlDetail key={current.id} control={current} canRun={can('lab:qc:create')} />
        ) : (
          <EmptyState title={t('lab.qc.pick')} />
        )}
      </div>
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title={t('lab.qc.add')}
        description={t('lab.qc.addHint')}
        schema={z.object({
          analyser: z.string().trim().min(2, t('lab.qc.errors.analyser')),
          analyte: z.string().trim().min(1, t('lab.qc.errors.analyte')),
          name: z.string().max(80).optional(),
          level: z.string().trim().min(1),
          lot: z.string().max(40).optional(),
          mean: z.coerce.number({ error: t('lab.qc.errors.number') }),
          sd: z.coerce.number({ error: t('lab.qc.errors.number') }).positive(t('lab.qc.errors.sd')),
          unit: z.string().max(20).optional(),
        })}
        defaultValues={{
          analyser: '',
          analyte: '',
          name: '',
          level: 'L1',
          lot: '',
          mean: '',
          sd: '',
          unit: '',
        }}
        fields={[
          { name: 'analyser', label: t('lab.qc.f.analyser'), required: true, mono: true },
          {
            name: 'analyte',
            label: t('lab.qc.f.analyte'),
            required: true,
            mono: true,
            hint: t('lab.qc.f.analyteHint'),
          },
          { name: 'name', label: t('lab.qc.f.name'), optional: true },
          { name: 'level', label: t('lab.qc.f.level'), required: true },
          { name: 'mean', label: t('lab.qc.f.mean'), type: 'number', required: true },
          { name: 'sd', label: t('lab.qc.f.sd'), type: 'number', required: true },
          { name: 'unit', label: t('lab.qc.f.unit'), optional: true },
          { name: 'lot', label: t('lab.qc.f.lot'), optional: true },
        ]}
        submitLabel={t('lab.qc.save')}
        onSubmit={(v) => create(v).unwrap()}
        onDone={(c) => {
          toast({ tone: 'success', title: t('lab.qc.added', { name: `${c.analyser} ${c.name}` }) });
          setId(c.id);
        }}
      />
    </div>
  );
}

/** Quality control: Levey-Jennings runs, control lots, Westgard rules, EQAS and maintenance. */
export default function LabQcPage() {
  useStrings(addDxkitStrings, addLabStrings);
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('lab.crumb') }, { label: t('lab.qc.title') }]}
        title={t('lab.qc.title')}
        description={t('lab.qc.description')}
      />
      <UrlTabs
        param="tab"
        label={t('lab.qc.title')}
        reset={['id']}
        tabs={[
          { id: 'runs', label: t('lab.reg.tabs.runs'), body: <RunsTab /> },
          { id: 'lots', label: t('lab.reg.tabs.lots'), body: <LotsTab /> },
          { id: 'rules', label: t('lab.reg.tabs.rules'), body: <QcRulesTab /> },
          { id: 'eqas', label: t('lab.reg.tabs.eqas'), body: <EqasTab /> },
          { id: 'maintenance', label: t('lab.reg.tabs.maintenance'), body: <MaintenanceTab /> },
        ]}
      />
    </Page>
  );
}
