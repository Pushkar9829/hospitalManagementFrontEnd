import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addIpdStrings } from '@hms/i18n/ipd';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Dialog,
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
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtTime, localeOf } from '../../dx-kit/format.js';
import {
  useAddNursingNoteMutation,
  useAdministerMutation,
  useAdmissionQuery,
  useIoQuery,
  useMarQuery,
  useNursingWardsQuery,
  useRecordIoMutation,
  useRecordVitalsMutation,
  useVitalsQuery,
  useWardCensusQuery,
} from '../api.js';
import { RISK_TONE } from '../ipd.js';
import { NotesList, VitalsTable } from '../components/ClinicalLists.jsx';
import { StayHeader } from '../components/StayHeader.jsx';

const DOSE_TONE = {
  DUE: 'info',
  GIVEN: 'success',
  HELD: 'warning',
  REFUSED: 'warning',
  MISSED: 'critical',
};

/** Give, hold or record a refused dose: wristband scan, second nurse for high-alert (R11, R12). */
function DoseDialog({ dose, order, onClose }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [status, setStatus] = useState('GIVEN');
  const [wristband, setWristband] = useState('');
  const [witness, setWitness] = useState('');
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState(null);
  const [administer, state] = useAdministerMutation();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('ipd.mar.doseTitle', { drug: order.drug.brand })}
      description={`${order.dose} · ${order.route}`}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setFailure(null);
          try {
            await administer({
              id: dose.id,
              status,
              wristband: wristband || undefined,
              witness: witness || undefined,
              reason: reason || undefined,
            }).unwrap();
            toast({
              tone: 'success',
              title: t(`ipd.mar.recorded.${status}`, { drug: order.drug.brand }),
            });
            onClose();
          } catch (err) {
            setFailure(err);
          }
        }}
      >
        {order.highAlert && <Banner tone="critical">{t('ipd.mar.highAlert')}</Banner>}
        <ApiErrorNotice error={failure} />
        <FormField label={t('ipd.mar.action')}>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={['GIVEN', 'HELD', 'REFUSED'].map((s) => ({
              value: s,
              label: t(`ipd.mar.status.${s}`),
            }))}
          />
        </FormField>
        {status === 'GIVEN' ? (
          <>
            <FormField label={t('ipd.mar.wristband')} hint={t('ipd.mar.wristbandHint')} required>
              <Input
                autoFocus
                mono
                value={wristband}
                onChange={(e) => setWristband(e.target.value)}
              />
            </FormField>
            {order.highAlert && (
              <FormField label={t('ipd.mar.witness')} hint={t('ipd.mar.witnessHint')} required>
                <Input value={witness} onChange={(e) => setWitness(e.target.value)} />
              </FormField>
            )}
          </>
        ) : (
          <FormField label={t('ipd.beds.reason')} required>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
        )}
        <div className="flex gap-2">
          <Button type="submit" loading={state.isLoading}>
            {t(`ipd.mar.save.${status}`)}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function MarTab({ admissionId, canGive }) {
  const { t, i18n } = useTranslation();
  const mar = useMarQuery({ id: admissionId });
  const [open, setOpen] = useState(null);
  return (
    <QueryView
      query={mar}
      empty={<EmptyState bordered={false} title={t('ipd.mar.none')} />}
      isEmpty={(d) => !d.orders.length}
    >
      {(d) => (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.orders.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="font-semibold text-ink">{o.drug.brand}</strong>
                  <span className="text-sm text-muted">
                    {o.dose} · {o.route} · {t(`ipd.freq.${o.frequency}`)}
                  </span>
                  {o.highAlert && <StatusBadge tone="critical" label={t('ipd.orders.highAlert')} />}
                  {o.status === 'ORDERED' && !o.stat && (
                    <StatusBadge tone="warning" label={t('ipd.mar.awaitingPharmacist')} />
                  )}
                  {o.status === 'STOPPED' && (
                    <StatusBadge tone="neutral" label={t('ipd.orders.status.STOPPED')} />
                  )}
                </div>
                <ul
                  className="flex flex-wrap gap-2"
                  aria-label={t('ipd.mar.doses', { drug: o.drug.brand })}
                >
                  {o.doses.map((dose) => (
                    <li key={dose.id}>
                      <button
                        type="button"
                        disabled={!canGive || dose.status !== 'DUE'}
                        onClick={() => setOpen({ dose, order: o })}
                        className="flex cursor-pointer items-center gap-1.5 rounded-control border border-line px-2 py-1 text-sm disabled:cursor-default"
                      >
                        <span className="tabular font-semibold">
                          {fmtTime(dose.dueAt, localeOf(i18n))}
                        </span>
                        <StatusBadge
                          tone={dose.late ? 'critical' : DOSE_TONE[dose.status]}
                          label={dose.late ? t('ipd.mar.late') : t(`ipd.mar.status.${dose.status}`)}
                        />
                      </button>
                    </li>
                  ))}
                  {!o.doses.length && (
                    <li className="text-sm text-muted">
                      {o.prn ? t('ipd.mar.prn') : t('ipd.mar.noDoses')}
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{t('ipd.mar.scanHint')}</p>
          {open && <DoseDialog dose={open.dose} order={open.order} onClose={() => setOpen(null)} />}
        </div>
      )}
    </QueryView>
  );
}

/** NEWS2 bands, the same as the API (RCP 2017), so the nurse sees the score while typing. */
function news2Preview(v) {
  const n = (x) => (x === '' || x == null ? null : Number(x));
  const s = (x, rules) => (x == null ? 0 : rules.find(([f]) => f(x))[1]);
  const parts = [
    s(n(v.rr), [
      [(x) => x <= 8, 3],
      [(x) => x <= 11, 1],
      [(x) => x <= 20, 0],
      [(x) => x <= 24, 2],
      [() => true, 3],
    ]),
    s(n(v.spo2), [
      [(x) => x <= 91, 3],
      [(x) => x <= 93, 2],
      [(x) => x <= 95, 1],
      [() => true, 0],
    ]),
    v.onOxygen ? 2 : 0,
    s(n(v.sbp), [
      [(x) => x <= 90, 3],
      [(x) => x <= 100, 2],
      [(x) => x <= 110, 1],
      [(x) => x <= 219, 0],
      [() => true, 3],
    ]),
    s(n(v.hr), [
      [(x) => x <= 40, 3],
      [(x) => x <= 50, 1],
      [(x) => x <= 90, 0],
      [(x) => x <= 110, 1],
      [(x) => x <= 130, 2],
      [() => true, 3],
    ]),
    v.consciousness !== 'A' ? 3 : 0,
    s(n(v.tempC), [
      [(x) => x <= 35, 3],
      [(x) => x <= 36, 1],
      [(x) => x <= 38, 0],
      [(x) => x <= 39, 1],
      [() => true, 2],
    ]),
  ];
  const score = parts.reduce((a, b) => a + b, 0);
  return {
    score,
    risk: score >= 7 ? 'HIGH' : score >= 5 ? 'MEDIUM' : parts.includes(3) ? 'LOW_MEDIUM' : 'LOW',
  };
}

function VitalsTab({ admissionId, canRecord }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const empty = {
    rr: '',
    spo2: '',
    onOxygen: false,
    tempC: '',
    sbp: '',
    dbp: '',
    hr: '',
    consciousness: 'A',
  };
  const [v, setV] = useState(empty);
  const [failure, setFailure] = useState(null);
  const [record, state] = useRecordVitalsMutation();
  const preview = useMemo(() => news2Preview(v), [v]);
  const num = (k) => (v[k] === '' ? undefined : Number(v[k]));
  return (
    <div className="flex flex-col gap-4">
      {canRecord && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setFailure(null);
            try {
              const r = await record({
                id: admissionId,
                rr: num('rr'),
                spo2: num('spo2'),
                onOxygen: v.onOxygen,
                tempC: num('tempC'),
                sbp: num('sbp'),
                dbp: num('dbp'),
                hr: num('hr'),
                consciousness: v.consciousness,
              }).unwrap();
              setV(empty);
              toast({
                tone: ['HIGH', 'MEDIUM'].includes(r.risk) ? 'warning' : 'success',
                title: t('ipd.vitals.saved', { score: r.news2 }),
                description: ['HIGH', 'MEDIUM'].includes(r.risk)
                  ? t('ipd.vitals.alerted')
                  : undefined,
              });
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          <ApiErrorNotice error={failure} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['tempC', 'temp'],
              ['hr', 'hr'],
              ['sbp', 'sbp'],
              ['dbp', 'dbp'],
              ['rr', 'rr'],
              ['spo2', 'spo2'],
            ].map(([k, l]) => (
              <FormField key={k} label={t(`ipd.vitals.field.${l}`)}>
                <Input
                  inputMode="decimal"
                  value={v[k]}
                  onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))}
                />
              </FormField>
            ))}
            <FormField label={t('ipd.vitals.field.avpu')}>
              <Select
                value={v.consciousness}
                onChange={(e) => setV((x) => ({ ...x, consciousness: e.target.value }))}
                options={['A', 'C', 'V', 'P', 'U'].map((c) => ({
                  value: c,
                  label: t(`ipd.vitals.avpu.${c}`),
                }))}
              />
            </FormField>
            <Checkbox
              label={t('ipd.vitals.field.oxygen')}
              checked={v.onOxygen}
              onChange={(e) => setV((x) => ({ ...x, onOxygen: e.target.checked }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge
              tone={RISK_TONE[preview.risk]}
              label={t('ipd.news2.badge', {
                score: preview.score,
                risk: t(`ipd.news2.risk.${preview.risk}`),
              })}
            />
            <Button type="submit" loading={state.isLoading}>
              {t('ipd.vitals.record')}
            </Button>
          </div>
        </form>
      )}
      <VitalsTable admissionId={admissionId} />
    </div>
  );
}

function IoTab({ admissionId, canRecord }) {
  const { t, i18n } = useTranslation();
  const io = useIoQuery(admissionId);
  const [entry, setEntry] = useState({ kind: 'INTAKE', route: 'ORAL', ml: '' });
  const [record, state] = useRecordIoMutation();
  const [failure, setFailure] = useState(null);
  return (
    <div className="flex flex-col gap-4">
      <QueryView query={io} rows={2}>
        {(d) => (
          <dl className="grid grid-cols-3 gap-3 text-center">
            {['intake', 'output', 'balance'].map((k) => (
              <div key={k} className="rounded-card border border-line p-3">
                <dt className="text-sm text-muted">{t(`ipd.io.${k}`)}</dt>
                <dd className="tabular text-xl font-semibold">{t('ipd.io.ml', { n: d[k] })}</dd>
              </div>
            ))}
          </dl>
        )}
      </QueryView>
      {canRecord && (
        <form
          noValidate
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setFailure(null);
            try {
              await record({
                id: admissionId,
                kind: entry.kind,
                route: entry.route,
                ml: Number(entry.ml),
              }).unwrap();
              setEntry((x) => ({ ...x, ml: '' }));
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          <ApiErrorNotice error={failure} />
          <FormField label={t('ipd.io.kind')} className="w-36">
            <Select
              value={entry.kind}
              onChange={(e) =>
                setEntry((x) => ({
                  ...x,
                  kind: e.target.value,
                  route: e.target.value === 'INTAKE' ? 'ORAL' : 'URINE',
                }))
              }
              options={['INTAKE', 'OUTPUT'].map((k) => ({
                value: k,
                label: t(`ipd.io.${k.toLowerCase()}`),
              }))}
            />
          </FormField>
          <FormField label={t('ipd.io.route')} className="w-40">
            <Select
              value={entry.route}
              onChange={(e) => setEntry((x) => ({ ...x, route: e.target.value }))}
              options={(entry.kind === 'INTAKE'
                ? ['ORAL', 'IV', 'RT']
                : ['URINE', 'DRAIN', 'VOMIT', 'STOOL', 'OTHER']
              ).map((r) => ({ value: r, label: t(`ipd.io.routes.${r}`) }))}
            />
          </FormField>
          <FormField label={t('ipd.io.amount')} className="w-32">
            <Input
              inputMode="numeric"
              value={entry.ml}
              onChange={(e) => setEntry((x) => ({ ...x, ml: e.target.value }))}
            />
          </FormField>
          <Button type="submit" loading={state.isLoading} disabled={!Number(entry.ml)}>
            {t('ipd.io.add')}
          </Button>
        </form>
      )}
      <QueryView query={io} rows={0}>
        {(d) => (
          <ul className="flex flex-col gap-1 text-sm">
            {d.items.map((x) => (
              <li key={x.id}>
                <span className="tabular">{fmtTime(x.at, localeOf(i18n))}</span> ·{' '}
                {t(`ipd.io.${x.kind.toLowerCase()}`)} · {t(`ipd.io.routes.${x.route}`)} ·{' '}
                {t('ipd.io.ml', { n: x.ml })} · <span className="text-muted">{x.by}</span>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function NotesTab({ admissionId, canWrite, assessmentDue }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [kind, setKind] = useState(assessmentDue ? 'NURSING_ADMISSION' : 'NURSING');
  const [text, setText] = useState('');
  const [data, setData] = useState({ fallsRisk: 'LOW', bradenScore: '', painScore: '' });
  const [save, state] = useAddNursingNoteMutation();
  const sbar = kind === 'HANDOVER';
  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await save({
              id: admissionId,
              kind,
              text: text || undefined,
              data: kind === 'NURSING_ADMISSION' ? data : undefined,
            }).unwrap();
            setText('');
            toast({ tone: 'success', title: t('ipd.notes.saved') });
          }}
        >
          {assessmentDue && <Banner tone="warning">{t('ipd.notes.assessmentDue')}</Banner>}
          <FormField label={t('ipd.notes.type')} className="w-72">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              options={['NURSING_ADMISSION', 'NURSING', 'HANDOVER'].map((k) => ({
                value: k,
                label: t(`ipd.notes.kind.${k}`),
              }))}
            />
          </FormField>
          {kind === 'NURSING_ADMISSION' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <FormField label={t('ipd.notes.field.fallsRisk')}>
                <Select
                  value={data.fallsRisk}
                  onChange={(e) => setData((d) => ({ ...d, fallsRisk: e.target.value }))}
                  options={['LOW', 'MEDIUM', 'HIGH'].map((r) => ({
                    value: r,
                    label: t(`ipd.notes.risk.${r}`),
                  }))}
                />
              </FormField>
              <FormField label={t('ipd.notes.field.bradenScore')}>
                <Input
                  inputMode="numeric"
                  value={data.bradenScore}
                  onChange={(e) => setData((d) => ({ ...d, bradenScore: e.target.value }))}
                />
              </FormField>
              <FormField label={t('ipd.notes.field.painScore')}>
                <Input
                  inputMode="numeric"
                  value={data.painScore}
                  onChange={(e) => setData((d) => ({ ...d, painScore: e.target.value }))}
                />
              </FormField>
            </div>
          )}
          <FormField
            label={sbar ? t('ipd.notes.sbar') : t('ipd.notes.text')}
            hint={t('ipd.notes.lockHint')}
          >
            <Textarea rows={sbar ? 5 : 3} value={text} onChange={(e) => setText(e.target.value)} />
          </FormField>
          <div>
            <Button
              type="submit"
              loading={state.isLoading}
              disabled={kind !== 'NURSING_ADMISSION' && text.trim().length < 3}
            >
              {t('ipd.notes.save')}
            </Button>
          </div>
        </form>
      )}
      <NotesList admissionId={admissionId} kind="NURSING_ADMISSION,NURSING,HANDOVER" />
    </div>
  );
}

function PatientPanel({ admissionId }) {
  const { t } = useTranslation();
  const can = useCan();
  const stay = useAdmissionQuery(admissionId);
  const last = useVitalsQuery(admissionId).data?.items?.[0];
  return (
    <QueryView query={stay} rows={6}>
      {(a) => (
        <Card>
          <div className="flex flex-col gap-4">
            <StayHeader stay={a} news2={last ? { score: last.news2, risk: last.risk } : null} />
            <UrlTabs
              param="tab"
              label={t('ipd.nursing.tabs.label')}
              tabs={[
                {
                  id: 'mar',
                  label: t('ipd.nursing.tabs.mar'),
                  body: <MarTab admissionId={a.id} canGive={can('nursing:mar:administer')} />,
                },
                {
                  id: 'vitals',
                  label: t('ipd.nursing.tabs.vitals'),
                  body: <VitalsTab admissionId={a.id} canRecord={can('nursing:vitals:create')} />,
                },
                {
                  id: 'io',
                  label: t('ipd.nursing.tabs.io'),
                  body: <IoTab admissionId={a.id} canRecord={can('nursing:io:create')} />,
                },
                {
                  id: 'notes',
                  label: t('ipd.nursing.tabs.notes'),
                  body: (
                    <NotesTab
                      admissionId={a.id}
                      canWrite={can('nursing:note:create')}
                      assessmentDue={(a.assessmentsDue ?? []).some(
                        (x) => x.kind === 'NURSING_ADMISSION',
                      )}
                    />
                  ),
                },
              ]}
            />
          </div>
        </Card>
      )}
    </QueryView>
  );
}

/**
 * Nursing station (board Nursing, route /nursing/:wardId): the ward census (NEWS2, doses due
 * and late, fluid balance, overdue assessments) and, for the picked patient, the MAR, vitals,
 * intake-output and nursing notes. /nursing/all picks the ward first.
 */
const LAST_WARD = 'hms.nursing.lastWard';
const safeStorage = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};

export default function NursingPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addIpdStrings);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { wardId } = useParams();
  const [patient, setPatient] = useUrlState('patient', '');
  const wards = useNursingWardsQuery();
  const real = wardId && wardId !== 'all' ? wardId : '';
  const census = useWardCensusQuery(real, { skip: !real, pollingInterval: 60_000 });
  const items = census.data?.items ?? [];
  const current = patient || items[0]?.admissionId || '';
  const ward = wards.data?.items.find((w) => w.id === real);
  // Opening the station from the menu goes straight to the ward the nurse used last (once per
  // visit to the app, so the list of wards stays reachable).
  useEffect(() => {
    if (real) {
      safeStorage(() => localStorage.setItem(LAST_WARD, real));
      return;
    }
    const last = safeStorage(() => localStorage.getItem(LAST_WARD));
    const shown = safeStorage(() => sessionStorage.getItem(LAST_WARD));
    if (last && !shown && wards.data?.items.some((w) => w.id === last)) {
      safeStorage(() => sessionStorage.setItem(LAST_WARD, '1'));
      navigate(`/nursing/${last}`, { replace: true });
    }
  }, [real, wards.data, navigate]);
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('ipd.crumb') }, { label: t('ipd.nursing.title') }]}
        title={ward ? t('ipd.nursing.wardTitle', { ward: ward.name }) : t('ipd.nursing.title')}
        description={t('ipd.nursing.description')}
        actions={
          <FormField label={t('ipd.nursing.ward')} className="w-64">
            <Select
              value={real}
              onChange={(e) => navigate(`/nursing/${e.target.value || 'all'}`)}
              placeholder={t('ipd.nursing.pickWard')}
              options={(wards.data?.items ?? []).map((w) => ({
                value: w.id,
                label: t('ipd.nursing.wardOption', { ward: w.name, n: w.patients, total: w.beds }),
              }))}
            />
          </FormField>
        }
      />
      {!real ? (
        <QueryView
          query={wards}
          empty={<EmptyState title={t('ipd.beds.noWards')} />}
          isEmpty={(d) => !d.items.length}
        >
          {(d) => (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {d.items.map((w) => (
                <li key={w.id}>
                  <Link
                    to={`/nursing/${w.id}`}
                    className="flex flex-col rounded-card border border-line bg-surface p-4 hover:bg-surface-2"
                  >
                    <strong className="font-semibold text-ink">{w.name}</strong>
                    <span className="text-sm text-muted">
                      {t('ipd.nursing.wardOption', {
                        ward: t(`ipd.category.${w.category}`),
                        n: w.patients,
                        total: w.beds,
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
          <Card title={t('ipd.nursing.census', { count: items.length })}>
            <QueryView
              query={census}
              empty={<EmptyState bordered={false} title={t('ipd.nursing.empty')} />}
              isEmpty={(d) => !d.items.length}
            >
              {(d) => (
                <ul
                  className="flex flex-col gap-1"
                  aria-label={t('ipd.nursing.census', { count: d.items.length })}
                >
                  {d.items.map((r) => (
                    <li key={r.admissionId}>
                      <button
                        type="button"
                        aria-current={current === r.admissionId ? 'true' : undefined}
                        onClick={() => setPatient(r.admissionId, { reset: ['tab'] })}
                        className={`flex w-full cursor-pointer flex-col gap-1 rounded-control border-l-4 px-3 py-2 text-left ${current === r.admissionId ? 'border-primary bg-info-bg' : 'border-transparent hover:bg-surface-2'}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span>
                            <span className="font-mono font-semibold">{r.bed}</span> ·{' '}
                            <strong className="font-semibold text-ink">{r.patient.name}</strong>
                          </span>
                          {r.news2 && (
                            <StatusBadge
                              tone={RISK_TONE[r.news2.risk]}
                              label={`NEWS2 ${r.news2.score}`}
                            />
                          )}
                        </span>
                        <span className="flex flex-wrap gap-1 text-xs">
                          {r.patient.allergies.length > 0 && (
                            <StatusBadge
                              tone="critical"
                              label={t('ipd.nursing.allergy', {
                                list: r.patient.allergies.join(', '),
                              })}
                            />
                          )}
                          {r.dosesLate > 0 && (
                            <StatusBadge
                              tone="critical"
                              label={t('ipd.nursing.late', { count: r.dosesLate })}
                            />
                          )}
                          {r.dosesDue > 0 && (
                            <StatusBadge
                              tone="info"
                              label={t('ipd.nursing.due', { count: r.dosesDue })}
                            />
                          )}
                          {r.assessmentsDue
                            .filter((x) => x.overdue)
                            .map((x) => (
                              <StatusBadge
                                key={x.kind}
                                tone="warning"
                                label={t(`ipd.nursing.overdue.${x.kind}`)}
                              />
                            ))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </QueryView>
          </Card>
          {current ? (
            <PatientPanel key={current} admissionId={current} />
          ) : (
            <EmptyState title={t('ipd.nursing.pick')} />
          )}
        </div>
      )}
    </Page>
  );
}
