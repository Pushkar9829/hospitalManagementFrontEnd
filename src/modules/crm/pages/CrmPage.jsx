import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addCrmStrings } from '@hms/i18n/crm';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import { addPatientsStrings } from '@hms/i18n/patients';
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
import { inr, paiseFrom } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate } from '../../dx-kit/format.js';
import { PatientPicker } from '../../patients/components/PatientPicker.jsx';
import {
  STAGES,
  STAGE_TONE,
  useCrmCampReportQuery,
  useCrmCampaignsQuery,
  useCrmCampsQuery,
  useCrmCardsQuery,
  useCrmCloseCampMutation,
  useCrmCreateCampMutation,
  useCrmCreateCampaignMutation,
  useCrmCreatePlanMutation,
  useCrmFreeVisitMutation,
  useCrmLeadsQuery,
  useCrmLogEnquiryMutation,
  useCrmMakeStatementsMutation,
  useCrmPlansQuery,
  useCrmPreviewAudienceMutation,
  useCrmRegisterAtCampMutation,
  useCrmReferralsQuery,
  useCrmReportQuery,
  useCrmSaveAgreementMutation,
  useCrmSellCardMutation,
  useCrmSendCampaignMutation,
  useCrmSendStatementMutation,
  useCrmSetPreferenceMutation,
  useCrmUpdateLeadMutation,
  useLazyCrmLookupQuery,
} from '../api.js';

const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const monthIST = () => todayIST().slice(0, 7);
const mobileOk = (m) => /^[6-9]\d{9}$/.test(m.trim());

function useAction() {
  const [failure, setFailure] = useState(null);
  const run = async (fn) => {
    setFailure(null);
    try {
      return await fn();
    } catch (err) {
      setFailure(err);
      return null;
    }
  };
  return [run, failure];
}

function CallCentreTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [mobile, setMobile] = useState('');
  const [find, found] = useLazyCrmLookupQuery();
  const [log, logging] = useCrmLogEnquiryMutation();
  const [pref] = useCrmSetPreferenceMutation();
  const [f, setF] = useState({
    name: '',
    topic: 'APPOINTMENT',
    notes: '',
    outcome: '',
    lead: false,
    interest: '',
  });
  const [run, failure] = useAction();
  const d = found.data;
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (mobileOk(mobile)) find(mobile.trim());
        }}
      >
        <FormField label={t('crm.call.mobile')} className="w-56">
          <Input inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </FormField>
        <Button type="submit" disabled={!mobileOk(mobile)} loading={found.isFetching}>
          {t('crm.call.find')}
        </Button>
      </form>
      {failure && <ApiErrorNotice error={failure} />}
      {d && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('crm.call.caller')}>
            <div className="flex flex-col gap-2 text-sm">
              {d.patients.length ? (
                d.patients.map((p) => (
                  <p key={p.id}>
                    <span className="font-semibold">{p.name}</span> · {p.uhid} · {p.age} ·{' '}
                    {p.gender}
                  </p>
                ))
              ) : (
                <p className="text-muted">{t('crm.call.newCaller')}</p>
              )}
              {d.optedOut && <StatusBadge tone="warning" label={t('crm.call.optedOut')} />}
              {d.appointments.map((a) => (
                <p key={a.id}>
                  {t('crm.call.appt', {
                    date: fmtDate(a.date),
                    time: a.time,
                    doctor: a.doctor ?? '–',
                    name: a.patient,
                  })}
                </p>
              ))}
              {d.visits.map((v) => (
                <p key={v.id} className="text-muted">
                  {t('crm.call.visit', {
                    date: fmtDate(v.at),
                    doctor: v.doctor ?? '–',
                    name: v.patient,
                  })}
                </p>
              ))}
              {d.memberships.map((m) => (
                <p key={m.id}>
                  {t('crm.call.card', {
                    card: m.cardNo,
                    plan: m.planName,
                    until: fmtDate(m.validUntil),
                  })}
                </p>
              ))}
              {d.leads.map((l) => (
                <p key={l.id}>
                  <StatusBadge tone={STAGE_TONE[l.stage]} label={t(`crm.stage.${l.stage}`)} />{' '}
                  {l.interest}
                </p>
              ))}
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    run(() => pref({ mobile: d.mobile, optOut: !d.optedOut }).unwrap())
                  }
                >
                  {d.optedOut ? t('crm.call.optIn') : t('crm.call.optOut')}
                </Button>
              </div>
            </div>
          </Card>
          <Card title={t('crm.call.log')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={t('crm.call.name')}>
                <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </FormField>
              <FormField label={t('crm.call.topic')}>
                <Select
                  value={f.topic}
                  onChange={(e) => setF({ ...f, topic: e.target.value })}
                  options={[
                    'APPOINTMENT',
                    'PACKAGE',
                    'REPORT',
                    'BILLING',
                    'GENERAL',
                    'COMPLAINT',
                  ].map((x) => ({
                    value: x,
                    label: t(`crm.call.topics.${x}`),
                  }))}
                />
              </FormField>
              <FormField label={t('crm.call.notes')} className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={f.notes}
                  onChange={(e) => setF({ ...f, notes: e.target.value })}
                />
              </FormField>
              <FormField label={t('crm.call.outcome')} className="sm:col-span-2">
                <Input
                  value={f.outcome}
                  onChange={(e) => setF({ ...f, outcome: e.target.value })}
                />
              </FormField>
              <Checkbox
                checked={f.lead}
                onChange={(e) => setF({ ...f, lead: e.target.checked })}
                label={t('crm.call.openLead')}
              />
              {f.lead && (
                <FormField label={t('crm.lead.interest')}>
                  <Input
                    value={f.interest}
                    onChange={(e) => setF({ ...f, interest: e.target.value })}
                  />
                </FormField>
              )}
            </div>
            <Button
              className="mt-3"
              loading={logging.isLoading}
              disabled={f.lead && f.interest.trim().length < 3}
              onClick={() =>
                run(async () => {
                  await log({
                    mobile: d.mobile,
                    name: f.name.trim() || d.patients[0]?.name || undefined,
                    patientId: d.patients.length === 1 ? d.patients[0].id : undefined,
                    topic: f.topic,
                    notes: f.notes.trim() || undefined,
                    outcome: f.outcome.trim() || undefined,
                    lead: f.lead ? { interest: f.interest.trim() } : undefined,
                  }).unwrap();
                  toast({ tone: 'success', title: t('crm.call.logged') });
                  setF({
                    name: '',
                    topic: 'APPOINTMENT',
                    notes: '',
                    outcome: '',
                    lead: false,
                    interest: '',
                  });
                  find(d.mobile);
                })
              }
            >
              {t('crm.call.save')}
            </Button>
          </Card>
        </div>
      )}
      {d?.enquiries.length > 0 && (
        <Card title={t('crm.call.history')}>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {d.enquiries.map((e) => (
              <li key={e.id} className="py-1.5">
                {fmtDate(e.at)} · {t(`crm.call.topics.${e.topic}`)} · {e.notes ?? ''}{' '}
                {e.outcome && `→ ${e.outcome}`}
                <span className="text-muted"> · {e.by}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function LeadCard({ l }) {
  const { t } = useTranslation();
  const [update, state] = useCrmUpdateLeadMutation();
  const [note, setNote] = useState('');
  const [follow, setFollow] = useState('');
  const [run, failure] = useAction();
  const next = STAGES[STAGES.indexOf(l.stage) + 1];
  const closed = ['CONVERTED', 'LOST'].includes(l.stage);
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{l.name}</span>
        <span className="text-muted">{l.mobile}</span>
        <StatusBadge tone={STAGE_TONE[l.stage]} label={t(`crm.stage.${l.stage}`)} />
        {l.due && <StatusBadge tone="warning" label={t('crm.lead.due')} />}
        <span className="ml-auto text-xs text-muted">
          {l.leadNo} · {t(`crm.source.${l.source}`)}
        </span>
      </div>
      <p>
        {l.interest}
        {l.estimate != null && <span className="text-muted"> · {inr(l.estimate)}</span>}
        {l.convertedRef && <span className="text-muted"> · {l.convertedRef}</span>}
      </p>
      {l.notes.length > 0 && <p className="text-xs text-muted">{l.notes.at(-1).text}</p>}
      {failure && <ApiErrorNotice error={failure} />}
      {!closed && (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            aria-label={t('crm.lead.note')}
            placeholder={t('crm.lead.note')}
            className="w-56"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <FormField label={t('crm.lead.followUp')} className="w-40">
            <Input type="date" value={follow} onChange={(e) => setFollow(e.target.value)} />
          </FormField>
          <Button
            size="sm"
            variant="secondary"
            disabled={state.isLoading || (!note.trim() && !follow)}
            onClick={() =>
              run(async () => {
                await update({
                  id: l.id,
                  note: note.trim() || undefined,
                  nextFollowUp: follow || undefined,
                }).unwrap();
                setNote('');
                setFollow('');
              })
            }
          >
            {t('crm.lead.saveNote')}
          </Button>
          {next && next !== 'CONVERTED' && (
            <Button
              size="sm"
              disabled={state.isLoading}
              onClick={() => run(() => update({ id: l.id, stage: next }).unwrap())}
            >
              {t('crm.lead.moveTo', { stage: t(`crm.stage.${next}`) })}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={state.isLoading || !note.trim()}
            onClick={() =>
              run(() => update({ id: l.id, stage: 'LOST', lostReason: note.trim() }).unwrap())
            }
          >
            {t('crm.lead.lost')}
          </Button>
        </div>
      )}
    </li>
  );
}

function LeadsTab() {
  const { t } = useTranslation();
  const [stage, setStage] = useUrlState('stage', 'NEW,CONTACTED,COUNSELLED,BOOKED');
  const [q, setQ] = useUrlState('search', '');
  const [due, setDue] = useState(false);
  const list = useCrmLeadsQuery({
    stage: due ? undefined : stage,
    q: q || undefined,
    due: due || undefined,
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('crm.show')} className="w-56">
          <Select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            options={[
              { value: 'NEW,CONTACTED,COUNSELLED,BOOKED', label: t('crm.lead.open') },
              ...STAGES.map((s) => ({ value: s, label: t(`crm.stage.${s}`) })),
            ]}
          />
        </FormField>
        <FormField label={t('crm.search')} className="w-56">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </FormField>
        <Checkbox
          checked={due}
          onChange={(e) => setDue(e.target.checked)}
          label={t('crm.lead.dueOnly')}
        />
      </div>
      <QueryView
        query={list}
        rows={5}
        empty={<EmptyState bordered={false} title={t('crm.lead.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="grid gap-3 lg:grid-cols-2">
            {d.items.map((l) => (
              <LeadCard key={l.id} l={l} />
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function CampCard({ c }) {
  const { t } = useTranslation();
  const can = useCan();
  const [open, setOpen] = useState(false);
  const rep = useCrmCampReportQuery(c.id, { skip: !open });
  const [register, state] = useCrmRegisterAtCampMutation();
  const [close] = useCrmCloseCampMutation();
  const [f, setF] = useState({
    name: '',
    mobile: '',
    age: '',
    results: '',
    followUp: false,
    interest: '',
  });
  const [run, failure] = useAction();
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{c.name}</span>
        <span className="text-muted">
          {fmtDate(c.date)} · {c.venue}
        </span>
        <StatusBadge
          tone={c.status === 'DONE' ? 'success' : 'info'}
          label={t(`crm.camp.status.${c.status}`)}
        />
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setOpen((o) => !o)}>
          {open ? t('crm.camp.hide') : t('crm.camp.open', { count: c.registrations.length })}
        </Button>
      </div>
      {open && (
        <>
          {failure && <ApiErrorNotice error={failure} />}
          {rep.data && (
            <p className="text-muted">
              {t('crm.camp.roi', {
                leads: rep.data.leads,
                converted: rep.data.converted,
                revenue: inr(rep.data.revenue),
                cost: inr(rep.data.cost),
                roi: rep.data.roi ?? '–',
              })}
            </p>
          )}
          <ul className="flex flex-col divide-y divide-line">
            {c.registrations.map((r) => (
              <li key={r.id} className="py-1">
                {r.name} · {r.mobile} {r.age != null && `· ${r.age}`} ·{' '}
                {Object.entries(r.results)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(', ')}
                {r.followUp && ` · ${t('crm.camp.followUp')}`}
              </li>
            ))}
          </ul>
          {c.status === 'PLANNED' && can('crm:camp:create') && (
            <div className="flex flex-wrap items-end gap-2">
              <FormField label={t('crm.camp.name')} className="w-40">
                <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </FormField>
              <FormField label={t('crm.call.mobile')} className="w-36">
                <Input
                  inputMode="numeric"
                  value={f.mobile}
                  onChange={(e) => setF({ ...f, mobile: e.target.value })}
                />
              </FormField>
              <FormField label={t('crm.camp.age')} className="w-20">
                <Input
                  inputMode="numeric"
                  value={f.age}
                  onChange={(e) => setF({ ...f, age: e.target.value })}
                />
              </FormField>
              <FormField
                label={t('crm.camp.results')}
                hint={t('crm.camp.resultsHint')}
                className="w-56"
              >
                <Input
                  value={f.results}
                  onChange={(e) => setF({ ...f, results: e.target.value })}
                />
              </FormField>
              <Checkbox
                checked={f.followUp}
                onChange={(e) => setF({ ...f, followUp: e.target.checked })}
                label={t('crm.camp.followUp')}
              />
              <Button
                size="sm"
                loading={state.isLoading}
                disabled={f.name.trim().length < 2 || !mobileOk(f.mobile)}
                onClick={() =>
                  run(async () => {
                    const results = Object.fromEntries(
                      f.results
                        .split(',')
                        .map((x) => x.split('=').map((y) => y.trim()))
                        .filter(([k, v]) => k && v),
                    );
                    await register({
                      id: c.id,
                      name: f.name.trim(),
                      mobile: f.mobile.trim(),
                      age: Number(f.age) || undefined,
                      results,
                      followUp: f.followUp,
                    }).unwrap();
                    setF({
                      name: '',
                      mobile: '',
                      age: '',
                      results: '',
                      followUp: false,
                      interest: '',
                    });
                  })
                }
              >
                {t('crm.camp.register')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => run(() => close(c.id).unwrap())}>
                {t('crm.camp.done')}
              </Button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

function CampsTab() {
  const { t } = useTranslation();
  const can = useCan();
  const q = useCrmCampsQuery();
  const [create, state] = useCrmCreateCampMutation();
  const [f, setF] = useState({
    name: '',
    date: todayIST(),
    venue: '',
    screenings: 'BP, RBS, BMI',
    cost: '',
  });
  const [run, failure] = useAction();
  return (
    <div className="flex flex-col gap-4">
      {can('crm:camp:create') && (
        <Card title={t('crm.camp.new')}>
          {failure && <ApiErrorNotice error={failure} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label={t('crm.camp.title')}>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </FormField>
            <FormField label={t('crm.camp.date')}>
              <Input
                type="date"
                value={f.date}
                onChange={(e) => setF({ ...f, date: e.target.value })}
              />
            </FormField>
            <FormField label={t('crm.camp.venue')}>
              <Input value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />
            </FormField>
            <FormField label={t('crm.camp.screenings')}>
              <Input
                value={f.screenings}
                onChange={(e) => setF({ ...f, screenings: e.target.value })}
              />
            </FormField>
            <FormField label={t('crm.camp.cost')}>
              <Input
                inputMode="decimal"
                value={f.cost}
                onChange={(e) => setF({ ...f, cost: e.target.value })}
              />
            </FormField>
          </div>
          <Button
            className="mt-3"
            loading={state.isLoading}
            disabled={f.name.trim().length < 3 || f.venue.trim().length < 2}
            onClick={() =>
              run(async () => {
                await create({
                  name: f.name.trim(),
                  date: f.date,
                  venue: f.venue.trim(),
                  screenings: f.screenings
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                  cost: paiseFrom(f.cost) ?? 0,
                }).unwrap();
                setF({ ...f, name: '', venue: '' });
              })
            }
          >
            {t('crm.camp.plan')}
          </Button>
        </Card>
      )}
      <QueryView
        query={q}
        rows={3}
        empty={<EmptyState bordered={false} title={t('crm.camp.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col gap-3">
            {d.items.map((c) => (
              <CampCard key={c.id} c={c} />
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function CampaignsTab() {
  const { t } = useTranslation();
  const can = useCan();
  const q = useCrmCampaignsQuery();
  const [preview, previewing] = useCrmPreviewAudienceMutation();
  const [create, creating] = useCrmCreateCampaignMutation();
  const [send, sending] = useCrmSendCampaignMutation();
  const [f, setF] = useState({
    name: '',
    text: '',
    dlt: '',
    conditions: '',
    gender: '',
    ageMin: '',
    ageMax: '',
    lastVisitBefore: '',
  });
  const [reach, setReach] = useState(null);
  const [run, failure] = useAction();
  const audience = () => ({
    conditions: f.conditions
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    gender: f.gender || undefined,
    ageMin: Number(f.ageMin) || undefined,
    ageMax: Number(f.ageMax) || undefined,
    lastVisitBefore: f.lastVisitBefore || undefined,
  });
  return (
    <div className="flex flex-col gap-4">
      {failure && <ApiErrorNotice error={failure} />}
      {can('crm:campaign:create') && (
        <Card title={t('crm.cmp.new')} description={t('crm.cmp.hint')}>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label={t('crm.cmp.name')} className="sm:col-span-2">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </FormField>
            <FormField label={t('crm.cmp.dlt')} className="sm:col-span-2">
              <Input value={f.dlt} onChange={(e) => setF({ ...f, dlt: e.target.value })} />
            </FormField>
            <FormField label={t('crm.cmp.text')} className="sm:col-span-4">
              <Textarea
                rows={2}
                value={f.text}
                onChange={(e) => setF({ ...f, text: e.target.value })}
              />
            </FormField>
            <FormField
              label={t('crm.cmp.conditions')}
              hint={t('crm.cmp.conditionsHint')}
              className="sm:col-span-2"
            >
              <Input
                value={f.conditions}
                onChange={(e) => setF({ ...f, conditions: e.target.value })}
              />
            </FormField>
            <FormField label={t('crm.cmp.gender')}>
              <Select
                value={f.gender}
                placeholder={t('crm.cmp.anyGender')}
                onChange={(e) => setF({ ...f, gender: e.target.value })}
                options={['F', 'M', 'O'].map((g) => ({ value: g, label: t(`crm.gender.${g}`) }))}
              />
            </FormField>
            <FormField label={t('crm.cmp.lastVisitBefore')}>
              <Input
                type="date"
                value={f.lastVisitBefore}
                onChange={(e) => setF({ ...f, lastVisitBefore: e.target.value })}
              />
            </FormField>
            <FormField label={t('crm.cmp.ageMin')}>
              <Input
                inputMode="numeric"
                value={f.ageMin}
                onChange={(e) => setF({ ...f, ageMin: e.target.value })}
              />
            </FormField>
            <FormField label={t('crm.cmp.ageMax')}>
              <Input
                inputMode="numeric"
                value={f.ageMax}
                onChange={(e) => setF({ ...f, ageMax: e.target.value })}
              />
            </FormField>
          </div>
          {reach && (
            <Banner tone="info" className="mt-3">
              {t('crm.cmp.reach', { reach: reach.reach, out: reach.optedOut })}
            </Banner>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              loading={previewing.isLoading}
              onClick={() => run(async () => setReach(await preview(audience()).unwrap()))}
            >
              {t('crm.cmp.preview')}
            </Button>
            <Button
              loading={creating.isLoading}
              disabled={f.name.trim().length < 3 || f.text.trim().length < 10}
              onClick={() =>
                run(async () => {
                  await create({
                    name: f.name.trim(),
                    text: f.text.trim(),
                    dltTemplateId: f.dlt.trim() || undefined,
                    audience: audience(),
                  }).unwrap();
                  setF({ ...f, name: '', text: '' });
                  setReach(null);
                })
              }
            >
              {t('crm.cmp.saveDraft')}
            </Button>
          </div>
        </Card>
      )}
      <QueryView
        query={q}
        rows={3}
        empty={<EmptyState bordered={false} title={t('crm.cmp.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-56 flex-1">
                  <span className="font-semibold">{c.name}</span>
                  <span className="block text-muted">{c.text}</span>
                </span>
                {c.status === 'SENT' ? (
                  <span className="text-muted">
                    {t('crm.cmp.sentLine', {
                      sent: c.sent,
                      out: c.skippedOptOut,
                      responses: c.responses,
                      date: fmtDate(c.sentAt),
                    })}
                  </span>
                ) : (
                  <>
                    <span className="text-muted">
                      {t('crm.cmp.audience', { n: c.audienceCount })}
                    </span>
                    {can('crm:campaign:send') && (
                      <Button
                        size="sm"
                        loading={sending.isLoading}
                        onClick={() => run(() => send(c.id).unwrap())}
                      >
                        {t('crm.cmp.send')}
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function MembershipsTab() {
  const { t } = useTranslation();
  const can = useCan();
  const { toast } = useToast();
  const plans = useCrmPlansQuery();
  const [q, setQ] = useState('');
  const cards = useCrmCardsQuery({ q: q || undefined });
  const [sell, selling] = useCrmSellCardMutation();
  const [createPlan] = useCrmCreatePlanMutation();
  const [freeVisit] = useCrmFreeVisitMutation();
  const [holder, setHolder] = useState(null);
  const [member, setMember] = useState(null);
  const [extra, setExtra] = useState([]);
  const [planCode, setPlanCode] = useState('');
  const [receipt, setReceipt] = useState('');
  const [p, setP] = useState({
    code: '',
    name: '',
    price: '',
    freeVisits: '2',
    discountPct: '10',
    walletCredit: '',
  });
  const [run, failure] = useAction();
  return (
    <div className="flex flex-col gap-4">
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView query={plans} rows={2}>
        {(d) => (
          <div className="grid gap-3 sm:grid-cols-3">
            {d.items.map((pl) => (
              <Card key={pl.id} title={pl.name} description={inr(pl.price)}>
                <p className="text-sm">
                  {t('crm.mem.planLine', {
                    days: pl.validityDays,
                    members: pl.maxMembers,
                    discount: pl.discountPct,
                    visits: pl.freeVisits,
                    wallet: inr(pl.walletCredit),
                  })}
                </p>
              </Card>
            ))}
          </div>
        )}
      </QueryView>
      {can('crm:membership:update') && (
        <Card title={t('crm.mem.newPlan')}>
          <div className="flex flex-wrap items-end gap-3">
            {[
              ['code', 'w-28'],
              ['name', 'w-56'],
              ['price', 'w-28'],
              ['freeVisits', 'w-24'],
              ['discountPct', 'w-24'],
              ['walletCredit', 'w-28'],
            ].map(([k, w]) => (
              <FormField key={k} label={t(`crm.mem.f.${k}`)} className={w}>
                <Input value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
              </FormField>
            ))}
            <Button
              disabled={p.code.trim().length < 2 || p.name.trim().length < 3 || !paiseFrom(p.price)}
              onClick={() =>
                run(async () => {
                  await createPlan({
                    code: p.code.trim(),
                    name: p.name.trim(),
                    price: paiseFrom(p.price),
                    freeVisits: Number(p.freeVisits) || 0,
                    discountPct: Number(p.discountPct) || 0,
                    walletCredit: paiseFrom(p.walletCredit) ?? 0,
                  }).unwrap();
                  setP({ ...p, code: '', name: '', price: '' });
                })
              }
            >
              {t('crm.mem.addPlan')}
            </Button>
          </div>
        </Card>
      )}
      {can('crm:membership:create') && (
        <Card title={t('crm.mem.sell')} description={t('crm.mem.sellHint')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('crm.mem.plan')}>
              <Select
                value={planCode}
                placeholder={t('crm.mem.pickPlan')}
                onChange={(e) => setPlanCode(e.target.value)}
                options={(plans.data?.items ?? []).map((pl) => ({
                  value: pl.code,
                  label: `${pl.name} · ${inr(pl.price)}`,
                }))}
              />
            </FormField>
            <FormField label={t('crm.mem.receipt')}>
              <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} />
            </FormField>
            <PatientPicker label={t('crm.mem.holder')} value={holder} onChange={setHolder} />
            <div>
              <PatientPicker
                label={t('crm.mem.addMember')}
                value={member}
                onChange={setMember}
                exclude={holder?.id}
              />
              {member && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => {
                    setExtra((x) => (x.some((m) => m.id === member.id) ? x : [...x, member]));
                    setMember(null);
                  }}
                >
                  {t('crm.mem.add')}
                </Button>
              )}
              {extra.length > 0 && (
                <p className="mt-1 text-sm">{extra.map((m) => m.name).join(', ')}</p>
              )}
            </div>
          </div>
          <Button
            className="mt-3"
            loading={selling.isLoading}
            disabled={!planCode || !holder || receipt.trim().length < 3}
            onClick={() =>
              run(async () => {
                const out = await sell({
                  planCode,
                  holderId: holder.id,
                  memberIds: extra.map((m) => m.id),
                  paymentRef: receipt.trim(),
                }).unwrap();
                toast({ tone: 'success', title: t('crm.mem.sold', { card: out.cardNo }) });
                setHolder(null);
                setExtra([]);
                setReceipt('');
              })
            }
          >
            {t('crm.mem.issue')}
          </Button>
        </Card>
      )}
      <FormField label={t('crm.mem.search')} className="w-64">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </FormField>
      <QueryView
        query={cards}
        rows={3}
        empty={<EmptyState bordered={false} title={t('crm.mem.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono">{m.cardNo}</span>
                <span className="min-w-56 flex-1">
                  <span className="font-semibold">{m.planName}</span> ·{' '}
                  {m.members.map((x) => x.name).join(', ')}
                  <span className="block text-xs text-muted">
                    {t('crm.mem.cardLine', {
                      until: fmtDate(m.validUntil),
                      visits: m.freeVisitsLeft,
                      wallet: inr(m.wallet),
                    })}
                  </span>
                </span>
                <StatusBadge
                  tone={m.status === 'ACTIVE' ? (m.renewDue ? 'warning' : 'success') : 'neutral'}
                  label={m.renewDue ? t('crm.mem.renewDue') : t(`crm.mem.status.${m.status}`)}
                />
                {m.status === 'ACTIVE' && m.freeVisitsLeft > 0 && can('crm:membership:create') && (
                  <Select
                    aria-label={t('crm.mem.useVisit')}
                    value=""
                    placeholder={t('crm.mem.useVisit')}
                    className="w-44"
                    onChange={(e) =>
                      e.target.value &&
                      run(() =>
                        freeVisit({ id: m.id, patientId: e.target.value, ref: 'Counter' }).unwrap(),
                      )
                    }
                    options={m.members.map((x) => ({ value: x.id, label: x.name }))}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function ReferralsTab() {
  const { t } = useTranslation();
  const can = useCan();
  const [month, setMonth] = useUrlState('month', monthIST());
  const q = useCrmReferralsQuery(month);
  const [save] = useCrmSaveAgreementMutation();
  const [make, making] = useCrmMakeStatementsMutation();
  const [send] = useCrmSendStatementMutation();
  const [fees, setFees] = useState({});
  const [statements, setStatements] = useState(null);
  const [run, failure] = useAction();
  const edit = can('crm:referral:update');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('crm.month')} className="w-44">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </FormField>
        {edit && (
          <Button
            variant="secondary"
            loading={making.isLoading}
            onClick={() => run(async () => setStatements((await make(month).unwrap()).items))}
          >
            {t('crm.ref.statements')}
          </Button>
        )}
      </div>
      {failure && <ApiErrorNotice error={failure} />}
      <QueryView
        query={q}
        rows={4}
        empty={<EmptyState bordered={false} title={t('crm.ref.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <table className="w-full text-sm">
            <caption className="sr-only">{t('crm.ref.caption', { month })}</caption>
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                {['source', 'newPatients', 'visits', 'revenue', 'fee'].map((k) => (
                  <th
                    key={k}
                    className={`px-3 py-2 font-semibold ${k === 'source' ? '' : 'text-right'}`}
                  >
                    {t(`crm.ref.col.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.items.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    {r.name}
                    <span className="block text-xs text-muted">
                      {t(`crm.ref.kind.${r.kind}`, { defaultValue: r.kind })}
                    </span>
                  </td>
                  <td className="tabular px-3 py-2 text-right">{r.newPatients}</td>
                  <td className="tabular px-3 py-2 text-right">{r.visits}</td>
                  <td className="tabular px-3 py-2 text-right">{inr(r.revenue)}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {edit ? (
                      <span className="flex items-center justify-end gap-2">
                        <Input
                          aria-label={t('crm.ref.feePct', { name: r.name })}
                          inputMode="decimal"
                          className="w-16"
                          value={fees[r.id] ?? r.feePct ?? ''}
                          onChange={(e) => setFees({ ...fees, [r.id]: e.target.value })}
                        />
                        %
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={fees[r.id] == null || fees[r.id] === ''}
                          onClick={() =>
                            run(() =>
                              save({ referralSourceId: r.id, feePct: Number(fees[r.id]) }).unwrap(),
                            )
                          }
                        >
                          {t('crm.ref.save')}
                        </Button>
                        {inr(r.fee)}
                      </span>
                    ) : (
                      inr(r.fee)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryView>
      {statements && (
        <Card title={t('crm.ref.statementsTitle')}>
          {statements.length ? (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {statements.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="flex-1">
                    {s.sourceName} · {inr(s.revenue)} · {t('crm.ref.fee', { fee: inr(s.fee) })}
                  </span>
                  {s.status === 'SENT' ? (
                    <StatusBadge tone="success" label={t('crm.ref.sent')} />
                  ) : (
                    <Button
                      size="sm"
                      onClick={() =>
                        run(async () => {
                          const out = await send(s.id).unwrap();
                          setStatements((xs) => xs.map((x) => (x.id === s.id ? out : x)));
                        })
                      }
                    >
                      {t('crm.ref.send')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t('crm.ref.noFees')}</p>
          )}
        </Card>
      )}
    </div>
  );
}

function ReportTab() {
  const { t } = useTranslation();
  const [from, setFrom] = useUrlState('from', `${monthIST()}-01`);
  const [to, setTo] = useUrlState('to', todayIST());
  const q = useCrmReportQuery({ from, to });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <FormField label={t('crm.from')} className="w-40">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label={t('crm.to')} className="w-40">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </div>
      <QueryView query={q} rows={4}>
        {(r) => (
          <div className="flex flex-col gap-3">
            <KpiRow
              items={[
                { label: t('crm.rep.leads'), value: String(r.leads) },
                { label: t('crm.rep.converted'), value: String(r.converted) },
                { label: t('crm.rep.members'), value: String(r.activeMemberships) },
                {
                  label: t('crm.rep.renewals'),
                  value: String(r.renewalsDue),
                  tone: r.renewalsDue ? 'warning' : undefined,
                },
              ]}
            />
            {r.funnel.length > 0 && (
              <table className="w-full text-sm">
                <caption className="sr-only">{t('crm.rep.funnel')}</caption>
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t('crm.rep.source')}</th>
                    {STAGES.map((s) => (
                      <th key={s} className="px-3 py-2 text-right font-semibold">
                        {t(`crm.stage.${s}`)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold">
                      {t('crm.rep.conversion')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.funnel.map((f) => (
                    <tr key={f.source}>
                      <td className="px-3 py-2">{t(`crm.source.${f.source}`)}</td>
                      {STAGES.map((s) => (
                        <td key={s} className="tabular px-3 py-2 text-right">
                          {f[s]}
                        </td>
                      ))}
                      <td className="tabular px-3 py-2 text-right font-semibold">
                        {f.conversionPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.camps.map((c) => (
              <p key={c.id} className="text-sm">
                {c.name} · {fmtDate(c.date)} ·{' '}
                {t('crm.camp.roi', {
                  leads: c.leads,
                  converted: c.converted,
                  revenue: inr(c.revenue),
                  cost: inr(c.cost),
                  roi: c.roi ?? '–',
                })}
              </p>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}

/**
 * Patient CRM (board Crm, route /crm): call-centre lookup and enquiries, leads, health camps,
 * campaigns with consent, family health cards with free visits and a counter wallet, referral
 * partners with fee statements, and the funnel report.
 */
export default function CrmPage() {
  useStrings(addDxkitStrings, addPatientsStrings, addCrmStrings);
  const { t } = useTranslation();
  const can = useCan();
  const due = useCrmLeadsQuery({ due: true }, { skip: !can('crm:lead:read') });
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('crm.crumb') }, { label: t('crm.title') }]}
        title={t('crm.title')}
        description={t('crm.description')}
      />
      <UrlTabs
        param="tab"
        label={t('crm.tabsLabel')}
        reset={['stage', 'search', 'month', 'from', 'to']}
        tabs={[
          can('crm:enquiry:read') && {
            id: 'calls',
            label: t('crm.tabs.calls'),
            body: <CallCentreTab />,
          },
          can('crm:lead:read') && {
            id: 'leads',
            label: t('crm.tabs.leads'),
            count: due.data?.items.length || undefined,
            body: <LeadsTab />,
          },
          can('crm:camp:read') && { id: 'camps', label: t('crm.tabs.camps'), body: <CampsTab /> },
          can('crm:campaign:read') && {
            id: 'campaigns',
            label: t('crm.tabs.campaigns'),
            body: <CampaignsTab />,
          },
          can('crm:membership:read') && {
            id: 'members',
            label: t('crm.tabs.members'),
            body: <MembershipsTab />,
          },
          can('crm:referral:read') && {
            id: 'referrals',
            label: t('crm.tabs.referrals'),
            body: <ReferralsTab />,
          },
          can('crm:report:read') && {
            id: 'report',
            label: t('crm.tabs.report'),
            body: <ReportTab />,
          },
        ]}
      />
    </Page>
  );
}
