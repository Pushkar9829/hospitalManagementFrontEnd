import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addOpdStrings } from '@hms/i18n/opd';
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
  PatientBanner,
  StatusBadge,
  cn,
  useToast,
} from '@hms/ui';
import { apiError } from '../../../app/apiError.js';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { applyFieldErrors } from '../../../lib/forms.js';
import { inr } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import {
  useCallVisitMutation,
  useCheckInMutation,
  useCloseVisitMutation,
  useCompleteVisitMutation,
  useConsultationQuery,
  useOpdQueueQuery,
  useOpdVisitQuery,
  useSaveVitalsMutation,
  useVisitChargesQuery,
} from '../api.js';
import { feeText, todayIST } from '../opd.js';
import { useConsultForm } from '../useConsultForm.js';
import { useVitalsForm, vitalsDefaults } from '../vitals.js';
import { BookingForm } from '../components/BookingForm.jsx';
import { ConsultNotes } from '../components/ConsultNotes.jsx';
import { OrdersEditor } from '../components/OrdersEditor.jsx';
import { QueueList } from '../components/QueueList.jsx';
import { RxEditor } from '../components/RxEditor.jsx';
import { SaveStatus } from '../components/SaveStatus.jsx';
import { VitalsFields } from '../components/VitalsForm.jsx';

const STEPS = ['vitals', 'consult', 'bill', 'finish'];
const MODES = ['UPI', 'CARD', 'CASH'];
const OUTPUTS = ['PRINT_RX', 'PRINT_RECEIPT', 'WHATSAPP', 'FOLLOW_UP_REMINDER'];

/** Step 1: vitals and the chief complaint, saved to the visit (POST /opd/visits/{id}/vitals). */
function VitalsStep({ visit, onNext, canWrite }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const form = useVitalsForm({ defaults: vitalsDefaults(visit.vitals, visit.complaint) });
  const [save] = useSaveVitalsMutation();
  const [failure, setFailure] = useState(null);
  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await save({ id: visit.id, ...values, allergiesConfirmed: true }).unwrap();
      toast({ tone: 'success', title: t('opd.clinic.vitalsSaved') });
      onNext();
    } catch (e) {
      setFailure(applyFieldErrors(e, form.setError, ['bp', 'complaint', 'priorityReason']));
    }
  });
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <ApiErrorNotice error={failure} />
      <fieldset disabled={!canWrite} className="contents">
        <VitalsFields form={form} compact />
      </fieldset>
      {canWrite && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="submit" loading={form.formState.isSubmitting}>
            {t('opd.clinic.saveVitals')}
          </Button>
          <Button variant="secondary" onClick={onNext}>
            {t('opd.clinic.skipVitals')}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Step 3: the bill from the consultation (GET /opd/visits/{id}/charges) and the payment mode. */
function BillStep({ visitId, mode, onMode, reference, onReference, onNext, prepare }) {
  const { t } = useTranslation();
  const charges = useVisitChargesQuery(visitId);
  const { refetch } = charges;
  useEffect(() => {
    // The bill reads the saved orders: save the consultation first, then read the charges.
    prepare().then(refetch);
    // Once, when the bill step opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <QueryView query={charges} rows={4}>
      {(c) => (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">{t('opd.clinic.billTitle')}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t('opd.clinic.item')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('opd.clinic.qty')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('opd.clinic.amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {c.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">
                      {l.name}
                      {l.stock === 'IN_STOCK' && (
                        <StatusBadge
                          tone="success"
                          label={t('opd.clinic.inStock')}
                          className="ml-2"
                        />
                      )}
                      {l.paid && (
                        <StatusBadge tone="neutral" label={t('opd.clinic.paid')} className="ml-2" />
                      )}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{l.qty}</td>
                    <td className="tabular px-3 py-2 text-right">{inr(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong">
                  <th scope="row" colSpan={2} className="px-3 py-2 text-left font-semibold">
                    {t('opd.clinic.total')}
                  </th>
                  <td className="tabular px-3 py-2 text-right text-lg font-semibold">
                    {inr(c.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div
            role="group"
            aria-label={t('opd.clinic.payBy')}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-sm font-semibold text-ink">{t('opd.clinic.payBy')}</span>
            {MODES.map((m) => (
              <Button
                key={m}
                variant={mode === m ? 'primary' : 'secondary'}
                aria-pressed={mode === m}
                onClick={() => onMode(m)}
              >
                {t(`opd.clinic.modes.${m}`)}
              </Button>
            ))}
          </div>
          {mode !== 'CASH' && (
            <FormField
              label={t('opd.clinic.reference', { mode: t(`opd.clinic.modes.${mode}`) })}
              hint={t('opd.clinic.referenceHint')}
              className="max-w-sm"
            >
              <Input value={reference} onChange={(e) => onReference(e.target.value)} />
            </FormField>
          )}
          <div className="border-t border-line pt-4">
            <Button onClick={onNext}>{t('opd.clinic.nextFinish')}</Button>
          </div>
        </div>
      )}
    </QueryView>
  );
}

/**
 * One patient on the clinic desk: the four steps, with one consultation form that lives across
 * them (auto-saved), and "Finish visit and call next": sign (POST /opd/visits/{id}/complete,
 * rule R13), take the payment and send the outputs (POST /opd/visits/{id}/close), then call the
 * next patient.
 */
function VisitDesk({ visit, consultation, next, onNextPatient, canWrite }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [step, setStep] = useUrlState('step', 'vitals');
  const [mode, setMode] = useState('UPI');
  const [reference, setReference] = useState('');
  const [outputs, setOutputs] = useState(OUTPUTS);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(visit.status === 'CLOSED' ? {} : null);
  const { form, saveState, stop, saveNow, body, clearDraft } = useConsultForm({
    visitId: visit.id,
    consultation,
    canWrite,
  });
  const [complete] = useCompleteVisitMutation();
  const [close] = useCloseVisitMutation();
  const go = async (s) => {
    if (s === 'finish') await saveNow();
    setStep(s);
  };

  const finish = async () => {
    setFailure(null);
    setBusy(true);
    stop();
    try {
      if (consultation.status !== 'SIGNED') await complete({ id: visit.id, ...body() }).unwrap();
      const r = await close({
        id: visit.id,
        mode,
        reference: mode === 'CASH' ? undefined : reference.trim() || undefined,
        outputs,
      }).unwrap();
      clearDraft();
      setClosed(r);
      toast({
        tone: 'success',
        title: t('opd.clinic.closed', { name: visit.patient.name }),
        description: r.receipt
          ? t('opd.clinic.receipt', { no: r.receipt.no, amount: inr(r.receipt.amount) })
          : undefined,
      });
      if (next) onNextPatient(next);
    } catch (e) {
      // R13 (no diagnosis): back to the consultation, the error under the diagnosis.
      setFailure(applyFieldErrors(e, form.setError, ['diagnoses']));
      if (apiError(e)?.code === 'NO_DIAGNOSIS') setStep('consult');
    } finally {
      setBusy(false);
    }
  };

  if (closed)
    return (
      <Banner tone="success" title={t('opd.clinic.closed', { name: visit.patient.name })}>
        {t('opd.clinic.closedHint')}
      </Banner>
    );

  const labels = {
    vitals: t('opd.clinic.steps.vitals'),
    consult: t('opd.clinic.steps.consult'),
    bill: t('opd.clinic.steps.bill'),
    finish: t('opd.clinic.steps.finish'),
  };
  const current = STEPS.includes(step) ? step : 'vitals';
  return (
    <div className="flex flex-col gap-4">
      <ApiErrorNotice error={failure} />
      <UrlTabs
        param="step"
        label={t('opd.clinic.stepsLabel')}
        tabs={[
          {
            id: 'vitals',
            label: labels.vitals,
            body: <VitalsStep visit={visit} canWrite={canWrite} onNext={() => go('consult')} />,
          },
          {
            id: 'consult',
            label: labels.consult,
            body: (
              <fieldset disabled={!canWrite} className="flex flex-col gap-6">
                <div className="flex justify-end">
                  <SaveStatus state={saveState} savedAt={consultation.savedAt} />
                </div>
                <ConsultNotes form={form} />
                <RxEditor
                  form={form}
                  checks={consultation.checks}
                  department={visit.doctor?.department}
                />
                <OrdersEditor form={form} />
                <div className="border-t border-line pt-4">
                  <Button onClick={() => go('bill')}>{t('opd.clinic.nextBill')}</Button>
                </div>
              </fieldset>
            ),
          },
          {
            id: 'bill',
            label: labels.bill,
            body: (
              <BillStep
                visitId={visit.id}
                mode={mode}
                onMode={setMode}
                reference={reference}
                onReference={setReference}
                prepare={saveNow}
                onNext={() => go('finish')}
              />
            ),
          },
          {
            id: 'finish',
            label: labels.finish,
            body: (
              <div className="flex flex-col gap-4">
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 text-sm font-semibold text-ink">
                    {t('opd.clinic.outputs')}
                  </legend>
                  {OUTPUTS.map((o) => (
                    <Checkbox
                      key={o}
                      label={t(`opd.clinic.output.${o}`)}
                      checked={outputs.includes(o)}
                      onChange={(e) =>
                        setOutputs((cur) =>
                          e.target.checked ? [...cur, o] : cur.filter((x) => x !== o),
                        )
                      }
                    />
                  ))}
                </fieldset>
                <p className="text-sm text-muted">
                  {t('opd.clinic.payingBy', { mode: t(`opd.clinic.modes.${mode}`) })}
                </p>
                {canWrite && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                    <Button loading={busy} onClick={finish}>
                      {next
                        ? t('opd.clinic.finishNext', { token: next.token ?? '' })
                        : t('opd.clinic.finish')}
                    </Button>
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
      <p className="sr-only" aria-live="polite">
        {labels[current]}
      </p>
    </div>
  );
}

/** Banner and the step desk for the picked visit (both the visit and its consultation loaded). */
function PatientDesk({ visitId, next, onNextPatient, canWrite }) {
  const { t } = useTranslation();
  const visit = useOpdVisitQuery(visitId);
  const consultation = useConsultationQuery(visitId);
  return (
    <QueryView query={visit} rows={8}>
      {(v) => (
        <Card
          title={t('opd.clinic.patientTitle', { name: v.patient.name, token: v.token ?? '-' })}
          description={[t(`opd.visitType.${v.visitType}`), feeText(t, v.fee)]
            .filter(Boolean)
            .join(' · ')}
        >
          <div className="flex flex-col gap-4">
            <PatientBanner
              name={v.patient.name}
              age={v.patient.age}
              sex={v.patient.gender}
              uhid={v.patient.uhid}
              allergies={v.patient.allergies}
              noKnownAllergies={v.patient.noKnownAllergies}
              consultant={v.doctor?.name}
            />
            <QueryView query={consultation} rows={6}>
              {(c) => (
                <VisitDesk
                  key={v.id}
                  visit={v}
                  consultation={c}
                  next={next}
                  onNextPatient={onNextPatient}
                  canWrite={canWrite}
                />
              )}
            </QueryView>
          </div>
        </Card>
      )}
    </QueryView>
  );
}

const WAITING = ['WAITING', 'IN_TRIAGE', 'TRIAGED', 'CALLED'];

/**
 * Clinic desk (board ClinicDesk, route /clinic): one screen for a small clinic where the same
 * person registers, takes vitals, consults, prescribes, bills and prints. The day's list on the
 * left (GET /opd/queue?doctorId=me&stage=all); a booked patient is checked in when picked. The
 * same OPD and billing modules run underneath, so the clinic can grow into a hospital.
 */
export default function ClinicDeskPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addOpdStrings);
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const canWrite = can('opd:consultation:write') && can('billing:bill:create');
  const [visitId, setVisit] = useUrlState('visit', '');
  const [walkIn, setWalkIn] = useState(false);
  const queue = useOpdQueueQuery({ doctorId: 'me', stage: 'all' }, { pollingInterval: 30_000 });
  const [checkIn] = useCheckInMutation();
  const [call] = useCallVisitMutation();
  const items = queue.data?.items ?? [];
  const current =
    visitId ||
    items.find((q) => q.stage === 'WITH_DOCTOR')?.visitId ||
    items.find((q) => WAITING.includes(q.stage))?.visitId ||
    '';
  const next =
    items.find((q) => q.visitId && q.visitId !== current && WAITING.includes(q.stage)) ?? null;
  const waiting = items.filter((q) => WAITING.includes(q.stage)).length;

  const open = async (q) => {
    let id = q.visitId;
    if (!id && q.appointmentId) {
      const r = await checkIn({ id: q.appointmentId, detailsConfirmed: true }).unwrap();
      id = r.visit.id;
      toast({
        tone: 'success',
        title: t('opd.clinic.checkedIn', { name: q.patient.name, token: r.token.no }),
      });
    }
    if (q.stage !== 'WITH_DOCTOR' && canWrite) await call({ id }).unwrap();
    setVisit(id, { reset: ['step'] });
  };

  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('opd.crumbs.opd') }, { label: t('opd.clinic.crumb') }]}
        title={t('opd.clinic.title')}
        description={t('opd.clinic.description')}
        actions={
          canWrite && (
            <>
              <Link
                to="/patients/new"
                className="inline-flex min-h-tap items-center rounded-control border border-line-strong bg-surface px-4 font-semibold text-ink hover:bg-surface-2"
              >
                {t('opd.clinic.newPatient')}
              </Link>
              <Button onClick={() => setWalkIn(true)}>{t('opd.clinic.walkIn')}</Button>
            </>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <Card
          title={t('opd.clinic.today', { count: items.length })}
          actions={
            <span className="text-sm text-muted">
              {t('opd.clinic.waiting', { count: waiting })}
            </span>
          }
        >
          <QueryView
            query={queue}
            empty={
              <EmptyState
                bordered={false}
                title={t('opd.clinic.empty')}
                description={t('opd.clinic.emptyHint')}
              />
            }
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <QueueList
                items={d.items}
                selectedId={current}
                onPick={(q) =>
                  q.stage === 'DONE' ? setVisit(q.visitId, { reset: ['step'] }) : open(q)
                }
                label={t('opd.clinic.queue')}
              />
            )}
          </QueryView>
        </Card>
        <div className={cn('min-w-0')}>
          {current ? (
            <PatientDesk
              key={current}
              visitId={current}
              next={next}
              onNextPatient={open}
              canWrite={canWrite}
            />
          ) : (
            <EmptyState title={t('opd.clinic.pick')} description={t('opd.clinic.emptyHint')} />
          )}
        </div>
      </div>
      <Dialog open={walkIn} onOpenChange={setWalkIn} title={t('opd.clinic.walkIn')} size="lg">
        <BookingForm
          walkIn
          date={todayIST()}
          submitLabel={t('opd.clinic.issueToken')}
          onBooked={() => setWalkIn(false)}
        />
      </Dialog>
    </Page>
  );
}
