import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addRadStrings } from '@hms/i18n/radiology';
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
import { fmtDate, fmtDateTime, fmtTime, localeOf } from '../../dx-kit/format.js';
import {
  MODALITIES,
  RAD_TONE,
  useFormFRegisterQuery,
  useRadCountsQuery,
  useRadMasterQuery,
  useRadSlotsQuery,
  useRadStepMutation,
  useRadStudiesQuery,
  useRadStudyQuery,
} from '../api.js';

const ymdIST = (d = new Date()) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const STAGES = ['schedule', 'today', 'report', 'sign', 'signed'];

/** Split a "Findings: ... Impression: ..." template into the two report boxes. */
function splitTemplate(t) {
  if (!t) return { findings: '', impression: '' };
  const m = t.match(/Findings:\s*([\s\S]*?)\n?Impression:\s*([\s\S]*)/i);
  return m ? { findings: m[1].trim(), impression: m[2].trim() } : { findings: t, impression: '' };
}

function useStep() {
  const { toast } = useToast();
  const [step, state] = useRadStepMutation();
  const [failure, setFailure] = useState(null);
  const run = async (args, title) => {
    setFailure(null);
    try {
      await step(args).unwrap();
      toast({ tone: 'success', title });
      return true;
    } catch (err) {
      setFailure(err);
      return false;
    }
  };
  return { run, failure, busy: state.isLoading };
}

/** Pick a day and a free slot in one of the modality's rooms. */
function SchedulePicker({ study, run, busy }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const [date, setDate] = useState(ymdIST());
  const slots = useRadSlotsQuery({ modality: study.modality, date });
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="font-semibold text-ink">{t('rad.schedule.title')}</h3>
      <FormField label={t('rad.schedule.date')} className="w-48">
        <Input type="date" value={date} min={ymdIST()} onChange={(e) => setDate(e.target.value)} />
      </FormField>
      <QueryView query={slots} rows={2}>
        {(d) =>
          d.rooms.length ? (
            d.rooms.map((r) => (
              <div key={r.code} className="flex flex-col gap-2">
                <p className="text-sm font-semibold">
                  {r.name} · {t('rad.schedule.slotLen', { n: r.slotMin })}
                </p>
                {r.free.length ? (
                  <div className="flex flex-wrap gap-2">
                    {r.free.slice(0, 18).map((at) => (
                      <Button
                        key={at}
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            { id: study.id, step: 'schedule', room: r.code, at },
                            t('rad.schedule.booked', { time: fmtDateTime(at, locale) }),
                          )
                        }
                      >
                        {fmtTime(at, locale)}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t('rad.schedule.full')}</p>
                )}
              </div>
            ))
          ) : (
            <Banner tone="warning">
              {t('rad.schedule.noRoom', { modality: t(`rad.modality.${study.modality}`) })}
            </Banner>
          )
        }
      </QueryView>
    </div>
  );
}

function ContrastForm({ study, run, busy }) {
  const { t } = useTranslation();
  const [consent, setConsent] = useState(false);
  const [creat, setCreat] = useState('');
  const [reason, setReason] = useState('');
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <h3 className="font-semibold text-ink">{t('rad.contrast.title')}</h3>
      <Checkbox
        checked={consent}
        onChange={(e) => setConsent(e.target.checked)}
        label={t('rad.contrast.consent')}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
        <FormField label={t('rad.contrast.creatinine')}>
          <Input inputMode="decimal" value={creat} onChange={(e) => setCreat(e.target.value)} />
        </FormField>
        <FormField label={t('rad.contrast.reason')} hint={t('rad.contrast.reasonHint')} optional>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </div>
      <div>
        <Button
          variant="secondary"
          loading={busy}
          disabled={!consent || !Number(creat)}
          onClick={() =>
            run(
              {
                id: study.id,
                step: 'contrast',
                consent,
                creatinine: Number(creat),
                overrideReason: reason.trim() || undefined,
              },
              t('rad.contrast.saved'),
            )
          }
        >
          {t('rad.contrast.save')}
        </Button>
      </div>
    </div>
  );
}

function FormF({ study, run, busy }) {
  const { t } = useTranslation();
  const [lmp, setLmp] = useState('');
  const [indication, setIndication] = useState('');
  const [declaration, setDeclaration] = useState(false);
  const [signed, setSigned] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <h3 className="font-semibold text-ink">{t('rad.formF.title')}</h3>
      <p className="text-sm text-muted">{t('rad.formF.hint')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
        <FormField label={t('rad.formF.lmp')}>
          <Input type="date" value={lmp} max={ymdIST()} onChange={(e) => setLmp(e.target.value)} />
        </FormField>
        <FormField label={t('rad.formF.indication')}>
          <Input value={indication} onChange={(e) => setIndication(e.target.value)} />
        </FormField>
      </div>
      <Checkbox
        checked={declaration}
        onChange={(e) => setDeclaration(e.target.checked)}
        label={t('rad.formF.declaration')}
      />
      <Checkbox
        checked={signed}
        onChange={(e) => setSigned(e.target.checked)}
        label={t('rad.formF.patientSigned')}
      />
      <div>
        <Button
          variant="secondary"
          loading={busy}
          disabled={!lmp || indication.trim().length < 3 || !declaration || !signed}
          onClick={() =>
            run(
              {
                id: study.id,
                step: 'form-f',
                lmp,
                indication: indication.trim(),
                declaration,
                patientSigned: signed,
              },
              t('rad.formF.saved'),
            )
          }
        >
          {t('rad.formF.save')}
        </Button>
      </div>
    </div>
  );
}

function ReportEditor({ study, run, busy }) {
  const { t } = useTranslation();
  const master = useRadMasterQuery({ modality: study.modality });
  const template = master.data?.items?.find((d) => d.id === study.defId)?.template;
  const initial = study.report ?? splitTemplate(template);
  const [findings, setFindings] = useState(initial.findings ?? '');
  const [impression, setImpression] = useState(initial.impression ?? '');
  const [critical, setCritical] = useState(study.critical);
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-ink">{t('rad.report.title')}</h3>
        {template && !study.report && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const s = splitTemplate(template);
              setFindings(s.findings);
              setImpression(s.impression);
            }}
          >
            {t('rad.report.useTemplate')}
          </Button>
        )}
      </div>
      <FormField label={t('rad.report.findings')}>
        <Textarea rows={6} value={findings} onChange={(e) => setFindings(e.target.value)} />
      </FormField>
      <FormField label={t('rad.report.impression')}>
        <Textarea rows={2} value={impression} onChange={(e) => setImpression(e.target.value)} />
      </FormField>
      <Checkbox
        checked={critical}
        onChange={(e) => setCritical(e.target.checked)}
        label={t('rad.report.critical')}
      />
      <div>
        <Button
          loading={busy}
          disabled={findings.trim().length < 5 || impression.trim().length < 3}
          onClick={() =>
            run(
              {
                id: study.id,
                step: 'report',
                findings: findings.trim(),
                impression: impression.trim(),
                critical,
              },
              t('rad.report.saved'),
            )
          }
        >
          {t('rad.report.save')}
        </Button>
      </div>
    </div>
  );
}

function StudyDetail({ id }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const can = useCan();
  const q = useRadStudyQuery(id);
  const { run, failure, busy } = useStep();
  const [notes, setNotes] = useState('');
  const [addendum, setAddendum] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  return (
    <QueryView query={q} rows={8}>
      {(s) => {
        const needsContrast = s.contrast && !s.contrastCheck;
        const needsFormF = s.pcpndt && s.patient.gender === 'F' && !s.formF;
        return (
          <Card>
            <div className="flex flex-col gap-4">
              <PatientBanner
                name={s.patient.name}
                age={s.patient.age}
                sex={s.patient.gender}
                uhid={s.patient.uhid}
                bed={s.location ?? undefined}
                consultant={s.doctor?.name}
              />
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">{s.name}</h2>
                <StatusBadge tone={RAD_TONE[s.status]} label={t(`rad.status.${s.status}`)} />
                {s.priority !== 'ROUTINE' && (
                  <StatusBadge
                    tone={s.priority === 'STAT' ? 'critical' : 'warning'}
                    label={t(`rad.priority.${s.priority}`)}
                  />
                )}
                {s.contrast && <StatusBadge tone="info" label={t('rad.contrastBadge')} />}
                {s.pcpndt && <StatusBadge tone="accent" label="PCPNDT" />}
                {s.critical && <StatusBadge tone="critical" label={t('rad.criticalBadge')} />}
              </div>
              <p className="text-sm text-muted">
                {[
                  s.accessionNo,
                  t(`rad.modality.${s.modality}`),
                  s.room &&
                    s.scheduledAt &&
                    t('rad.at', { room: s.room, time: fmtDateTime(s.scheduledAt, locale) }),
                  s.performedBy &&
                    t('rad.performedBy', {
                      by: s.performedBy,
                      time: fmtTime(s.performedAt, locale),
                    }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {s.clinicalNotes && <p className="text-sm">{s.clinicalNotes}</p>}
              {s.contrastCheck && (
                <p className="text-sm">
                  {t('rad.contrast.done', {
                    creat: s.contrastCheck.creatinine,
                    by: s.contrastCheck.by,
                  })}
                  {s.contrastCheck.overrideReason && ` · ${s.contrastCheck.overrideReason}`}
                </p>
              )}
              {s.formF && (
                <p className="text-sm">
                  {t('rad.formF.done', { weeks: s.formF.weeks, by: s.formF.by })}
                </p>
              )}
              <ApiErrorNotice error={failure} />

              {['ORDERED', 'SCHEDULED'].includes(s.status) && can('rad:study:schedule') && (
                <>
                  <div className="flex flex-wrap items-end gap-2">
                    <Button
                      onClick={() => run({ id: s.id, step: 'arrive' }, t('rad.arrived'))}
                      loading={busy}
                    >
                      {t('rad.arrive')}
                    </Button>
                    <FormField label={t('rad.cancelReason')} className="w-64">
                      <Input
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                      />
                    </FormField>
                    <Button
                      variant="ghost"
                      disabled={cancelReason.trim().length < 3}
                      onClick={() =>
                        run(
                          { id: s.id, step: 'cancel', reason: cancelReason.trim() },
                          t('rad.cancelled'),
                        )
                      }
                    >
                      {t('rad.cancel')}
                    </Button>
                  </div>
                  <SchedulePicker study={s} run={run} busy={busy} />
                </>
              )}
              {s.status === 'ARRIVED' && can('rad:study:perform') && (
                <>
                  {needsContrast && <ContrastForm study={s} run={run} busy={busy} />}
                  {needsFormF && <FormF study={s} run={run} busy={busy} />}
                  <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                    <FormField label={t('rad.techNotes')} optional className="min-w-64 flex-1">
                      <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </FormField>
                    <Button
                      loading={busy}
                      disabled={needsContrast || needsFormF}
                      onClick={() =>
                        run(
                          { id: s.id, step: 'perform', techNotes: notes.trim() || undefined },
                          t('rad.performed'),
                        )
                      }
                    >
                      {t('rad.perform')}
                    </Button>
                  </div>
                </>
              )}
              {['PERFORMED', 'REPORTED'].includes(s.status) && can('rad:report:write') && (
                <ReportEditor key={s.report?.draftAt ?? 'new'} study={s} run={run} busy={busy} />
              )}
              {s.status === 'REPORTED' && can('rad:report:sign') && (
                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                  <Button
                    loading={busy}
                    onClick={() => run({ id: s.id, step: 'sign' }, t('rad.signed'))}
                  >
                    {t('rad.sign')}
                  </Button>
                  <span className="text-sm text-muted">
                    {t('rad.signHint', { by: s.report?.draftBy })}
                  </span>
                </div>
              )}
              {s.status === 'SIGNED' && (
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-sm whitespace-pre-line">{s.report?.findings}</p>
                    <p className="mt-2 font-semibold">{s.report?.impression}</p>
                    <p className="mt-2 text-sm text-muted">
                      {t('rad.signedBy', {
                        by: s.signedBy,
                        time: fmtDateTime(s.signedAt, locale),
                        draft: s.report?.draftBy,
                      })}
                    </p>
                  </div>
                  {s.addenda.map((a) => (
                    <p key={a.at} className="border-l-2 border-line-strong pl-2 text-sm">
                      {a.text} <span className="text-muted">· {a.by}</span>
                    </p>
                  ))}
                  {s.viewerUrl && (
                    <a
                      className="text-sm font-semibold text-primary underline"
                      href={s.viewerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('rad.viewImages')}
                    </a>
                  )}
                  {can('rad:report:sign') && (
                    <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                      <FormField label={t('rad.addendum')} className="min-w-64 flex-1">
                        <Input value={addendum} onChange={(e) => setAddendum(e.target.value)} />
                      </FormField>
                      <Button
                        variant="secondary"
                        disabled={addendum.trim().length < 3}
                        onClick={async () => {
                          if (
                            await run(
                              { id: s.id, step: 'addenda', text: addendum.trim() },
                              t('rad.addendumSaved'),
                            )
                          )
                            setAddendum('');
                        }}
                      >
                        {t('rad.addAddendum')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        );
      }}
    </QueryView>
  );
}

function StageList({ stage, modality }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const [id, setId] = useUrlState('id', '');
  const list = useRadStudiesQuery({ stage, modality: modality || undefined });
  const items = list.data?.items ?? [];
  const current = items.some((x) => x.id === id) ? id : (items[0]?.id ?? '');
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
      <Card title={t(`rad.stage.${stage}`)}>
        <QueryView
          query={list}
          empty={<EmptyState bordered={false} title={t('rad.none')} />}
          isEmpty={(d) => !d.items.length}
        >
          {(d) => (
            <PickList
              label={t(`rad.stage.${stage}`)}
              selectedId={current}
              onPick={(v) => setId(v)}
              items={d.items.map((x) => ({
                id: x.id,
                lead: x.scheduledAt
                  ? fmtTime(x.scheduledAt, locale)
                  : t(`rad.modality.${x.modality}`),
                title: `${x.name} · ${x.patient.name}`,
                sub: [x.location, x.accessionNo].filter(Boolean).join(' · '),
                badge:
                  x.priority !== 'ROUTINE'
                    ? {
                        tone: x.priority === 'STAT' ? 'critical' : 'warning',
                        label: t(`rad.priority.${x.priority}`),
                      }
                    : { tone: RAD_TONE[x.status], label: t(`rad.status.${x.status}`) },
              }))}
            />
          )}
        </QueryView>
      </Card>
      {current ? <StudyDetail key={current} id={current} /> : <EmptyState title={t('rad.pick')} />}
    </div>
  );
}

function FormFTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const [month, setMonth] = useUrlState('month', ymdIST().slice(0, 7));
  const q = useFormFRegisterQuery({ month });
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('rad.formF.month')} className="w-48">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </FormField>
      <QueryView
        query={q}
        empty={<EmptyState bordered={false} title={t('rad.formF.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">{t('rad.formF.register')}</caption>
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  {['date', 'accession', 'patient', 'lmp', 'weeks', 'indication', 'doctor'].map(
                    (k) => (
                      <th key={k} className="px-3 py-2 font-semibold">
                        {t(`rad.formF.col.${k}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((r) => (
                  <tr key={r.accessionNo}>
                    <td className="px-3 py-2">{fmtDate(r.at, locale)}</td>
                    <td className="px-3 py-2 font-mono">{r.accessionNo}</td>
                    <td className="px-3 py-2">
                      {r.patient.name} <span className="text-muted">· {r.patient.age}</span>
                    </td>
                    <td className="px-3 py-2">{fmtDate(r.lmp, locale)}</td>
                    <td className="tabular px-3 py-2">{r.weeks}</td>
                    <td className="px-3 py-2">{r.indication}</td>
                    <td className="px-3 py-2 text-muted">{r.doctor ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
    </div>
  );
}

/**
 * Radiology (board Radiology, route /radiology): studies to schedule (slot booking with the
 * preparation SMS), today's list (arrival, contrast consent and creatinine, PCPNDT Form F,
 * performed), reporting from templates, sign-off by another radiologist, signed reports with
 * addenda and the PACS link, and the Form F register.
 */
export default function RadiologyPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addRadStrings);
  const { t } = useTranslation();
  const can = useCan();
  const [modality, setModality] = useUrlState('modality', '');
  const counts = useRadCountsQuery().data;
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('rad.crumb') }, { label: t('rad.title') }]}
        title={t('rad.title')}
        description={t('rad.description')}
      />
      <FormField label={t('rad.filter.modality')} className="w-56">
        <Select
          value={modality}
          placeholder={t('rad.filter.all')}
          onChange={(e) => setModality(e.target.value)}
          options={MODALITIES.map((m) => ({ value: m, label: t(`rad.modality.${m}`) }))}
        />
      </FormField>
      <UrlTabs
        param="stage"
        label={t('rad.tabsLabel')}
        reset={['month']}
        tabs={[
          ...STAGES.map((s) => ({
            id: s,
            label: t(`rad.stage.${s}`),
            count: s === 'signed' ? undefined : counts?.[s],
            body: <StageList stage={s} modality={modality} />,
          })),
          (can('rad:pcpndt:read') || can('rad:study:perform')) && {
            id: 'formf',
            label: t('rad.stage.formf'),
            body: <FormFTab />,
          },
        ]}
      />
    </Page>
  );
}
