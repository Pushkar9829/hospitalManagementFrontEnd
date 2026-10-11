import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addOpdStrings } from '@hms/i18n/opd';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Page,
  PageHeader,
  PatientBanner,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { applyFieldErrors } from '../../../lib/forms.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { inr } from '../../../lib/money.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate, fmtDateTime, localeOf } from '../../dx-kit/format.js';
import {
  useAddAddendumMutation,
  useCallVisitMutation,
  useCompleteVisitMutation,
  useConsultationQuery,
  useOpdQueueQuery,
  useOpdVisitQuery,
  useShareVisitMutation,
} from '../api.js';
import { useConsultForm } from '../useConsultForm.js';
import { SaveStatus } from '../components/SaveStatus.jsx';
import { PRIORITY_TONE, bpFlag, ymdInstant } from '../opd.js';
import { QueueList } from '../components/QueueList.jsx';
import { ConsultNotes } from '../components/ConsultNotes.jsx';
import { RxEditor } from '../components/RxEditor.jsx';
import { OrdersEditor } from '../components/OrdersEditor.jsx';
import {
  AdmitDialog,
  CertificatesTab,
  ReferDialog,
  SpecialtyTab,
} from '../components/ConsultExtras.jsx';

/** Vitals from triage, the way the board shows them under the banner. */
function VitalsStrip({ visit }) {
  const { t } = useTranslation();
  const v = visit.vitals;
  if (!v) return <p className="text-sm text-muted">{t('opd.consult.vitalsNone')}</p>;
  const items = [
    v.bp && { label: t('opd.vitals.bp'), value: v.bp, high: bpFlag(v.bp) === 'HIGH' },
    v.pulse && { label: t('opd.vitals.pulse'), value: v.pulse },
    v.tempF && { label: t('opd.vitals.temp'), value: v.tempF, high: v.tempF >= 100.4 },
    v.spo2 && { label: t('opd.vitals.spo2'), value: `${v.spo2}%`, high: v.spo2 < 94 },
    v.weightKg && { label: t('opd.vitals.weight'), value: v.weightKg },
    v.bmi && { label: t('opd.vitals.bmi'), value: v.bmi },
  ].filter(Boolean);
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {items.map((i) => (
        <div key={i.label} className="flex items-baseline gap-2">
          <dt className="text-muted">{i.label}</dt>
          <dd className={i.high ? 'font-semibold text-critical' : 'font-semibold text-ink'}>
            {i.value}
            {i.high && <span className="sr-only"> ({t('opd.vitals.bpFlag.HIGH')})</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Past visits, results and the BP and weight trend for a returning patient. */
function HistoryCard({ visit }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  return (
    <Card title={t('opd.consult.history')}>
      {visit.history.length === 0 ? (
        <p className="text-sm text-muted">{t('opd.consult.historyEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {visit.history.map((h) => (
            <li key={h.id} className="text-sm">
              <span className="text-muted">
                {fmtDate(h.date, locale)} · {t(`opd.consult.historyKind.${h.kind}`)}
              </span>
              <strong className="block font-semibold text-ink">{h.title}</strong>
              <span className="text-muted">{h.note}</span>
            </li>
          ))}
        </ol>
      )}
      {visit.vitalsTrend.length > 1 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-2 text-sm font-semibold text-ink">{t('opd.consult.trend')}</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {visit.vitalsTrend.map((p) => (
                <tr key={p.date}>
                  <td className="py-1 text-muted">{fmtDate(p.date, locale)}</td>
                  <td className="tabular py-1">{p.bp}</td>
                  <td className="tabular py-1 text-right">{p.weightKg} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** The open consultation: the tabs, auto-save every pause in typing, and sign and complete. */
function ConsultEditor({ visit, consultation, canWrite }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { form, saveState, stop, body, clearDraft } = useConsultForm({
    visitId: visit.id,
    consultation,
    canWrite,
  });
  const [complete] = useCompleteVisitMutation();
  const [failure, setFailure] = useState(null);
  const [dialog, setDialog] = useState(null);

  const finish = async () => {
    setFailure(null);
    stop();
    try {
      const r = await complete({ id: visit.id, ...body() }).unwrap();
      clearDraft();
      toast({
        tone: 'success',
        title: t('opd.consult.completed', { name: visit.patient.name }),
        description: r.followUp
          ? t('opd.consult.followUpBooked', {
              date: fmtDate(ymdInstant(r.followUp.date), localeOf(i18n)),
            })
          : undefined,
      });
    } catch (e) {
      // Close the dialog so the doctor sees the error under the form (e.g. R13, no diagnosis).
      setFailure(applyFieldErrors(e, form.setError, ['diagnoses']));
      setDialog(null);
    }
  };

  const actions = canWrite && (
    <>
      <Button variant="secondary" onClick={() => setDialog('admit')}>
        {t('opd.consult.orders.admit')}
      </Button>
      <Button variant="secondary" onClick={() => setDialog('refer')}>
        {t('opd.consult.orders.refer')}
      </Button>
    </>
  );

  return (
    <Card
      title={t('opd.consult.titleEmpty')}
      actions={<SaveStatus state={saveState} savedAt={consultation.savedAt} />}
    >
      <form
        noValidate
        onSubmit={form.handleSubmit(() => setDialog('complete'))}
        className="flex flex-col gap-4"
      >
        <fieldset disabled={!canWrite} className="contents">
          <UrlTabs
            label={t('opd.consult.tabs.label')}
            tabs={[
              {
                id: 'notes',
                label: t('opd.consult.tabs.notes'),
                body: <ConsultNotes form={form} />,
              },
              {
                id: 'rx',
                label: t('opd.consult.tabs.rx'),
                count: form.watch('rx').length || null,
                countTone: consultation.checks?.allergy?.length ? 'critical' : undefined,
                body: (
                  <RxEditor
                    form={form}
                    checks={consultation.checks}
                    department={visit.doctor?.department}
                  />
                ),
              },
              {
                id: 'orders',
                label: t('opd.consult.tabs.orders'),
                count: form.watch('orders').length || null,
                body: <OrdersEditor form={form} actions={actions} />,
              },
              {
                id: 'specialty',
                label: t('opd.consult.tabs.specialty'),
                body: <SpecialtyTab form={form} />,
              },
              {
                id: 'certificates',
                label: t('opd.consult.tabs.certificates'),
                body: (
                  <CertificatesTab
                    visitId={visit.id}
                    certificate={consultation.certificate}
                    canWrite={canWrite}
                  />
                ),
              },
            ]}
          />
        </fieldset>
        <ApiErrorNotice error={failure} />
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button type="submit">{t('opd.consult.complete')}</Button>
          </div>
        )}
      </form>
      <ConfirmDialog
        open={dialog === 'complete'}
        onOpenChange={(o) => setDialog(o ? 'complete' : null)}
        title={t('opd.consult.completeTitle')}
        description={t('opd.consult.completeHint')}
        confirmLabel={t('opd.consult.complete')}
        requireReason={null}
        destructive={false}
        onConfirm={finish}
      />
      <AdmitDialog
        open={dialog === 'admit'}
        onOpenChange={(o) => setDialog(o ? 'admit' : null)}
        visit={visit}
      />
      <ReferDialog
        open={dialog === 'refer'}
        onOpenChange={(o) => setDialog(o ? 'refer' : null)}
        visit={visit}
      />
    </Card>
  );
}

/** A signed consultation: read-only summary, addenda (rule R14), share and the next patient. */
function SignedConsultation({ visit, consultation, canWrite, next, onNext }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const locale = localeOf(i18n);
  const [text, setText] = useState('');
  const [textError, setTextError] = useState(null);
  const [addAddendum, addState] = useAddAddendumMutation();
  const [share, shareState] = useShareVisitMutation();
  const c = consultation;
  const none = t('opd.consult.summary.none');

  const rows = [
    [
      t('opd.consult.summary.diagnoses'),
      c.diagnoses.length
        ? c.diagnoses.map((d) => `${d.code} ${d.name}`).join('; ')
        : c.noDiagnosisReason || none,
    ],
    [
      t('opd.consult.summary.rx'),
      c.rx.length
        ? c.rx
            .map(
              (r) =>
                `${r.brand} · ${r.dose} · ${t(`opd.consult.freq.${r.frequency}`)} · ${r.days ?? '-'}`,
            )
            .join('; ')
        : none,
    ],
    [
      t('opd.consult.summary.orders'),
      c.orders.length ? c.orders.map((o) => `${o.name} (${inr(o.price)})`).join('; ') : none,
    ],
    [t('opd.consult.summary.advice'), c.advice || none],
    [
      t('opd.consult.summary.followUp'),
      c.followUp?.date
        ? `${fmtDate(ymdInstant(c.followUp.date), locale)}${c.followUp.note ? ` · ${c.followUp.note}` : ''}`
        : none,
    ],
  ];

  const submitAddendum = async (e) => {
    e.preventDefault();
    if (!text.trim()) {
      setTextError(t('opd.consult.errors.addendum'));
      return;
    }
    setTextError(null);
    await addAddendum({ id: visit.id, text: text.trim() }).unwrap();
    setText('');
    toast({ tone: 'success', title: t('opd.consult.addendumSaved') });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={t('opd.consult.titleEmpty')}
        actions={
          <StatusBadge
            tone="neutral"
            label={t('opd.consult.signedAt', {
              by: c.signedBy,
              time: fmtDateTime(c.signedAt, locale),
            })}
          />
        }
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-base md:grid-cols-[10rem_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-muted">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button
            variant="secondary"
            loading={shareState.isLoading}
            onClick={async () => {
              const r = await share({ id: visit.id, channel: 'WHATSAPP' }).unwrap();
              toast({ tone: 'success', title: t('opd.consult.shared', { mobile: r.sentTo }) });
            }}
          >
            {t('opd.consult.share')}
          </Button>
          <Button disabled={!next} onClick={onNext}>
            {next ? t('opd.consult.next', { token: next.token ?? '' }) : t('opd.consult.nextNone')}
          </Button>
        </div>
      </Card>
      <Card title={t('opd.consult.addenda')} description={t('opd.consult.addendumHint')}>
        {c.addenda?.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {c.addenda.map((a) => (
              <li key={a.id} className="rounded-control border border-line px-3 py-2 text-sm">
                <span className="text-muted">
                  {a.by} · {fmtDateTime(a.at, locale)}
                </span>
                <p className="text-ink">{a.text}</p>
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <form onSubmit={submitAddendum} noValidate className="flex flex-col gap-3">
            <FormField label={t('opd.consult.addendum')} error={textError}>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
            </FormField>
            <div>
              <Button type="submit" variant="secondary" loading={addState.isLoading}>
                {t('opd.consult.addendumAdd')}
              </Button>
            </div>
          </form>
        )}
      </Card>
      <Card title={t('opd.consult.tabs.certificates')}>
        <CertificatesTab visitId={visit.id} certificate={c.certificate} canWrite={canWrite} />
      </Card>
    </div>
  );
}

/** Banner, triage notices, history and the consultation (open or signed) for one visit. */
function VisitWorkspace({ visit, canWrite, next, onNext }) {
  const { t } = useTranslation();
  const consultation = useConsultationQuery(visit.id);
  const triageMissing = visit.triageRequired && !visit.vitals && !visit.triageSkipped;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card padding>
        <div className="flex flex-col gap-3">
          <PatientBanner
            name={visit.patient.name}
            age={visit.patient.age}
            sex={visit.patient.gender}
            uhid={visit.patient.uhid}
            allergies={visit.patient.allergies}
            noKnownAllergies={visit.patient.noKnownAllergies}
            consultant={visit.doctor?.name}
            weightKg={visit.vitals?.weightKg}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {visit.token && (
              <span className="font-mono font-semibold">
                {t('opd.consult.token', { token: visit.token })}
              </span>
            )}
            <StatusBadge tone="neutral" label={t(`opd.visitType.${visit.visitType}`)} />
            {visit.priority && visit.priority !== 'GREEN' && (
              <StatusBadge
                tone={PRIORITY_TONE[visit.priority]}
                label={t(`opd.priority.${visit.priority}`)}
              />
            )}
            {visit.complaint && <span className="text-muted">{visit.complaint}</span>}
          </div>
          <VitalsStrip visit={visit} />
        </div>
      </Card>
      {visit.priority === 'RED' && (
        <Banner tone="critical" role="alert" title={t('opd.consult.redFlag')}>
          {visit.vitals?.priorityReason || visit.complaint}
        </Banner>
      )}
      {triageMissing && <Banner tone="warning">{t('opd.consult.triageMissing')}</Banner>}
      {visit.triageSkipped && (
        <Banner tone="info">
          {t('opd.consult.triageSkipped', { reason: visit.triageSkipped.reason })}
        </Banner>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_20rem]">
        <QueryView query={consultation} rows={8}>
          {(c) =>
            c.status === 'SIGNED' ? (
              <SignedConsultation
                visit={visit}
                consultation={c}
                canWrite={canWrite}
                next={next}
                onNext={onNext}
              />
            ) : (
              <ConsultEditor key={visit.id} visit={visit} consultation={c} canWrite={canWrite} />
            )
          }
        </QueryView>
        <HistoryCard visit={visit} />
      </div>
    </div>
  );
}

/**
 * Consultation (board Consult, route /opd/visits/:id): the doctor's queue on the left
 * (GET /opd/queue?doctorId=me&stage=doctor), the patient in the room on the right. Notes,
 * ICD-10 diagnosis, prescription with allergy and interaction checks, orders, specialty
 * templates and certificates; auto-saved (PUT /opd/visits/{id}/consultation), then signed and
 * completed (POST /opd/visits/{id}/complete). `/opd/visits/next` opens the first patient.
 */
export default function ConsultPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addOpdStrings);
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const navigate = useNavigate();
  const { id } = useParams();
  const canWrite = can('opd:consultation:write');
  const queue = useOpdQueueQuery({ doctorId: 'me', stage: 'doctor' }, { pollingInterval: 30_000 });
  const items = queue.data?.items ?? [];
  const visitId = id === 'next' ? '' : id;
  const visit = useOpdVisitQuery(visitId, { skip: !visitId });
  const [call, callState] = useCallVisitMutation();
  const nextUp = items.find((q) => q.visitId !== visitId && q.stage === 'TRIAGED') ?? null;

  const open = async (q) => {
    if (q.stage === 'TRIAGED' && canWrite) {
      await call({ id: q.visitId }).unwrap();
      toast({
        tone: 'info',
        title: t('opd.consult.called', { token: q.token ?? '', name: q.patient.name }),
      });
    }
    navigate(`/opd/visits/${q.visitId}`);
  };

  if (id === 'next' && queue.data) {
    const first = items.find((q) => q.stage === 'WITH_DOCTOR') ?? items[0];
    if (first) return <Navigate to={`/opd/visits/${first.visitId}`} replace />;
  }

  const name = visit.data?.patient?.name;
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('opd.crumbs.opd') }, { label: t('opd.consult.crumb') }]}
        title={name ? t('opd.consult.title', { name }) : t('opd.consult.titleEmpty')}
        description={t('opd.consult.description')}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <Card
          title={t('opd.consult.queueTitle')}
          actions={
            canWrite &&
            nextUp && (
              <Button size="sm" loading={callState.isLoading} onClick={() => open(nextUp)}>
                {t('opd.consult.callNext')}
              </Button>
            )
          }
        >
          <QueryView
            query={queue}
            empty={
              <EmptyState
                bordered={false}
                title={t('opd.consult.empty')}
                description={t('opd.consult.emptyHint')}
              />
            }
            isEmpty={(d) => !d.items.length}
          >
            {(data) => (
              <>
                <p className="mb-2 text-sm text-muted">
                  {t('opd.consult.waiting', { count: data.items.length })}
                </p>
                <QueueList
                  items={data.items}
                  selectedId={visitId}
                  onPick={open}
                  label={t('opd.consult.queueTitle')}
                />
              </>
            )}
          </QueryView>
        </Card>
        {visitId ? (
          <QueryView query={visit} rows={8} errorTitle={t('opd.consult.notFound')}>
            {(v) => (
              <VisitWorkspace
                key={v.id}
                visit={v}
                canWrite={canWrite}
                next={nextUp}
                onNext={() => nextUp && open(nextUp)}
              />
            )}
          </QueryView>
        ) : (
          <EmptyState title={t('opd.consult.pick')} description={t('opd.consult.emptyHint')} />
        )}
      </div>
    </Page>
  );
}
