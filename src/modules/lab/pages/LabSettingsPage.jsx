import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addLabStrings } from '@hms/i18n/lab';
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
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { PickList } from '../../dx-kit/PickList.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import {
  useLabSettingsQuery,
  useLabTestQuery,
  useLabTestsQuery,
  useSaveLabSettingsMutation,
  useSaveLabTestMutation,
} from '../api.js';
import { LabSettingsExtra, PartnersTab } from '../components/Registers.jsx';
import { DEPARTMENTS } from '../lab.js';

const num = (v) => (v === '' || v == null ? null : Number(v));
const Y = 365;

/** General rules: call times, delta look-back, TAT targets, rejection reasons, retention. */
function RulesForm({ settings, canEdit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [v, setV] = useState(() => ({
    criticalCallMin: settings.criticalCallMin,
    escalateMin: settings.escalateMin,
    deltaDays: settings.deltaDays,
    labelVoidHours: settings.labelVoidHours,
    autoverify: settings.autoverify,
    STAT: settings.tatMin.STAT,
    URGENT: settings.tatMin.URGENT,
    ROUTINE: settings.tatMin.ROUTINE,
    serum: settings.retentionDays.serum,
    blocks: settings.retentionDays.blocks,
    rejectReasons: settings.rejectReasons.join('\n'),
  }));
  const [failure, setFailure] = useState(null);
  const [save, state] = useSaveLabSettingsMutation();
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const field = (k, unit) => (
    <FormField label={t(`lab.cfg.f.${k}`)}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          className="max-w-28"
          value={v[k]}
          onChange={set(k)}
        />
        <span className="text-sm text-muted">{t(`lab.cfg.units.${unit}`)}</span>
      </div>
    </FormField>
  );
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setFailure(null);
        try {
          await save({
            criticalCallMin: Number(v.criticalCallMin),
            escalateMin: Number(v.escalateMin),
            deltaDays: Number(v.deltaDays),
            labelVoidHours: Number(v.labelVoidHours),
            autoverify: Boolean(v.autoverify),
            tatMin: { STAT: Number(v.STAT), URGENT: Number(v.URGENT), ROUTINE: Number(v.ROUTINE) },
            retentionDays: { serum: Number(v.serum), blocks: Number(v.blocks) },
            rejectReasons: v.rejectReasons
              .split('\n')
              .map((x) => x.trim().toUpperCase().replace(/\s+/g, '_'))
              .filter(Boolean),
          }).unwrap();
          toast({ tone: 'success', title: t('lab.cfg.saved') });
        } catch (err) {
          setFailure(err);
        }
      }}
    >
      {!canEdit && <Banner tone="info">{t('lab.cfg.readOnly')}</Banner>}
      <ApiErrorNotice error={failure} />
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <Card title={t('lab.cfg.callsTitle')} description={t('lab.cfg.callsHint')}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {field('criticalCallMin', 'minutes')}
            {field('escalateMin', 'minutes')}
            {field('deltaDays', 'days')}
          </div>
        </Card>
        <Card title={t('lab.cfg.tatTitle')} description={t('lab.cfg.tatHint')}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {field('STAT', 'minutes')}
            {field('URGENT', 'minutes')}
            {field('ROUTINE', 'minutes')}
          </div>
        </Card>
        <Card title={t('lab.cfg.samplesTitle')}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {field('labelVoidHours', 'hours')}
            {field('serum', 'days')}
            {field('blocks', 'days')}
          </div>
          <FormField
            label={t('lab.cfg.f.rejectReasons')}
            hint={t('lab.cfg.rejectHint')}
            className="mt-4"
          >
            <Textarea rows={6} value={v.rejectReasons} onChange={set('rejectReasons')} />
          </FormField>
          <Checkbox
            className="mt-2"
            checked={Boolean(v.autoverify)}
            onChange={(e) => setV((s) => ({ ...s, autoverify: e.target.checked }))}
            label={t('lab.cfg.f.autoverify')}
            description={t('lab.cfg.autoverifyHint')}
          />
        </Card>
      </fieldset>
      {canEdit && (
        <div>
          <Button type="submit" loading={state.isLoading}>
            {t('lab.cfg.save')}
          </Button>
        </div>
      )}
    </form>
  );
}

const rangeRow = (r) => ({
  sex: r.sex ?? 'ANY',
  ageMin: r.ageMinDays ? String(Math.round(r.ageMinDays / Y)) : '0',
  ageMax:
    r.ageMaxDays != null && r.ageMaxDays < 150 * Y
      ? String(Math.round((r.ageMaxDays + 1) / Y))
      : '',
  low: r.low ?? '',
  high: r.high ?? '',
  text: r.text ?? '',
});

/** One test: sample and method, and per analyte the ranges, critical and delta limits. */
function TestEditor({ test, canEdit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [head, setHead] = useState(() => ({
    department: test.department,
    sampleType: test.sampleType,
    container: test.container,
    method: test.method ?? '',
    analyser: test.analyser ?? '',
    tatMin: test.tatMin ?? '',
    sensitive: test.sensitive,
    nabl: test.nabl,
    isActive: test.isActive,
  }));
  const [analytes, setAnalytes] = useState(() =>
    test.analytes.map((a) => ({
      ...a,
      unit: a.unit ?? '',
      criticalLow: a.criticalLow ?? '',
      criticalHigh: a.criticalHigh ?? '',
      deltaPct: a.deltaPct ?? '',
      ranges: a.ranges.map(rangeRow),
    })),
  );
  const [failure, setFailure] = useState(null);
  const [save, state] = useSaveLabTestMutation();
  const setA = (i, k, val) =>
    setAnalytes((as) => as.map((a, j) => (j === i ? { ...a, [k]: val } : a)));
  const setR = (i, k, ri, val) =>
    setAnalytes((as) =>
      as.map((a, j) =>
        j === i
          ? { ...a, ranges: a.ranges.map((r, rj) => (rj === ri ? { ...r, [k]: val } : r)) }
          : a,
      ),
    );
  return (
    <Card>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setFailure(null);
          try {
            await save({
              id: test.id,
              department: head.department,
              sampleType: head.sampleType,
              container: head.container,
              method: head.method,
              analyser: head.analyser.trim() || null,
              tatMin: num(head.tatMin),
              sensitive: head.sensitive,
              nabl: head.nabl,
              isActive: head.isActive,
              analytes: analytes.map((a) => ({
                code: a.code,
                name: a.name,
                unit: a.unit || null,
                kind: a.kind,
                choices: a.choices,
                abnormal: a.abnormal,
                decimals: a.decimals,
                criticalLow: num(a.criticalLow),
                criticalHigh: num(a.criticalHigh),
                deltaPct: num(a.deltaPct),
                ranges: a.ranges.map((r) => ({
                  sex: r.sex,
                  ageMinDays: Number(r.ageMin || 0) * Y,
                  ageMaxDays: r.ageMax ? Number(r.ageMax) * Y - 1 : null,
                  low: num(r.low),
                  high: num(r.high),
                  text: r.text || null,
                })),
              })),
            }).unwrap();
            toast({ tone: 'success', title: t('lab.cfg.testSaved', { name: test.name }) });
          } catch (err) {
            setFailure(err);
          }
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{test.name}</h2>
          <span className="font-mono text-sm text-muted">{test.code}</span>
          {test.sensitive && <StatusBadge tone="accent" label={t('lab.sensitive')} />}
        </div>
        <ApiErrorNotice error={failure} />
        <fieldset disabled={!canEdit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField label={t('lab.cfg.t.department')}>
              <Select
                value={head.department}
                onChange={(e) => setHead((h) => ({ ...h, department: e.target.value }))}
                options={DEPARTMENTS.map((d) => ({ value: d, label: t(`lab.dept.${d}`) }))}
              />
            </FormField>
            <FormField label={t('lab.cfg.t.sampleType')}>
              <Input
                value={head.sampleType}
                onChange={(e) => setHead((h) => ({ ...h, sampleType: e.target.value }))}
              />
            </FormField>
            <FormField label={t('lab.cfg.t.container')}>
              <Input
                value={head.container}
                onChange={(e) => setHead((h) => ({ ...h, container: e.target.value }))}
              />
            </FormField>
            <FormField label={t('lab.cfg.t.method')}>
              <Input
                value={head.method}
                onChange={(e) => setHead((h) => ({ ...h, method: e.target.value }))}
              />
            </FormField>
            <FormField label={t('lab.cfg.t.analyser')} hint={t('lab.cfg.t.analyserHint')}>
              <Input
                mono
                value={head.analyser}
                onChange={(e) => setHead((h) => ({ ...h, analyser: e.target.value }))}
              />
            </FormField>
            <FormField label={t('lab.cfg.t.tat')} hint={t('lab.cfg.t.tatHint')}>
              <Input
                type="number"
                value={head.tatMin}
                onChange={(e) => setHead((h) => ({ ...h, tatMin: e.target.value }))}
              />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-x-6">
            <Checkbox
              checked={head.sensitive}
              onChange={(e) => setHead((h) => ({ ...h, sensitive: e.target.checked }))}
              label={t('lab.cfg.t.sensitive')}
            />
            <Checkbox
              checked={head.nabl}
              onChange={(e) => setHead((h) => ({ ...h, nabl: e.target.checked }))}
              label={t('lab.cfg.t.nabl')}
            />
            <Checkbox
              checked={head.isActive}
              onChange={(e) => setHead((h) => ({ ...h, isActive: e.target.checked }))}
              label={t('lab.cfg.t.active')}
            />
          </div>
          {analytes.map((a, i) => (
            <div
              key={a.code}
              className="flex flex-col gap-3 rounded-control border border-line p-3"
            >
              <p className="font-semibold text-ink">
                {a.name} <span className="font-mono text-sm text-muted">{a.code}</span>
              </p>
              {a.kind === 'NUMBER' ? (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <FormField label={t('lab.cfg.a.unit')}>
                      <Input value={a.unit} onChange={(e) => setA(i, 'unit', e.target.value)} />
                    </FormField>
                    <FormField label={t('lab.cfg.a.criticalLow')}>
                      <Input
                        inputMode="decimal"
                        value={a.criticalLow}
                        onChange={(e) => setA(i, 'criticalLow', e.target.value)}
                      />
                    </FormField>
                    <FormField label={t('lab.cfg.a.criticalHigh')}>
                      <Input
                        inputMode="decimal"
                        value={a.criticalHigh}
                        onChange={(e) => setA(i, 'criticalHigh', e.target.value)}
                      />
                    </FormField>
                    <FormField label={t('lab.cfg.a.deltaPct')}>
                      <Input
                        inputMode="decimal"
                        value={a.deltaPct}
                        onChange={(e) => setA(i, 'deltaPct', e.target.value)}
                      />
                    </FormField>
                  </div>
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t('lab.cfg.a.ranges', { name: a.name })}</caption>
                    <thead className="text-left text-muted">
                      <tr>
                        <th className="py-1 font-semibold">{t('lab.cfg.a.sex')}</th>
                        <th className="py-1 font-semibold">{t('lab.cfg.a.ageFrom')}</th>
                        <th className="py-1 font-semibold">{t('lab.cfg.a.ageTo')}</th>
                        <th className="py-1 font-semibold">{t('lab.cfg.a.low')}</th>
                        <th className="py-1 font-semibold">{t('lab.cfg.a.high')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.ranges.map((r, ri) => (
                        <tr key={`${a.code}-${ri}`}>
                          <td className="py-1 pr-2">
                            <Select
                              aria-label={t('lab.cfg.a.sex')}
                              value={r.sex}
                              onChange={(e) => setR(i, 'sex', ri, e.target.value)}
                              options={['ANY', 'M', 'F'].map((s) => ({
                                value: s,
                                label: t(`lab.cfg.sex.${s}`),
                              }))}
                            />
                          </td>
                          {['ageMin', 'ageMax', 'low', 'high'].map((k) => (
                            <td key={k} className="py-1 pr-2">
                              <Input
                                aria-label={t(
                                  `lab.cfg.a.${k === 'ageMin' ? 'ageFrom' : k === 'ageMax' ? 'ageTo' : k}`,
                                )}
                                inputMode="decimal"
                                value={r[k]}
                                onChange={(e) => setR(i, k, ri, e.target.value)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {canEdit && (
                    <div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setA(i, 'ranges', [
                            ...a.ranges,
                            { sex: 'ANY', ageMin: '0', ageMax: '', low: '', high: '', text: '' },
                          ])
                        }
                      >
                        {t('lab.cfg.a.addRange')}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">
                  {a.kind === 'CHOICE'
                    ? t('lab.cfg.a.choices', {
                        list: a.choices.join(', '),
                        abnormal: a.abnormal.join(', ') || '-',
                      })
                    : t('lab.cfg.a.text')}
                </p>
              )}
            </div>
          ))}
        </fieldset>
        {canEdit && (
          <div>
            <Button type="submit" loading={state.isLoading}>
              {t('lab.cfg.saveTest')}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

function TestsTab({ canEdit }) {
  const { t } = useTranslation();
  const [id, setId] = useUrlState('test', '');
  const [department, setDepartment] = useUrlState('department', '');
  const list = useLabTestsQuery({ department: department || undefined });
  const items = list.data?.items ?? [];
  const current = id || items[0]?.id || '';
  const one = useLabTestQuery(current, { skip: !current });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
      <Card title={t('lab.cfg.tests', { count: items.length })}>
        <Select
          aria-label={t('lab.filter.department')}
          className="mb-3"
          value={department}
          placeholder={t('lab.filter.allDepartments')}
          onChange={(e) => setDepartment(e.target.value)}
          options={DEPARTMENTS.map((d) => ({ value: d, label: t(`lab.dept.${d}`) }))}
        />
        <QueryView
          query={list}
          empty={<EmptyState bordered={false} title={t('lab.cfg.noTests')} />}
          isEmpty={(d) => !d.items.length}
        >
          {(d) => (
            <PickList
              label={t('lab.cfg.tests', { count: d.items.length })}
              selectedId={current}
              onPick={(v) => setId(v)}
              items={d.items.map((x) => ({
                id: x.id,
                lead: x.code,
                title: x.name,
                sub: [t(`lab.dept.${x.department}`), x.analyser].filter(Boolean).join(' · '),
                badge: !x.isActive ? { tone: 'neutral', label: t('lab.cfg.inactive') } : undefined,
              }))}
            />
          )}
        </QueryView>
      </Card>
      {current ? (
        <QueryView query={one} rows={6}>
          {(test) => (
            <TestEditor
              key={`${test.id}-${JSON.stringify(test.analytes).length}`}
              test={test}
              canEdit={canEdit}
            />
          )}
        </QueryView>
      ) : (
        <EmptyState title={t('lab.cfg.pickTest')} />
      )}
    </div>
  );
}

/**
 * Lab settings (board LabConfig, route /settings/lab): call and escalation times, delta
 * look-back, TAT targets, rejection reasons and retention; the test master with reference
 * ranges by sex and age, critical and delta limits. Prices stay in hospital setup.
 */
export default function LabSettingsPage() {
  useStrings(addDxkitStrings, addLabStrings);
  const { t } = useTranslation();
  const can = useCan();
  const canEdit = can('lab:settings:update');
  const settings = useLabSettingsQuery();
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('lab.cfg.crumb') }, { label: t('lab.cfg.title') }]}
        title={t('lab.cfg.title')}
        description={t('lab.cfg.description')}
      />
      <UrlTabs
        param="tab"
        label={t('lab.cfg.tabsLabel')}
        reset={['test', 'department']}
        tabs={[
          {
            id: 'rules',
            label: t('lab.cfg.tabs.rules'),
            body: (
              <QueryView query={settings} rows={6}>
                {(s) => <RulesForm key={s.version} settings={s} canEdit={canEdit} />}
              </QueryView>
            ),
          },
          { id: 'tests', label: t('lab.cfg.tabs.tests'), body: <TestsTab canEdit={canEdit} /> },
          { id: 'partners', label: t('lab.reg.tabs.partners'), body: <PartnersTab /> },
          { id: 'home', label: t('lab.reg.tabs.home'), body: <LabSettingsExtra section="home" /> },
          {
            id: 'report',
            label: t('lab.reg.tabs.report'),
            body: <LabSettingsExtra section="report" />,
          },
        ]}
      />
    </Page>
  );
}
