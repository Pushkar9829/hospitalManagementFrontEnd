import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addMrdStrings } from '@hms/i18n/mrd';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import { addPatientsStrings } from '@hms/i18n/patients';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Page,
  PageHeader,
  Select,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { inr } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate } from '../../dx-kit/format.js';
import { PatientPicker } from '../../patients/components/PatientPicker.jsx';
import {
  RECORD_TONE,
  RELEASE_TONE,
  useBirthsQuery,
  useDeathsQuery,
  useDeficienciesQuery,
  useHandoverBodyMutation,
  useMarkReportedMutation,
  useMlcCasesQuery,
  useMrdRecordsQuery,
  useMrdStatisticsQuery,
  useRecordBirthMutation,
  useRecordDeathMutation,
  useRecordMlcMutation,
  useReleaseCopyMutation,
  useMrdReleasesQuery,
  useRequestReleaseMutation,
} from '../api.js';
import { RecordSheet } from '../components/RecordSheet.jsx';

const nowLocal = () => {
  const d = new Date(Date.now() + 330 * 60_000);
  return d.toISOString().slice(0, 16);
};
/** A datetime-local value (IST) as an ISO string with the +05:30 offset. */
const istIso = (v) => `${v}:00+05:30`;
const monthIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);

function WorklistTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useUrlState('st', 'DEFICIENT');
  const [q, setQ] = useUrlState('search', '');
  const [open, setOpen] = useUrlState('rec', '');
  const list = useMrdRecordsQuery({ status: status || undefined, q: q || undefined });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('mrd.show')} className="w-48">
          <Select
            value={status}
            placeholder={t('mrd.all')}
            onChange={(e) => setStatus(e.target.value)}
            options={['DEFICIENT', 'CODING', 'CLOSED'].map((s) => ({
              value: s,
              label: t(`mrd.status.${s}`),
            }))}
          />
        </FormField>
        <FormField label={t('mrd.search')} className="w-64">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </FormField>
      </div>
      <QueryView
        query={list}
        rows={6}
        empty={<EmptyState bordered={false} title={t('mrd.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">{t('mrd.tabs.records')}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  {['patient', 'ipNo', 'consultant', 'discharged', 'status'].map((k) => (
                    <th key={k} className="px-3 py-2 font-semibold">
                      {t(`mrd.col.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left font-semibold underline-offset-2 hover:underline"
                        onClick={() => setOpen(r.id)}
                      >
                        {r.patient.name}
                      </button>
                      <span className="block font-mono text-xs text-muted">{r.patient.uhid}</span>
                    </td>
                    <td className="px-3 py-2 font-mono">{r.ipNo}</td>
                    <td className="px-3 py-2">{r.consultant}</td>
                    <td className="px-3 py-2">
                      {fmtDate(r.dischargedAt)}
                      <span className="block text-xs text-muted">
                        {t(`mrd.outcome.${r.outcome}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        tone={RECORD_TONE[r.status]}
                        label={t(`mrd.status.${r.status}`)}
                      />
                      {r.pending > 0 && (
                        <span className="ml-2 text-xs text-muted">
                          {t('mrd.pendingItems', { count: r.pending })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
      {open && <RecordSheet id={open} onClose={() => setOpen('')} />}
    </div>
  );
}

function DeficienciesTab() {
  const { t } = useTranslation();
  const q = useDeficienciesQuery();
  const [open, setOpen] = useState('');
  return (
    <>
      <QueryView
        query={q}
        rows={4}
        empty={<EmptyState bordered={false} title={t('mrd.def.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <div className="flex flex-col gap-3">
            {d.items.map((g) => (
              <Card
                key={g.doctor}
                title={g.doctor}
                description={t('mrd.def.summary', {
                  records: g.records,
                  items: g.items,
                  days: g.oldestDays,
                })}
              >
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {g.list.map((r) => (
                    <li key={r.id} className="flex flex-wrap gap-3 py-2">
                      <button
                        type="button"
                        className="font-semibold underline-offset-2 hover:underline"
                        onClick={() => setOpen(r.id)}
                      >
                        {r.patient}
                      </button>
                      <span className="font-mono text-muted">{r.ipNo}</span>
                      <span className="text-muted">{fmtDate(r.dischargedAt)}</span>
                      <span className="flex-1">{r.items.join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </QueryView>
      {open && <RecordSheet id={open} onClose={() => setOpen('')} />}
    </>
  );
}

function ReleaseForm() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const recs = useMrdRecordsQuery({ q, status: 'CODING,CLOSED' }, { skip: q.trim().length < 2 });
  const [rec, setRec] = useState(null);
  const [f, setF] = useState({
    kind: 'PATIENT',
    name: '',
    relation: '',
    idProof: '',
    authorisation: '',
    purpose: '',
    pages: '',
  });
  const [create, state] = useRequestReleaseMutation();
  const [failure, setFailure] = useState(null);
  const [pending, setPending] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={t('mrd.rel.new')} description={t('mrd.rel.hint')}>
      <div className="flex flex-col gap-3">
        {pending && <PendingApprovalNotice approvalId={pending} approver={t('mrd.rel.approver')} />}
        {failure && <ApiErrorNotice error={failure} />}
        {rec ? (
          <p className="text-sm">
            <span className="font-semibold">{rec.patient.name}</span> · {rec.ipNo}{' '}
            <Button size="sm" variant="ghost" onClick={() => setRec(null)}>
              {t('mrd.change')}
            </Button>
          </p>
        ) : (
          <>
            <FormField label={t('mrd.rel.findRecord')}>
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
            </FormField>
            <ul className="flex flex-wrap gap-2">
              {(recs.data?.items ?? []).slice(0, 8).map((r) => (
                <li key={r.id}>
                  <Button size="sm" variant="secondary" onClick={() => setRec(r)}>
                    {r.patient.name} · {r.ipNo}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t('mrd.rel.kind')}>
            <Select
              value={f.kind}
              onChange={set('kind')}
              options={['PATIENT', 'FAMILY', 'INSURER', 'COURT', 'POLICE', 'OTHER'].map((k) => ({
                value: k,
                label: t(`mrd.rel.kinds.${k}`),
              }))}
            />
          </FormField>
          <FormField label={t('mrd.rel.name')}>
            <Input value={f.name} onChange={set('name')} />
          </FormField>
          <FormField label={t('mrd.rel.relation')}>
            <Input value={f.relation} onChange={set('relation')} />
          </FormField>
          <FormField label={t('mrd.rel.idProof')} hint={t('mrd.rel.idProofHint')}>
            <Input value={f.idProof} onChange={set('idProof')} />
          </FormField>
          <FormField label={t('mrd.rel.authorisation')}>
            <Input value={f.authorisation} onChange={set('authorisation')} />
          </FormField>
          <FormField label={t('mrd.rel.pages')}>
            <Input inputMode="numeric" value={f.pages} onChange={set('pages')} />
          </FormField>
          <FormField label={t('mrd.rel.purpose')} className="sm:col-span-3">
            <Input value={f.purpose} onChange={set('purpose')} />
          </FormField>
        </div>
        <Button
          className="self-start"
          loading={state.isLoading}
          disabled={!rec || !f.name.trim() || !Number(f.pages)}
          onClick={async () => {
            setFailure(null);
            try {
              const out = await create({
                recordId: rec.id,
                requester: {
                  kind: f.kind,
                  name: f.name.trim(),
                  relation: f.relation.trim() || undefined,
                  idProof: f.idProof.trim(),
                  authorisation: f.authorisation.trim() || undefined,
                },
                purpose: f.purpose.trim(),
                pages: Number(f.pages),
              }).unwrap();
              setPending(out.approvalId);
              setRec(null);
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          {t('mrd.rel.submit')}
        </Button>
      </div>
    </Card>
  );
}

function ReleasesTab() {
  const { t } = useTranslation();
  const can = useCan();
  const { toast } = useToast();
  const q = useMrdReleasesQuery({});
  const [release, state] = useReleaseCopyMutation();
  const [failure, setFailure] = useState(null);
  return (
    <div className="flex flex-col gap-3">
      {can('mrd:release:create') && <ReleaseForm />}
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView
        query={q}
        rows={4}
        empty={<EmptyState bordered={false} title={t('mrd.rel.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono">{r.requestNo}</span>
                <span className="min-w-56 flex-1">
                  {r.patient} · {r.ipNo}
                  <span className="block text-muted">
                    {t('mrd.rel.line', {
                      name: r.requester.name,
                      kind: t(`mrd.rel.kinds.${r.requester.kind}`),
                      pages: r.pages,
                      fee: inr(r.fee),
                    })}
                  </span>
                </span>
                <StatusBadge
                  tone={RELEASE_TONE[r.status]}
                  label={t(`mrd.rel.status.${r.status}`)}
                />
                {r.status === 'APPROVED' && can('mrd:release:create') && (
                  <Button
                    size="sm"
                    disabled={state.isLoading}
                    onClick={async () => {
                      setFailure(null);
                      try {
                        await release(r.id).unwrap();
                        toast({ tone: 'success', title: t('mrd.rel.released') });
                      } catch (err) {
                        setFailure(err);
                      }
                    }}
                  >
                    {t('mrd.rel.handOver')}
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

function Reported({ kind, row }) {
  const { t } = useTranslation();
  const [ref, setRef] = useState('');
  const [mark, state] = useMarkReportedMutation();
  if (row.reportedAt)
    return (
      <span className="text-xs text-muted">{t('mrd.reg.reported', { ref: row.crsRefNo })}</span>
    );
  return (
    <span className="flex items-center gap-2">
      <StatusBadge
        tone={row.overdue ? 'critical' : 'warning'}
        label={
          row.overdue ? t('mrd.reg.overdue') : t('mrd.reg.due', { date: fmtDate(row.crsDueBy) })
        }
      />
      <Input
        aria-label={t('mrd.reg.crsRef')}
        placeholder={t('mrd.reg.crsRef')}
        className="w-36"
        value={ref}
        onChange={(e) => setRef(e.target.value)}
      />
      <Button
        size="sm"
        disabled={ref.trim().length < 3 || state.isLoading}
        onClick={() => mark({ kind, id: row.id, crsRefNo: ref.trim() })}
      >
        {t('mrd.reg.markReported')}
      </Button>
    </span>
  );
}

function BirthForm() {
  const { t } = useTranslation();
  const [mother, setMother] = useState(null);
  const [f, setF] = useState({
    fatherName: '',
    bornAt: nowLocal(),
    sex: 'F',
    weightGrams: '',
    deliveryType: 'NORMAL',
    place: '',
  });
  const [save, state] = useRecordBirthMutation();
  const [failure, setFailure] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={t('mrd.reg.birthNew')}>
      {failure && <ApiErrorNotice error={failure} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <PatientPicker label={t('mrd.reg.mother')} value={mother} onChange={setMother} />
        </div>
        <FormField label={t('mrd.reg.father')}>
          <Input value={f.fatherName} onChange={set('fatherName')} />
        </FormField>
        <FormField label={t('mrd.reg.bornAt')}>
          <Input type="datetime-local" value={f.bornAt} onChange={set('bornAt')} />
        </FormField>
        <FormField label={t('mrd.reg.sex')}>
          <Select
            value={f.sex}
            onChange={set('sex')}
            options={['F', 'M', 'O'].map((s) => ({ value: s, label: t(`mrd.sex.${s}`) }))}
          />
        </FormField>
        <FormField label={t('mrd.reg.weight')}>
          <Input inputMode="numeric" value={f.weightGrams} onChange={set('weightGrams')} />
        </FormField>
        <FormField label={t('mrd.reg.delivery')}>
          <Select
            value={f.deliveryType}
            onChange={set('deliveryType')}
            options={['NORMAL', 'ASSISTED', 'CAESAREAN'].map((s) => ({
              value: s,
              label: t(`mrd.delivery.${s}`),
            }))}
          />
        </FormField>
        <FormField label={t('mrd.reg.place')}>
          <Input value={f.place} onChange={set('place')} />
        </FormField>
      </div>
      <Button
        className="mt-3"
        loading={state.isLoading}
        disabled={!mother || !Number(f.weightGrams)}
        onClick={async () => {
          setFailure(null);
          try {
            await save({
              motherId: mother.id,
              fatherName: f.fatherName.trim() || undefined,
              bornAt: istIso(f.bornAt),
              sex: f.sex,
              weightGrams: Number(f.weightGrams),
              deliveryType: f.deliveryType,
              place: f.place.trim() || undefined,
            }).unwrap();
            setMother(null);
            setF({ ...f, fatherName: '', weightGrams: '' });
          } catch (err) {
            setFailure(err);
          }
        }}
      >
        {t('mrd.reg.save')}
      </Button>
    </Card>
  );
}

function DeathForm() {
  const { t } = useTranslation();
  const [patient, setPatient] = useState(null);
  const [f, setF] = useState({
    diedAt: nowLocal(),
    immediate: '',
    antecedent: '',
    underlying: '',
    mccdNo: '',
    certifiedBy: '',
    mlc: false,
    slot: '',
  });
  const [save, state] = useRecordDeathMutation();
  const [failure, setFailure] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={t('mrd.reg.deathNew')}>
      {failure && <ApiErrorNotice error={failure} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <PatientPicker label={t('mrd.reg.deceased')} value={patient} onChange={setPatient} />
        </div>
        <FormField label={t('mrd.reg.diedAt')}>
          <Input type="datetime-local" value={f.diedAt} onChange={set('diedAt')} />
        </FormField>
        <FormField label={t('mrd.reg.mccd')}>
          <Input value={f.mccdNo} onChange={set('mccdNo')} />
        </FormField>
        <FormField label={t('mrd.reg.certifiedBy')}>
          <Input value={f.certifiedBy} onChange={set('certifiedBy')} />
        </FormField>
        <FormField label={t('mrd.reg.immediate')}>
          <Input value={f.immediate} onChange={set('immediate')} />
        </FormField>
        <FormField label={t('mrd.reg.antecedent')}>
          <Input value={f.antecedent} onChange={set('antecedent')} />
        </FormField>
        <FormField label={t('mrd.reg.underlying')}>
          <Input value={f.underlying} onChange={set('underlying')} />
        </FormField>
        <FormField label={t('mrd.reg.slot')}>
          <Input value={f.slot} onChange={set('slot')} />
        </FormField>
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            checked={f.mlc}
            onChange={(e) => setF({ ...f, mlc: e.target.checked })}
          />
          {t('mrd.reg.isMlc')}
        </label>
      </div>
      <Button
        className="mt-3"
        loading={state.isLoading}
        disabled={!patient || f.immediate.trim().length < 3 || f.mccdNo.trim().length < 2}
        onClick={async () => {
          setFailure(null);
          try {
            await save({
              patientId: patient.id,
              diedAt: istIso(f.diedAt),
              cause: {
                immediate: f.immediate.trim(),
                antecedent: f.antecedent.trim() || undefined,
                underlying: f.underlying.trim() || undefined,
              },
              mccdNo: f.mccdNo.trim(),
              certifiedBy: f.certifiedBy.trim(),
              mlc: f.mlc,
              mortuarySlot: f.slot.trim() || undefined,
            }).unwrap();
            setPatient(null);
          } catch (err) {
            setFailure(err);
          }
        }}
      >
        {t('mrd.reg.save')}
      </Button>
    </Card>
  );
}

function Handover({ d }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ handedTo: '', relation: '', idProof: '', toPolice: d.mlc });
  const [save, state] = useHandoverBodyMutation();
  const [failure, setFailure] = useState(null);
  if (d.mortuary?.handedOverAt)
    return (
      <span className="text-xs text-muted">
        {t('mrd.reg.handedTo', { to: d.mortuary.handedTo, date: fmtDate(d.mortuary.handedOverAt) })}
      </span>
    );
  return (
    <span className="flex flex-wrap items-center gap-2">
      {failure && <ApiErrorNotice error={failure} />}
      <Input
        aria-label={t('mrd.reg.handTo')}
        placeholder={t('mrd.reg.handTo')}
        className="w-36"
        value={f.handedTo}
        onChange={(e) => setF({ ...f, handedTo: e.target.value })}
      />
      <Input
        aria-label={t('mrd.reg.idProof')}
        placeholder={t('mrd.reg.idProof')}
        className="w-32"
        value={f.idProof}
        onChange={(e) => setF({ ...f, idProof: e.target.value })}
      />
      <Button
        size="sm"
        disabled={f.handedTo.trim().length < 3 || f.idProof.trim().length < 4 || state.isLoading}
        onClick={async () => {
          setFailure(null);
          try {
            await save({
              id: d.id,
              handedTo: f.handedTo.trim(),
              idProof: f.idProof.trim(),
              toPolice: d.mlc,
            }).unwrap();
          } catch (err) {
            setFailure(err);
          }
        }}
      >
        {d.mlc ? t('mrd.reg.toPolice') : t('mrd.reg.handOver')}
      </Button>
    </span>
  );
}

function MlcForm() {
  const { t } = useTranslation();
  const [patient, setPatient] = useState(null);
  const [f, setF] = useState({
    nature: 'ROAD_ACCIDENT',
    policeStation: '',
    intimatedAt: nowLocal(),
    officer: '',
    injuries: '',
  });
  const [save, state] = useRecordMlcMutation();
  const [failure, setFailure] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={t('mrd.reg.mlcNew')}>
      {failure && <ApiErrorNotice error={failure} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <PatientPicker label={t('mrd.col.patient')} value={patient} onChange={setPatient} />
        </div>
        <FormField label={t('mrd.reg.nature')}>
          <Select
            value={f.nature}
            onChange={set('nature')}
            options={[
              'ROAD_ACCIDENT',
              'ASSAULT',
              'POISONING',
              'BURNS',
              'FALL',
              'SEXUAL_OFFENCE',
              'OTHER',
            ].map((n) => ({ value: n, label: t(`mrd.nature.${n}`) }))}
          />
        </FormField>
        <FormField label={t('mrd.reg.police')}>
          <Input value={f.policeStation} onChange={set('policeStation')} />
        </FormField>
        <FormField label={t('mrd.reg.intimatedAt')}>
          <Input type="datetime-local" value={f.intimatedAt} onChange={set('intimatedAt')} />
        </FormField>
        <FormField label={t('mrd.reg.officer')}>
          <Input value={f.officer} onChange={set('officer')} />
        </FormField>
        <FormField label={t('mrd.reg.injuries')} className="sm:col-span-2">
          <Input value={f.injuries} onChange={set('injuries')} />
        </FormField>
      </div>
      <Button
        className="mt-3"
        loading={state.isLoading}
        disabled={!patient || f.policeStation.trim().length < 2}
        onClick={async () => {
          setFailure(null);
          try {
            await save({
              patientId: patient.id,
              nature: f.nature,
              policeStation: f.policeStation.trim(),
              intimatedAt: istIso(f.intimatedAt),
              officer: f.officer.trim() ? { name: f.officer.trim() } : undefined,
              injuries: f.injuries.trim() || undefined,
            }).unwrap();
            setPatient(null);
          } catch (err) {
            setFailure(err);
          }
        }}
      >
        {t('mrd.reg.save')}
      </Button>
    </Card>
  );
}

function RegistersTab() {
  const { t } = useTranslation();
  const can = useCan();
  const [reg, setReg] = useUrlState('reg', 'births');
  const births = useBirthsQuery(undefined, { skip: reg !== 'births' });
  const deaths = useDeathsQuery(undefined, { skip: reg !== 'deaths' });
  const mlc = useMlcCasesQuery(undefined, { skip: reg !== 'mlc' });
  const write = can('mrd:register:create');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2" role="group" aria-label={t('mrd.reg.which')}>
        {['births', 'deaths', 'mlc'].map((k) => (
          <Button
            key={k}
            size="sm"
            variant={reg === k ? 'primary' : 'secondary'}
            aria-pressed={reg === k}
            onClick={() => setReg(k)}
          >
            {t(`mrd.reg.${k}`)}
          </Button>
        ))}
      </div>
      {reg === 'births' && (
        <>
          {write && <BirthForm />}
          <QueryView
            query={births}
            rows={3}
            empty={t('mrd.reg.empty')}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <ul className="flex flex-col divide-y divide-line text-sm">
                {d.items.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="font-mono">{b.regNo}</span>
                    <span className="min-w-56 flex-1">
                      {t('mrd.reg.birthLine', {
                        mother: b.mother,
                        sex: t(`mrd.sex.${b.sex}`),
                        weight: b.weightGrams,
                        date: fmtDate(b.bornAt),
                      })}
                    </span>
                    <Reported kind="births" row={b} />
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </>
      )}
      {reg === 'deaths' && (
        <>
          {write && <DeathForm />}
          <QueryView
            query={deaths}
            rows={3}
            empty={t('mrd.reg.empty')}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <ul className="flex flex-col divide-y divide-line text-sm">
                {d.items.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="font-mono">{x.regNo}</span>
                    <span className="min-w-56 flex-1">
                      {x.patient} · {fmtDate(x.diedAt)} · {x.cause?.immediate}
                      <span className="block text-xs text-muted">
                        {t('mrd.reg.mccdLine', { no: x.mccdNo, by: x.certifiedBy })}
                        {x.mlc && ` · ${t('mrd.rec.mlc')}`}
                      </span>
                    </span>
                    <Reported kind="deaths" row={x} />
                    {write && <Handover d={x} />}
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </>
      )}
      {reg === 'mlc' && (
        <>
          {write && <MlcForm />}
          <QueryView
            query={mlc}
            rows={3}
            empty={t('mrd.reg.empty')}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <ul className="flex flex-col divide-y divide-line text-sm">
                {d.items.map((m) => (
                  <li key={m.id} className="flex flex-wrap gap-3 py-2">
                    <span className="font-mono">{m.mlcNo}</span>
                    <span className="min-w-56 flex-1">
                      {m.patient} · {t(`mrd.nature.${m.nature}`)}
                      <span className="block text-xs text-muted">
                        {t('mrd.reg.mlcLine', {
                          station: m.policeStation,
                          date: fmtDate(m.intimatedAt),
                        })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </>
      )}
    </div>
  );
}

function StatisticsTab() {
  const { t } = useTranslation();
  const [month, setMonth] = useUrlState('month', monthIST());
  const q = useMrdStatisticsQuery(month);
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('mrd.stats.month')} className="w-44">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </FormField>
      <QueryView query={q} rows={3}>
        {(s) => (
          <>
            <KpiRow
              items={[
                { label: t('mrd.stats.admissions'), value: String(s.admissions) },
                { label: t('mrd.stats.discharges'), value: String(s.discharges) },
                { label: t('mrd.stats.deaths'), value: String(s.deaths) },
                { label: t('mrd.stats.births'), value: String(s.births) },
                { label: t('mrd.stats.alos'), value: t('mrd.stats.days', { n: s.averageLos }) },
              ]}
            />
            <KpiRow
              items={[
                { label: t('mrd.stats.gdr'), value: `${s.grossDeathRate}%` },
                { label: t('mrd.stats.ndr'), value: `${s.netDeathRate}%` },
                ...Object.entries(s.outcomes)
                  .filter(([k]) => k !== 'NORMAL' && k !== 'DEATH')
                  .map(([k, v]) => ({ label: t(`mrd.outcome.${k}`), value: String(v) })),
              ]}
            />
          </>
        )}
      </QueryView>
    </div>
  );
}

/**
 * Medical records (board Records, route /records): completion worklist with deficiencies by
 * doctor, ICD-10 coding, physical files, release of information through approval, the birth,
 * death and medico-legal registers, and monthly hospital statistics.
 */
export default function RecordsPage() {
  useStrings(addDxkitStrings, addPatientsStrings, addMrdStrings);
  const { t } = useTranslation();
  const can = useCan();
  const def = useDeficienciesQuery();
  const pendingItems = (def.data?.items ?? []).reduce((s, g) => s + g.records, 0);
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('mrd.crumb') }, { label: t('mrd.title') }]}
        title={t('mrd.title')}
        description={t('mrd.description')}
      />
      <UrlTabs
        param="tab"
        label={t('mrd.tabsLabel')}
        reset={['st', 'search', 'rec', 'reg', 'month']}
        tabs={[
          { id: 'records', label: t('mrd.tabs.records'), body: <WorklistTab /> },
          {
            id: 'deficiencies',
            label: t('mrd.tabs.deficiencies'),
            count: pendingItems || undefined,
            body: <DeficienciesTab />,
          },
          can('mrd:release:read') && {
            id: 'releases',
            label: t('mrd.tabs.releases'),
            body: <ReleasesTab />,
          },
          can('mrd:register:read') && {
            id: 'registers',
            label: t('mrd.tabs.registers'),
            body: <RegistersTab />,
          },
          { id: 'stats', label: t('mrd.tabs.stats'), body: <StatisticsTab /> },
        ]}
      />
    </Page>
  );
}
