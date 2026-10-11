import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addIpdStrings } from '@hms/i18n/ipd';
import { addLabStrings } from '@hms/i18n/lab';
import { addRadStrings } from '@hms/i18n/radiology';
import { addPatientsStrings } from '@hms/i18n/patients';
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
  useAddDoctorNoteMutation,
  useAdmissionQuery,
  useAdmissionsQuery,
  usePlanDischargeMutation,
  useVitalsQuery,
} from '../api.js';
import { STAY_TONE } from '../ipd.js';
import { NotesList, VitalsTable } from '../components/ClinicalLists.jsx';
import { MedOrders } from '../components/MedOrders.jsx';
import { StayHeader } from '../components/StayHeader.jsx';
import { PatientLabPanel } from '../../lab/components/PatientLabPanel.jsx';
import { PatientImagingPanel } from '../../radiology/components/PatientImagingPanel.jsx';

const SOAP = ['subjective', 'objective', 'assessment', 'plan'];

/** Progress note in SOAP form (or the initial assessment when it is still due; rule R10). */
function NoteForm({ admissionId, initialDue }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [soap, setSoap] = useState({ subjective: '', objective: '', assessment: '', plan: '' });
  const [failure, setFailure] = useState(null);
  const [save, state] = useAddDoctorNoteMutation();
  const kind = initialDue ? 'DOCTOR_INITIAL' : 'PROGRESS';
  const text = SOAP.filter((k) => soap[k].trim())
    .map((k) => `${t(`ipd.rounds.soap.${k}`)}: ${soap[k].trim()}`)
    .join('\n');
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setFailure(null);
        try {
          await save({ id: admissionId, kind, text, data: soap }).unwrap();
          setSoap({ subjective: '', objective: '', assessment: '', plan: '' });
          toast({ tone: 'success', title: t(`ipd.rounds.saved.${kind}`) });
        } catch (err) {
          setFailure(err);
        }
      }}
    >
      {initialDue && <Banner tone="warning">{t('ipd.rounds.initialDue')}</Banner>}
      <ApiErrorNotice error={failure} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {SOAP.map((k) => (
          <FormField key={k} label={t(`ipd.rounds.soap.${k}`)}>
            <Textarea
              rows={3}
              value={soap[k]}
              onChange={(e) => setSoap((s) => ({ ...s, [k]: e.target.value }))}
            />
          </FormField>
        ))}
      </div>
      <p className="text-sm text-muted">{t('ipd.rounds.signHint')}</p>
      <div>
        <Button type="submit" loading={state.isLoading} disabled={text.length < 3}>
          {t('ipd.rounds.sign')}
        </Button>
      </div>
    </form>
  );
}

function PlanDischarge({ admissionId }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [when, setWhen] = useState('');
  const [plan, state] = usePlanDischargeMutation();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <FormField label={t('ipd.rounds.expected')} className="w-64">
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </FormField>
      <Button
        variant="secondary"
        loading={state.isLoading}
        disabled={!when}
        onClick={async () => {
          await plan({ id: admissionId, expectedAt: new Date(when).toISOString() }).unwrap();
          toast({ tone: 'success', title: t('ipd.rounds.planned') });
        }}
      >
        {t('ipd.rounds.planDischarge')}
      </Button>
    </div>
  );
}

function StayDetail({ id }) {
  const { t } = useTranslation();
  const can = useCan();
  const stay = useAdmissionQuery(id);
  const vitals = useVitalsQuery(id);
  const last = vitals.data?.items?.[0];
  return (
    <QueryView query={stay} rows={8}>
      {(a) => (
        <Card>
          <div className="flex flex-col gap-4">
            <StayHeader stay={a} news2={last ? { score: last.news2, risk: last.risk } : null} />
            <UrlTabs
              param="tab"
              label={t('ipd.rounds.tabs.label')}
              tabs={[
                {
                  id: 'note',
                  label: t('ipd.rounds.tabs.note'),
                  body: can('ipd:note:write') ? (
                    <NoteForm
                      admissionId={a.id}
                      initialDue={(a.assessmentsDue ?? []).some((x) => x.kind === 'DOCTOR_INITIAL')}
                    />
                  ) : (
                    <NotesList admissionId={a.id} />
                  ),
                },
                {
                  id: 'orders',
                  label: t('ipd.rounds.tabs.orders'),
                  body: (
                    <MedOrders
                      admissionId={a.id}
                      canOrder={can('orders:create')}
                      canVerify={can('pharmacy:order:verify')}
                    />
                  ),
                },
                {
                  id: 'notes',
                  label: t('ipd.rounds.tabs.notes'),
                  body: <NotesList admissionId={a.id} />,
                },
                {
                  id: 'vitals',
                  label: t('ipd.rounds.tabs.vitals'),
                  body: <VitalsTable admissionId={a.id} />,
                },
                can('lab:order:read') && {
                  id: 'lab',
                  label: t('ipd.rounds.tabs.lab'),
                  body: (
                    <PatientLabPanel
                      patientId={a.patient.id}
                      admissionId={a.id}
                      canOrder={can('lab:order:create')}
                      canAcknowledge={can('lab:result:acknowledge')}
                    />
                  ),
                },
                can('rad:study:read') && {
                  id: 'imaging',
                  label: t('ipd.rounds.tabs.imaging'),
                  body: (
                    <PatientImagingPanel
                      patientId={a.patient.id}
                      admissionId={a.id}
                      canOrder={can('rad:order:create')}
                      canAcknowledge={can('rad:report:acknowledge')}
                    />
                  ),
                },
              ]}
            />
            <div className="flex flex-wrap items-end gap-4 border-t border-line pt-3">
              {can('ipd:discharge:update') &&
                ['ADMITTED', 'UNDER_TREATMENT', 'DISCHARGE_PLANNED'].includes(a.status) && (
                  <PlanDischarge admissionId={a.id} />
                )}
              <Link
                className="text-sm font-semibold text-primary underline"
                to={`/ipd/discharge?id=${a.id}`}
              >
                {t('ipd.rounds.toDischarge')}
              </Link>
            </div>
          </div>
        </Card>
      )}
    </QueryView>
  );
}

/**
 * In-patient rounds (board IpdRounds, route /ipd/rounds): the consultant's in-patients
 * (GET /ipd/admissions?doctorId=me), the progress note in SOAP form, medicine orders, notes and
 * the observation chart; plan the discharge from here.
 */
export default function RoundsPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addIpdStrings, addLabStrings, addRadStrings);
  const { t } = useTranslation();
  const can = useCan();
  const mine = can('ipd:note:write');
  const [id, setId] = useUrlState('id', '');
  const list = useAdmissionsQuery(mine ? { doctorId: 'me' } : {});
  const items = list.data?.items ?? [];
  const current = id || items[0]?.id || '';
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('ipd.crumb') }, { label: t('ipd.rounds.title') }]}
        title={t('ipd.rounds.title')}
        description={t('ipd.rounds.description')}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <Card
          title={
            mine
              ? t('ipd.rounds.mine', { count: items.length })
              : t('ipd.rounds.all', { count: items.length })
          }
        >
          <QueryView
            query={list}
            empty={<EmptyState bordered={false} title={t('ipd.rounds.none')} />}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <PickList
                label={t('ipd.rounds.title')}
                selectedId={current}
                onPick={(v) => setId(v, { reset: ['tab'] })}
                items={d.items.map((a) => ({
                  id: a.id,
                  lead: a.bed.code,
                  title: a.patient.name,
                  sub: `${t('ipd.beds.dayN', { n: a.day })} · ${a.reason}`,
                  badge: { tone: STAY_TONE[a.status], label: t(`ipd.stay.${a.status}`) },
                }))}
              />
            )}
          </QueryView>
        </Card>
        {current ? (
          <StayDetail key={current} id={current} />
        ) : (
          <EmptyState title={t('ipd.rounds.pick')} />
        )}
      </div>
    </Page>
  );
}
