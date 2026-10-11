import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addIpdStrings } from '@hms/i18n/ipd';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  FormField,
  Input,
  Page,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '@hms/ui';
import { apiError } from '../../../app/apiError.js';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { inr, parseRupees } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { PatientPicker } from '../../patients/components/PatientPicker.jsx';
import {
  useAdmissionRequestsQuery,
  useAdmitMutation,
  useBedBoardQuery,
  useIpdLookupsQuery,
} from '../api.js';
import { CATEGORIES } from '../ipd.js';

const PAYERS = ['CASH', 'INSURANCE', 'CORPORATE', 'SCHEME'];

/**
 * Admission (board Admission, route /ipd/admit): from a waiting request or a new patient, with
 * the consultant, reason, bed, payer, medico-legal flag and consents. The API applies the
 * deposit (R2), one-stay (R3) and room-rent (R5) rules; this screen explains them.
 */
export default function AdmitPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addIpdStrings);
  const { t } = useTranslation();
  const { toast } = useToast();
  const [requestId, setRequestId] = useUrlState('request', '');
  const requests = useAdmissionRequestsQuery({
    status: 'REQUESTED,ESTIMATED,WAITING,RESERVED,EXPIRED',
  });
  const lookups = useIpdLookupsQuery();
  const req = requests.data?.items.find((r) => r.id === requestId) ?? null;
  const [patient, setPatient] = useState(null);
  const [doctorId, setDoctorId] = useState('');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('3');
  const [emergency, setEmergency] = useState(false);
  const [category, setCategory] = useState('GENERAL');
  const [bedId, setBedId] = useState('');
  const [payer, setPayer] = useState({ kind: 'CASH', payerId: '', policyNo: '', limit: '' });
  const [mlc, setMlc] = useState({ flag: false, policeIntimation: '' });
  const [consent, setConsent] = useState({ general: false, financial: false, higher: false });
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(null);
  const [admit, admitState] = useAdmitMutation();
  const board = useBedBoardQuery({ category: req?.wardCategory ?? category });
  const beds = useMemo(
    () =>
      (board.data?.wards ?? []).flatMap((w) =>
        w.beds
          .filter((b) => b.status === 'AVAILABLE' || (req && b.id === req.reservedBedId))
          .map((b) => ({
            value: b.id,
            label: `${b.code} · ${w.name}${b.id === req?.reservedBedId ? ` (${t('ipd.admit.reserved')})` : ''}`,
          })),
      ),
    [board.data, req, t],
  );
  const chosenBed = bedId || req?.reservedBedId || '';
  const problem = apiError(failure);

  const submit = async (e) => {
    e.preventDefault();
    setFailure(null);
    try {
      const body = {
        ...(req
          ? { requestId: req.id }
          : { patientId: patient?.id, doctorId, reason, expectedDays: Number(days) || undefined }),
        bedId: chosenBed || undefined,
        emergency: req ? req.urgency === 'EMERGENCY' || emergency : emergency,
        payer: {
          kind: payer.kind,
          payerId: payer.kind === 'CASH' ? undefined : payer.payerId || undefined,
          policyNo: payer.policyNo || undefined,
          roomRentLimit: payer.limit ? parseRupees(payer.limit) : undefined,
        },
        mlc: mlc.flag ? mlc : undefined,
        consentHigherCategory: consent.higher || undefined,
      };
      const r = await admit(body).unwrap();
      setDone(r);
      toast({
        tone: 'success',
        title: t('ipd.admit.done', { name: r.patient.name, ipNo: r.ipNo, bed: r.bed.code }),
      });
    } catch (err) {
      setFailure(err);
    }
  };

  if (done)
    return (
      <Page>
        <PageHeader
          breadcrumb={[{ label: t('ipd.crumb') }, { label: t('ipd.admit.title') }]}
          title={t('ipd.admit.title')}
        />
        <Banner
          tone="success"
          title={t('ipd.admit.done', {
            name: done.patient.name,
            ipNo: done.ipNo,
            bed: done.bed.code,
          })}
        >
          {t('ipd.admit.doneHint')}
          {done.depositDueBy && <p className="mt-1">{t('ipd.admit.depositDue')}</p>}
        </Banner>
        <div className="flex flex-wrap gap-3">
          <Link
            className="font-semibold text-primary underline"
            to={`/ipd/beds?bed=${done.bed.bedId}`}
          >
            {t('ipd.admit.openBoard')}
          </Link>
          <Link className="font-semibold text-primary underline" to={`/nursing/${done.bed.wardId}`}>
            {t('ipd.beds.openNursing')}
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setDone(null);
              setRequestId('');
              setPatient(null);
            }}
          >
            {t('ipd.admit.another')}
          </Button>
        </div>
      </Page>
    );

  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('ipd.crumb') }, { label: t('ipd.admit.title') }]}
        title={t('ipd.admit.title')}
        description={t('ipd.admit.description')}
      />
      <form
        onSubmit={submit}
        noValidate
        className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_20rem]"
      >
        <div className="flex flex-col gap-4">
          <Card title={t('ipd.admit.patientTitle')}>
            <div className="flex flex-col gap-4">
              <FormField label={t('ipd.admit.request')} hint={t('ipd.admit.requestHint')}>
                <Select
                  value={requestId}
                  onChange={(e) => setRequestId(e.target.value)}
                  placeholder={t('ipd.admit.noRequest')}
                  options={(requests.data?.items ?? []).map((r) => ({
                    value: r.id,
                    label: `${r.patient.name} · ${r.reason} · ${t(`ipd.urgency.${r.urgency}`)}`,
                  }))}
                />
              </FormField>
              {req ? (
                <p className="text-sm text-muted">
                  {t('ipd.admit.fromRequest', {
                    doctor: req.doctor.name,
                    days: req.expectedDays,
                    category: t(`ipd.category.${req.wardCategory}`),
                  })}
                </p>
              ) : (
                <>
                  <PatientPicker
                    label={t('ipd.admit.patient')}
                    value={patient}
                    onChange={setPatient}
                  />
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField label={t('ipd.admit.consultant')} required>
                      <Select
                        value={doctorId}
                        onChange={(e) => setDoctorId(e.target.value)}
                        placeholder={t('ipd.admit.pickConsultant')}
                        options={(lookups.data?.doctors ?? []).map((d) => ({
                          value: d.id,
                          label: `${d.name}${d.department ? ` · ${d.department}` : ''}`,
                        }))}
                      />
                    </FormField>
                    <FormField label={t('ipd.admit.days')}>
                      <Input
                        type="number"
                        min={1}
                        max={90}
                        value={days}
                        onChange={(e) => setDays(e.target.value)}
                      />
                    </FormField>
                  </div>
                  <FormField
                    label={t('ipd.admit.reason')}
                    hint={t('ipd.admit.reasonHint')}
                    required
                  >
                    <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </FormField>
                  <Checkbox
                    label={t('ipd.admit.emergency')}
                    description={t('ipd.admit.emergencyHint')}
                    checked={emergency}
                    onChange={(e) => setEmergency(e.target.checked)}
                  />
                </>
              )}
            </div>
          </Card>

          <Card title={t('ipd.admit.bedTitle')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {!req && (
                <FormField label={t('ipd.beds.category')}>
                  <Select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setBedId('');
                    }}
                    options={CATEGORIES.map((c) => ({ value: c, label: t(`ipd.category.${c}`) }))}
                  />
                </FormField>
              )}
              <FormField
                label={t('ipd.admit.bed')}
                hint={beds.length ? undefined : t('ipd.admit.noBeds')}
              >
                <Select
                  value={chosenBed}
                  onChange={(e) => setBedId(e.target.value)}
                  placeholder={t('ipd.admit.pickBed')}
                  options={beds}
                />
              </FormField>
            </div>
          </Card>

          <Card title={t('ipd.admit.payerTitle')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label={t('ipd.admit.payer')}>
                <Select
                  value={payer.kind}
                  onChange={(e) => setPayer((p) => ({ ...p, kind: e.target.value }))}
                  options={PAYERS.map((k) => ({ value: k, label: t(`ipd.payer.${k}`) }))}
                />
              </FormField>
              {payer.kind !== 'CASH' && (
                <>
                  <FormField label={t('ipd.admit.payerName')}>
                    <Select
                      value={payer.payerId}
                      onChange={(e) => setPayer((p) => ({ ...p, payerId: e.target.value }))}
                      placeholder={t('ipd.admit.pickPayer')}
                      options={(lookups.data?.payers ?? []).map((p) => ({
                        value: p.id,
                        label: p.name,
                      }))}
                    />
                  </FormField>
                  <FormField label={t('ipd.admit.policy')} optional>
                    <Input
                      value={payer.policyNo}
                      onChange={(e) => setPayer((p) => ({ ...p, policyNo: e.target.value }))}
                    />
                  </FormField>
                  <FormField
                    label={t('ipd.admit.roomLimit')}
                    hint={t('ipd.admit.roomLimitHint')}
                    optional
                  >
                    <Input
                      inputMode="decimal"
                      value={payer.limit}
                      onChange={(e) => setPayer((p) => ({ ...p, limit: e.target.value }))}
                    />
                  </FormField>
                </>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Checkbox
                label={t('ipd.admit.mlc')}
                checked={mlc.flag}
                onChange={(e) => setMlc((m) => ({ ...m, flag: e.target.checked }))}
              />
              {mlc.flag && (
                <FormField label={t('ipd.admit.police')} className="max-w-md">
                  <Input
                    value={mlc.policeIntimation}
                    onChange={(e) => setMlc((m) => ({ ...m, policeIntimation: e.target.value }))}
                  />
                </FormField>
              )}
            </div>
          </Card>

          <Card title={t('ipd.admit.consentTitle')}>
            <div className="flex flex-col gap-1">
              <Checkbox
                label={t('ipd.admit.consentGeneral')}
                checked={consent.general}
                onChange={(e) => setConsent((c) => ({ ...c, general: e.target.checked }))}
              />
              <Checkbox
                label={t('ipd.admit.consentFinancial')}
                checked={consent.financial}
                onChange={(e) => setConsent((c) => ({ ...c, financial: e.target.checked }))}
              />
              {problem?.code === 'ROOM_RENT_CONSENT' && (
                <Checkbox
                  label={t('ipd.admit.consentHigher')}
                  checked={consent.higher}
                  onChange={(e) => setConsent((c) => ({ ...c, higher: e.target.checked }))}
                />
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title={t('ipd.admit.summary')}>
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
              <dt className="text-muted">{t('ipd.beds.patient')}</dt>
              <dd>{req?.patient.name ?? patient?.name ?? '-'}</dd>
              <dt className="text-muted">{t('ipd.admit.bed')}</dt>
              <dd>{beds.find((b) => b.value === chosenBed)?.label ?? '-'}</dd>
              <dt className="text-muted">{t('ipd.admit.payer')}</dt>
              <dd>{t(`ipd.payer.${payer.kind}`)}</dd>
              {req?.estimate && (
                <>
                  <dt className="text-muted">{t('ipd.admit.estimate')}</dt>
                  <dd>{inr(req.estimate.amount)}</dd>
                  <dt className="text-muted">{t('ipd.admit.deposit')}</dt>
                  <dd>{inr(req.estimate.deposit)}</dd>
                </>
              )}
            </dl>
            <p className="mt-3 text-sm text-muted">{t('ipd.admit.onAdmit')}</p>
          </Card>
          {problem?.code === 'DEPOSIT_REQUIRED' ? (
            <Banner tone="warning" title={t('ipd.admit.depositNeeded')}>
              {t('ipd.admit.depositNeededHint', {
                need: inr(problem.details?.[0]?.need),
                have: inr(problem.details?.[0]?.have ?? 0),
              })}
            </Banner>
          ) : problem?.code === 'ROOM_RENT_CONSENT' ? (
            <Banner tone="warning" title={t('ipd.admit.roomRent')}>
              {t('ipd.admit.roomRentHint', {
                tariff: inr(problem.details?.[0]?.tariff),
                limit: inr(problem.details?.[0]?.limit),
              })}
            </Banner>
          ) : (
            <ApiErrorNotice error={failure} />
          )}
          <Button
            type="submit"
            loading={admitState.isLoading}
            disabled={!consent.general || !consent.financial}
          >
            {t('ipd.admit.admit')}
          </Button>
          {(!consent.general || !consent.financial) && (
            <p className="text-sm text-muted">{t('ipd.admit.consentFirst')}</p>
          )}
        </div>
      </form>
    </Page>
  );
}
