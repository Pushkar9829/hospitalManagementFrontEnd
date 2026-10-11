import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addLabStrings } from '@hms/i18n/lab';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Page,
  PageHeader,
  PatientBanner,
  Select,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { PickList } from '../../dx-kit/PickList.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDateTime, localeOf } from '../../dx-kit/format.js';
import {
  useAntibiogramQuery,
  useCultureQuery,
  useCultureStepMutation,
  useCulturesQuery,
} from '../api.js';
import { AlertsTab, MediaTab } from '../components/Registers.jsx';

const MEDIA = ['Blood agar', 'MacConkey agar', 'CLED agar', 'Chocolate agar', 'Sabouraud agar'];
const PANEL = [
  'Amikacin',
  'Amoxicillin-clavulanate',
  'Ceftriaxone',
  'Ciprofloxacin',
  'Cotrimoxazole',
  'Gentamicin',
  'Meropenem',
  'Nitrofurantoin',
  'Piperacillin-tazobactam',
];
const CULTURE_TONE = {
  RECEIVED: 'neutral',
  PLATED: 'info',
  GROWTH_READ: 'warning',
  IDENTIFIED: 'warning',
  SENSITIVITY_DONE: 'accent',
  FINAL: 'success',
};
const SIR_CLASS = {
  S: 'text-success font-semibold',
  I: 'text-warning font-semibold',
  R: 'text-critical font-bold',
};

/** One step at a time: plate, read, identify, sensitivity, final (flow H). */
function CultureDetail({ id, canWork }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const q = useCultureQuery(id);
  const [step, state] = useCultureStepMutation();
  const [failure, setFailure] = useState(null);
  const [media, setMedia] = useState(['Blood agar', 'MacConkey agar']);
  const [growth, setGrowth] = useState(true);
  const [reading, setReading] = useState('');
  const [organism, setOrganism] = useState('');
  const [count, setCount] = useState('');
  const [sir, setSir] = useState({});
  const run = async (args, title) => {
    setFailure(null);
    try {
      await step({ id, ...args }).unwrap();
      toast({ tone: 'success', title });
      return true;
    } catch (err) {
      setFailure(err);
      return false;
    }
  };
  return (
    <QueryView query={q} rows={8}>
      {(c) => (
        <Card>
          <div className="flex flex-col gap-4">
            <PatientBanner
              name={c.patient.name}
              age={c.patient.age}
              sex={c.patient.gender}
              uhid={c.patient.uhid}
              bed={c.location ?? undefined}
            />
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{c.test}</h2>
              <StatusBadge
                tone={CULTURE_TONE[c.status]}
                label={t(`lab.micro.status.${c.status}`)}
              />
              <span className="text-sm text-muted">
                {[
                  c.sampleNo,
                  c.specimen,
                  c.hoursSincePlating != null && t('lab.micro.hours', { n: c.hoursSincePlating }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            {c.prelimAt && c.status !== 'FINAL' && (
              <Banner tone="info">{t('lab.micro.prelimSent')}</Banner>
            )}
            <ApiErrorNotice error={failure} />
            {c.readings.length > 0 && (
              <ol className="flex flex-col gap-1 text-sm">
                {c.readings.map((r) => (
                  <li key={`${r.at}`}>
                    <strong>{t('lab.micro.readingAt', { n: r.hours })}</strong> ·{' '}
                    {r.growth ? t('lab.micro.growth') : t('lab.micro.noGrowth')} · {r.text}{' '}
                    <span className="text-muted">
                      · {r.by} · {fmtDateTime(r.at, locale)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {c.organism && (
              <p>
                <strong>{c.organism}</strong>{' '}
                {c.colonyCount && <span className="text-muted">· {c.colonyCount}</span>}
              </p>
            )}
            {c.sensitivity.length > 0 && (
              <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {c.sensitivity.map((s) => (
                  <li key={s.antibiotic}>
                    {s.antibiotic}:{' '}
                    <span className={SIR_CLASS[s.result]}>{t(`lab.micro.sir.${s.result}`)}</span>
                    {s.mic && <span className="text-muted"> · MIC {s.mic}</span>}
                  </li>
                ))}
              </ul>
            )}

            {canWork && c.status === 'RECEIVED' && (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <h3 className="font-semibold text-ink">{t('lab.micro.plate')}</h3>
                <div className="flex flex-wrap gap-x-4">
                  {MEDIA.map((m) => (
                    <Checkbox
                      key={m}
                      checked={media.includes(m)}
                      onChange={(e) =>
                        setMedia((v) => (e.target.checked ? [...v, m] : v.filter((x) => x !== m)))
                      }
                      label={m}
                    />
                  ))}
                </div>
                <div>
                  <Button
                    loading={state.isLoading}
                    disabled={!media.length}
                    onClick={() => run({ step: 'plate', media }, t('lab.micro.plated'))}
                  >
                    {t('lab.micro.plate')}
                  </Button>
                </div>
              </div>
            )}
            {canWork && ['PLATED', 'GROWTH_READ', 'IDENTIFIED'].includes(c.status) && (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <h3 className="font-semibold text-ink">{t('lab.micro.read')}</h3>
                <Checkbox
                  checked={growth}
                  onChange={(e) => setGrowth(e.target.checked)}
                  label={t('lab.micro.growthSeen')}
                />
                <FormField label={t('lab.micro.readingText')}>
                  <Input value={reading} onChange={(e) => setReading(e.target.value)} />
                </FormField>
                <div>
                  <Button
                    variant="secondary"
                    loading={state.isLoading}
                    disabled={reading.trim().length < 2}
                    onClick={async () => {
                      if (
                        await run(
                          { step: 'readings', growth, text: reading.trim() },
                          t('lab.micro.readSaved'),
                        )
                      )
                        setReading('');
                    }}
                  >
                    {t('lab.micro.saveReading')}
                  </Button>
                </div>
              </div>
            )}
            {canWork &&
              ['GROWTH_READ', 'IDENTIFIED'].includes(c.status) &&
              c.readings.some((r) => r.growth) && (
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  <h3 className="font-semibold text-ink">{t('lab.micro.identify')}</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormField label={t('lab.micro.organism')}>
                      <Input value={organism} onChange={(e) => setOrganism(e.target.value)} />
                    </FormField>
                    <FormField label={t('lab.micro.colonyCount')} optional>
                      <Input value={count} onChange={(e) => setCount(e.target.value)} />
                    </FormField>
                  </div>
                  <div>
                    <Button
                      variant="secondary"
                      loading={state.isLoading}
                      disabled={organism.trim().length < 2}
                      onClick={() =>
                        run(
                          {
                            step: 'identify',
                            organism: organism.trim(),
                            colonyCount: count.trim() || undefined,
                          },
                          t('lab.micro.identified'),
                        )
                      }
                    >
                      {t('lab.micro.saveOrganism')}
                    </Button>
                  </div>
                </div>
              )}
            {canWork && ['IDENTIFIED', 'SENSITIVITY_DONE'].includes(c.status) && (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <h3 className="font-semibold text-ink">{t('lab.micro.sensitivity')}</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {PANEL.map((a) => (
                    <FormField key={a} label={a}>
                      <Select
                        value={sir[a] ?? ''}
                        placeholder={t('lab.micro.notTested')}
                        onChange={(e) => setSir((v) => ({ ...v, [a]: e.target.value }))}
                        options={['S', 'I', 'R'].map((x) => ({
                          value: x,
                          label: t(`lab.micro.sir.${x}`),
                        }))}
                      />
                    </FormField>
                  ))}
                </div>
                <div>
                  <Button
                    variant="secondary"
                    loading={state.isLoading}
                    disabled={!Object.values(sir).some(Boolean)}
                    onClick={() =>
                      run(
                        {
                          step: 'sensitivity',
                          rows: Object.entries(sir)
                            .filter(([, v]) => v)
                            .map(([antibiotic, result]) => ({ antibiotic, result })),
                        },
                        t('lab.micro.sensitivitySaved'),
                      )
                    }
                  >
                    {t('lab.micro.saveSensitivity')}
                  </Button>
                </div>
              </div>
            )}
            {canWork && c.status !== 'FINAL' && (c.noGrowth || c.status === 'SENSITIVITY_DONE') && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <Button
                  loading={state.isLoading}
                  onClick={() => run({ step: 'final' }, t('lab.micro.finalised'))}
                >
                  {t('lab.micro.final')}
                </Button>
                <span className="text-sm text-muted">{t('lab.micro.finalHint')}</span>
              </div>
            )}
            {c.status === 'FINAL' && (
              <p className="text-sm text-muted">
                {t('lab.micro.finalBy', { by: c.finalBy, time: fmtDateTime(c.finalAt, locale) })}
              </p>
            )}
          </div>
        </Card>
      )}
    </QueryView>
  );
}

function CulturesTab() {
  const { t } = useTranslation();
  const can = useCan();
  const [id, setId] = useUrlState('id', '');
  const [show, setShow] = useUrlState('show', 'open');
  const list = useCulturesQuery({ open: show === 'open' });
  const items = list.data?.items ?? [];
  const current = items.some((c) => c.id === id) ? id : (items[0]?.id ?? '');
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
      <Card title={t('lab.micro.cultures', { count: items.length })}>
        <Select
          aria-label={t('lab.micro.show')}
          className="mb-3"
          value={show}
          onChange={(e) => setShow(e.target.value)}
          options={[
            { value: 'open', label: t('lab.micro.showOpen') },
            { value: 'all', label: t('lab.micro.showAll') },
          ]}
        />
        <QueryView
          query={list}
          empty={<EmptyState bordered={false} title={t('lab.micro.none')} />}
          isEmpty={(d) => !d.items.length}
        >
          {(d) => (
            <PickList
              label={t('lab.micro.title')}
              selectedId={current}
              onPick={(v) => setId(v)}
              items={d.items.map((c) => ({
                id: c.id,
                lead: c.sampleNo,
                title: `${c.test} · ${c.patient.name}`,
                sub: [c.location, c.organism].filter(Boolean).join(' · '),
                badge: { tone: CULTURE_TONE[c.status], label: t(`lab.micro.status.${c.status}`) },
              }))}
            />
          )}
        </QueryView>
      </Card>
      {current ? (
        <CultureDetail key={current} id={current} canWork={can('lab:micro:update')} />
      ) : (
        <EmptyState title={t('lab.micro.pick')} />
      )}
    </div>
  );
}

/** Antibiogram for infection control: % susceptible by organism and antibiotic. */
function AntibiogramTab() {
  const { t } = useTranslation();
  const [days, setDays] = useUrlState('days', '180');
  const q = useAntibiogramQuery({ days });
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('lab.micro.period')} className="w-48">
        <Select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          options={['90', '180', '365'].map((d) => ({
            value: d,
            label: t('lab.micro.days', { n: d }),
          }))}
        />
      </FormField>
      <QueryView
        query={q}
        empty={<EmptyState bordered={false} title={t('lab.micro.noIsolates')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <Card
            title={t('lab.micro.isolates', { count: d.isolates })}
            description={t('lab.micro.abHint')}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <caption className="sr-only">{t('lab.micro.antibiogram')}</caption>
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t('lab.micro.organism')}</th>
                    <th className="px-3 py-2 font-semibold">{t('lab.micro.antibiotic')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('lab.micro.tested')}</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      {t('lab.micro.susceptible')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.items.map((r) => (
                    <tr key={`${r.organism}-${r.antibiotic}`}>
                      <td className="px-3 py-2 italic">{r.organism}</td>
                      <td className="px-3 py-2">{r.antibiotic}</td>
                      <td className="tabular px-3 py-2 text-right">{r.tested}</td>
                      <td
                        className={`tabular px-3 py-2 text-right ${r.pct < 60 ? 'font-semibold text-critical' : r.pct < 80 ? 'text-warning' : ''}`}
                      >
                        {r.pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </QueryView>
    </div>
  );
}

/**
 * Microbiology (board LabMicro, route /lab/micro): the culture bench (plating, readings with the
 * 24-hour preliminary report, identification, sensitivity, final report for release) and the
 * antibiogram for infection control.
 */
export default function LabMicroPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addLabStrings);
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('lab.crumb') }, { label: t('lab.micro.title') }]}
        title={t('lab.micro.title')}
        description={t('lab.micro.description')}
      />
      <UrlTabs
        param="tab"
        label={t('lab.micro.tabsLabel')}
        reset={['show', 'days']}
        tabs={[
          { id: 'cultures', label: t('lab.micro.tabs.cultures'), body: <CulturesTab /> },
          { id: 'antibiogram', label: t('lab.micro.tabs.antibiogram'), body: <AntibiogramTab /> },
          { id: 'media', label: t('lab.reg.tabs.media'), body: <MediaTab /> },
          { id: 'alerts', label: t('lab.reg.tabs.alerts'), body: <AlertsTab /> },
        ]}
      />
    </Page>
  );
}
