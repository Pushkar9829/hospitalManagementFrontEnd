import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { addOpdStrings } from '@hms/i18n/opd';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
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
import { useCan } from '../../../lib/useCan.js';
import { useDebounced } from '../../../lib/useDebounced.js';
import { useStrings } from '../../../lib/useStrings.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate, fmtTime, localeOf } from '../../dx-kit/format.js';
import { PatientPicker } from '../../patients/components/PatientPicker.jsx';
import {
  useCallNextTokenMutation,
  useEnquiriesQuery,
  useEnquirySummaryQuery,
  useFoCountersQuery,
  useIssueCounterTokenMutation,
  useIssuePassMutation,
  useLocatePatientQuery,
  useLogEnquiryMutation,
  useMarkPassOutMutation,
  useVisitorLogQuery,
  useVisitorPassesQuery,
} from '../api.js';

const OUTCOME_TONE = {
  BOOKED: 'success',
  LEAD: 'accent',
  FOLLOW_UP: 'warning',
  ANSWERED: 'neutral',
};
const CHANNELS = ['PHONE', 'WALK_IN', 'WHATSAPP', 'EMAIL'];
const OUTCOMES = ['ANSWERED', 'BOOKED', 'LEAD', 'FOLLOW_UP'];
const CATEGORIES = ['DOCTOR', 'PACKAGE', 'TARIFF', 'BED', 'VISITING', 'OTHER'];

/** Counter tokens: now serving, waiting, average service time; issue and call next. */
function Counters({ canWrite }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const counters = useFoCountersQuery(undefined, { pollingInterval: 20_000 });
  const [issue] = useIssueCounterTokenMutation();
  const [callNext] = useCallNextTokenMutation();
  const [failure, setFailure] = useState(null);
  return (
    <Card title={t('opd.fo.countersTitle')}>
      <ApiErrorNotice error={failure} />
      <QueryView query={counters} rows={3}>
        {(d) => (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {d.items.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-card border border-line p-4">
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-semibold text-ink">{c.name}</strong>
                  <span className="font-mono text-2xl font-bold text-ink">{c.current ?? '-'}</span>
                </div>
                <p className="text-sm text-muted">
                  {t('opd.fo.waiting', { count: c.waiting })}
                  {c.avgMin != null && ` · ${t('opd.fo.avg', { min: c.avgMin })}`}
                </p>
                {canWrite && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        setFailure(null);
                        try {
                          const r = await callNext({ id: c.id }).unwrap();
                          toast({
                            tone: 'info',
                            title: t('opd.fo.called', { token: r.current, counter: r.counter }),
                          });
                        } catch (e) {
                          setFailure(e);
                        }
                      }}
                    >
                      {t('opd.fo.callNext')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const r = await issue({ counterId: c.id }).unwrap();
                        toast({
                          tone: 'success',
                          title: t('opd.fo.issued', { token: r.no, ahead: r.ahead }),
                        });
                      }}
                    >
                      {t('opd.fo.issueToken')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </Card>
  );
}

const enquirySchema = (t) =>
  z.object({
    caller: z.string().max(120).optional(),
    mobile: z
      .string()
      .regex(/^\d{10}$/, t('opd.fo.errors.mobile'))
      .optional(),
    topic: z.string().trim().min(3, t('opd.fo.errors.topic')),
    category: z.enum(CATEGORIES),
    channel: z.enum(CHANNELS),
    outcome: z.enum(OUTCOMES),
  });

function Enquiries({ canWrite }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const enquiries = useEnquiriesQuery({ limit: 50 });
  const [log] = useLogEnquiryMutation();
  return (
    <Card
      title={t('opd.fo.enquiriesTitle')}
      actions={canWrite && <Button onClick={() => setOpen(true)}>{t('opd.fo.logEnquiry')}</Button>}
      padding={false}
    >
      <QueryView
        query={enquiries}
        empty={<EmptyState bordered={false} title={t('opd.fo.noEnquiries')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">{t('opd.fo.enquiriesTitle')}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">{t('opd.fo.time')}</th>
                  <th className="px-3 py-2 font-semibold">{t('opd.fo.caller')}</th>
                  <th className="px-3 py-2 font-semibold">{t('opd.fo.topic')}</th>
                  <th className="px-3 py-2 font-semibold">{t('opd.fo.channel')}</th>
                  <th className="px-4 py-2 font-semibold">{t('opd.fo.outcome')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((e) => (
                  <tr key={e.id}>
                    <td className="tabular px-4 py-2">{fmtTime(e.at, localeOf(i18n))}</td>
                    <td className="px-3 py-2">{e.caller ?? t('opd.fo.unknown')}</td>
                    <td className="px-3 py-2">{e.topic}</td>
                    <td className="px-3 py-2">{t(`opd.fo.channels.${e.channel}`)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge
                        tone={OUTCOME_TONE[e.outcome]}
                        label={t(`opd.fo.outcomes.${e.outcome}`)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={t('opd.fo.logEnquiry')}
        schema={enquirySchema(t)}
        defaultValues={{
          caller: '',
          mobile: '',
          topic: '',
          category: 'DOCTOR',
          channel: 'PHONE',
          outcome: 'ANSWERED',
        }}
        fields={[
          { name: 'caller', label: t('opd.fo.caller'), optional: true },
          { name: 'mobile', label: t('opd.fo.mobile'), optional: true, mono: true },
          { name: 'topic', label: t('opd.fo.topic'), required: true, span: 2 },
          {
            name: 'category',
            label: t('opd.fo.category'),
            type: 'select',
            options: CATEGORIES.map((c) => ({ value: c, label: t(`opd.fo.categories.${c}`) })),
          },
          {
            name: 'channel',
            label: t('opd.fo.channel'),
            type: 'select',
            options: CHANNELS.map((c) => ({ value: c, label: t(`opd.fo.channels.${c}`) })),
          },
          {
            name: 'outcome',
            label: t('opd.fo.outcome'),
            type: 'select',
            options: OUTCOMES.map((c) => ({ value: c, label: t(`opd.fo.outcomes.${c}`) })),
          },
        ]}
        submitLabel={t('opd.fo.logEnquiry')}
        onSubmit={(v) => log(v).unwrap()}
        onDone={() => toast({ tone: 'success', title: t('opd.fo.logged') })}
      />
    </Card>
  );
}

/** Issue an attendant or visitor pass and see who is inside. */
function Passes({ canWrite }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [patient, setPatient] = useState(null);
  const [visitor, setVisitor] = useState({ name: '', relation: '', mobile: '' });
  const [type, setType] = useState('ATTENDANT');
  const [bed, setBed] = useState('');
  const [failure, setFailure] = useState(null);
  const passes = useVisitorPassesQuery({ status: 'INSIDE' });
  const [issue, issueState] = useIssuePassMutation();
  const [markOut] = useMarkPassOutMutation();

  const submit = async (e) => {
    e.preventDefault();
    setFailure(null);
    try {
      const r = await issue({
        patientId: patient?.id,
        bed: bed || undefined,
        type,
        visitor: {
          name: visitor.name,
          relation: visitor.relation || undefined,
          mobile: visitor.mobile || undefined,
        },
      }).unwrap();
      toast({
        tone: 'success',
        title: t('opd.fo.passIssued', { no: r.passNo, name: r.visitor.name }),
      });
      setVisitor({ name: '', relation: '', mobile: '' });
      setBed('');
    } catch (err) {
      setFailure(err);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {canWrite && (
        <Card title={t('opd.fo.passTitle')} description={t('opd.fo.passHint')}>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <ApiErrorNotice error={failure} />
            <PatientPicker label={t('opd.fo.patient')} value={patient} onChange={setPatient} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t('opd.fo.visitorName')} required>
                <Input
                  value={visitor.name}
                  onChange={(e) => setVisitor((v) => ({ ...v, name: e.target.value }))}
                />
              </FormField>
              <FormField label={t('opd.fo.relation')} optional>
                <Input
                  value={visitor.relation}
                  onChange={(e) => setVisitor((v) => ({ ...v, relation: e.target.value }))}
                />
              </FormField>
              <FormField label={t('opd.fo.mobile')} hint={t('opd.fo.mobileHint')} optional>
                <Input
                  inputMode="numeric"
                  value={visitor.mobile}
                  onChange={(e) => setVisitor((v) => ({ ...v, mobile: e.target.value }))}
                />
              </FormField>
              <FormField label={t('opd.fo.bed')} optional>
                <Input value={bed} onChange={(e) => setBed(e.target.value)} />
              </FormField>
              <FormField label={t('opd.fo.passType')}>
                <Select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  options={['ATTENDANT', 'VISITOR'].map((x) => ({
                    value: x,
                    label: t(`opd.fo.passTypes.${x}`),
                  }))}
                />
              </FormField>
            </div>
            <div>
              <Button type="submit" loading={issueState.isLoading}>
                {t('opd.fo.issuePass')}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Card title={t('opd.fo.activePasses')}>
        <QueryView
          query={passes}
          empty={<EmptyState bordered={false} title={t('opd.fo.noPasses')} />}
          isEmpty={(d) => !d.items.length}
        >
          {(d) => (
            <ul className="flex flex-col divide-y divide-line">
              {d.items.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <strong className="block font-semibold text-ink">{p.visitor.name}</strong>
                    <span className="text-sm text-muted">
                      {[
                        p.patient.name,
                        p.bed,
                        t(`opd.fo.passTypes.${p.type}`),
                        fmtTime(p.inAt, localeOf(i18n)),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <StatusBadge
                    tone={p.status === 'INSIDE' ? 'success' : 'neutral'}
                    label={t(`opd.fo.passStatus.${p.status}`)}
                  />
                  {canWrite && p.status === 'INSIDE' && (
                    <Button size="sm" variant="secondary" onClick={() => markOut({ id: p.id })}>
                      {t('opd.fo.markOut')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Card>
    </div>
  );
}

function VisitorLog() {
  const { t, i18n } = useTranslation();
  const log = useVisitorLogQuery({ limit: 100 });
  const locale = localeOf(i18n);
  return (
    <Card title={t('opd.fo.tabs.log')} padding={false}>
      <QueryView
        query={log}
        empty={<EmptyState bordered={false} title={t('opd.fo.noVisitors')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">{t('opd.fo.tabs.log')}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  {['timeIn', 'visitor', 'patient', 'bed', 'passType', 'timeOut'].map((k) => (
                    <th key={k} className="px-4 py-2 font-semibold">
                      {t(`opd.fo.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((p) => (
                  <tr key={p.id}>
                    <td className="tabular px-4 py-2">{fmtTime(p.inAt, locale)}</td>
                    <td className="px-4 py-2">{p.visitor.name}</td>
                    <td className="px-4 py-2">{p.patient.name}</td>
                    <td className="px-4 py-2 font-mono">{p.bed ?? '-'}</td>
                    <td className="px-4 py-2">{t(`opd.fo.passTypes.${p.type}`)}</td>
                    <td className="tabular px-4 py-2">
                      {p.outAt ? fmtTime(p.outAt, locale) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
    </Card>
  );
}

function Locator() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 300);
  const found = useLocatePatientQuery({ q: term }, { skip: term.length < 2 });
  return (
    <Card title={t('opd.fo.tabs.locator')} description={t('opd.fo.locatorHint')}>
      <div className="flex flex-col gap-4">
        <FormField label={t('opd.fo.search')} className="max-w-md">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </FormField>
        {term.length >= 2 && (
          <QueryView
            query={found}
            empty={<EmptyState bordered={false} title={t('opd.fo.notFound', { q: term })} />}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <ul className="flex flex-col divide-y divide-line" aria-live="polite">
                {d.items.map((r) => (
                  <li key={r.patient.id} className="flex flex-wrap items-baseline gap-3 py-2">
                    <strong className="font-semibold text-ink">{r.patient.name}</strong>
                    <span className="font-mono text-sm text-muted">{r.patient.uhid}</span>
                    <span className="flex-1 text-sm">
                      {[r.place, r.bed].filter(Boolean).join(' · ')}
                    </span>
                    {r.visiting && (
                      <span className="text-sm text-muted">
                        {t('opd.fo.visiting', { hours: r.visiting })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        )}
      </div>
    </Card>
  );
}

function History() {
  const { t, i18n } = useTranslation();
  const summary = useEnquirySummaryQuery({ days: 14 });
  return (
    <Card title={t('opd.fo.tabs.history')} padding={false}>
      <QueryView
        query={summary}
        empty={<EmptyState bordered={false} title={t('opd.fo.noEnquiries')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">{t('opd.fo.tabs.history')}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  {['date', 'enquiries', 'booked', 'leads', 'topTopic'].map((k) => (
                    <th key={k} className="px-4 py-2 font-semibold">
                      {t(`opd.fo.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((r) => (
                  <tr key={r.date}>
                    <td className="px-4 py-2">
                      {fmtDate(new Date(`${r.date}T12:00:00+05:30`), localeOf(i18n))}
                    </td>
                    <td className="tabular px-4 py-2">{r.enquiries}</td>
                    <td className="tabular px-4 py-2">{r.booked}</td>
                    <td className="tabular px-4 py-2">{r.leads}</td>
                    <td className="px-4 py-2">
                      {r.topTopic ? t(`opd.fo.categories.${r.topTopic}`) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
    </Card>
  );
}

/**
 * Front office (board FrontOffice, route /front-office): counter tokens and "now serving",
 * enquiries, attendant and visitor passes with QR codes, the visitor log, the patient locator
 * (no clinical details) and enquiry history.
 */
export default function FrontOfficePage() {
  useStrings(addPatientsStrings, addDxkitStrings, addOpdStrings);
  const { t } = useTranslation();
  const can = useCan();
  const canTokens = can('frontoffice:token:create');
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('opd.fo.crumb') }]}
        title={t('opd.fo.title')}
        description={t('opd.fo.description')}
      />
      <UrlTabs
        label={t('opd.fo.tabs.label')}
        tabs={[
          {
            id: 'today',
            label: t('opd.fo.tabs.today'),
            body: (
              <div className="flex flex-col gap-4">
                <Counters canWrite={canTokens} />
                <Enquiries canWrite={can('frontoffice:enquiry:create')} />
                <Passes canWrite={can('frontoffice:pass:create')} />
              </div>
            ),
          },
          { id: 'log', label: t('opd.fo.tabs.log'), body: <VisitorLog /> },
          { id: 'locator', label: t('opd.fo.tabs.locator'), body: <Locator /> },
          { id: 'history', label: t('opd.fo.tabs.history'), body: <History /> },
        ]}
      />
    </Page>
  );
}
