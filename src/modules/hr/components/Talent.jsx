import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  FormField,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { paiseFrom } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, localeOf } from '../../dx-kit/format.js';
import { useTalentQuery, useTalentWriteMutation } from '../api.js';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const csv = (v) =>
  String(v ?? '')
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const STAGE_TONE = {
  APPLIED: 'neutral',
  SCREENED: 'info',
  INTERVIEW: 'info',
  OFFERED: 'warning',
  JOINED: 'success',
  REJECTED: 'critical',
};
const OPEN_TONE = { OPEN: 'success', ON_HOLD: 'warning', CLOSED: 'neutral' };

// ---------------------------------------------------------------- recruitment

export function RecruitmentTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const edit = can('hr:recruitment:update');
  const [openingId, setOpeningId] = useUrlState('opening', '');
  const q = useTalentQuery({ path: '/hr/openings' });
  const [write] = useTalentWriteMutation();
  const [adding, setAdding] = useState(false);
  const items = q.data?.items ?? [];
  const current = items.find((o) => o.id === openingId) ?? items[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">{t('hr.tal.rec.hint')}</p>
        {can('hr:recruitment:create') && (
          <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setAdding(true)}>
            {t('hr.tal.rec.newOpening')}
          </Button>
        )}
      </div>
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('hr.tal.tabs.recruitment')}
              data={d.items}
              empty={t('hr.tal.rec.none')}
              columns={[
                {
                  id: 'title',
                  header: t('hr.tal.rec.title'),
                  cell: ({ row }) => (
                    <button
                      type="button"
                      className="text-left font-semibold text-primary underline"
                      onClick={() => setOpeningId(row.original.id)}
                    >
                      {row.original.title}
                    </button>
                  ),
                },
                {
                  id: 'dept',
                  header: t('hr.tal.rec.department'),
                  cell: ({ row }) => row.original.department ?? '',
                },
                {
                  id: 'pos',
                  header: t('hr.tal.rec.positions'),
                  cell: ({ row }) => row.original.positions,
                },
                {
                  id: 'pipe',
                  header: t('hr.tal.rec.pipeline'),
                  cell: ({ row }) =>
                    ['APPLIED', 'SCREENED', 'INTERVIEW', 'OFFERED', 'JOINED']
                      .filter((s) => row.original.pipeline[s])
                      .map((s) => `${t(`hr.tal.rec.stage.${s}`)} ${row.original.pipeline[s]}`)
                      .join(' · '),
                },
                {
                  id: 'status',
                  header: t('hr.tal.rec.statusLabel'),
                  cell: ({ row }) => (
                    <StatusBadge
                      tone={OPEN_TONE[row.original.status]}
                      label={t(`hr.tal.rec.status.${row.original.status}`)}
                    />
                  ),
                },
                edit && {
                  id: 'act',
                  header: '',
                  cell: ({ row }) => {
                    const o = row.original;
                    const to =
                      o.status === 'OPEN' ? 'ON_HOLD' : o.status === 'ON_HOLD' ? 'OPEN' : null;
                    return to ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          write({
                            method: 'PUT',
                            path: `/hr/openings/${o.id}`,
                            body: { version: o.version, status: to },
                          })
                        }
                      >
                        {to === 'ON_HOLD' ? t('hr.tal.rec.hold') : t('hr.tal.rec.reopen')}
                      </Button>
                    ) : null;
                  },
                },
              ].filter(Boolean)}
            />
          </Card>
        )}
      </QueryView>
      {current && <Candidates key={current.id} opening={current} />}
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title={t('hr.tal.rec.newOpening')}
        schema={z.object({
          title: z.string().trim().min(3),
          positions: z.coerce.number().int().min(1).max(100),
          type: z.enum(['PERMANENT', 'CONTRACT', 'CONSULTANT', 'TRAINEE']),
          description: z.string().max(1000).optional(),
        })}
        defaultValues={{ title: '', positions: '1', type: 'PERMANENT', description: '' }}
        fields={[
          { name: 'title', label: t('hr.tal.rec.title'), required: true },
          { name: 'positions', label: t('hr.tal.rec.positions'), type: 'number' },
          {
            name: 'type',
            label: t('hr.tal.rec.type'),
            type: 'select',
            options: ['PERMANENT', 'CONTRACT', 'CONSULTANT', 'TRAINEE'].map((x) => ({
              value: x,
              label: t(`hr.tal.rec.types.${x}`),
            })),
          },
          {
            name: 'description',
            label: t('hr.tal.rec.description'),
            type: 'textarea',
            optional: true,
          },
        ]}
        submitLabel={t('hr.tal.save')}
        onSubmit={(v) =>
          write({
            path: '/hr/openings',
            body: { ...v, positions: Number(v.positions), description: v.description || undefined },
          }).unwrap()
        }
        onDone={(o) => {
          setOpeningId(o.id);
          toast({ tone: 'success', title: t('hr.tal.saved') });
        }}
      />
    </div>
  );
}

function Candidates({ opening }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const edit = can('hr:recruitment:update');
  const q = useTalentQuery({ path: `/hr/openings/${opening.id}/candidates` });
  const [write] = useTalentWriteMutation();
  const [adding, setAdding] = useState(false);
  const [act, setAct] = useState(null); // { c, kind }
  const kinds = {
    APPLIED: ['SCREENED', 'REJECTED'],
    SCREENED: ['INTERVIEW', 'REJECTED'],
    INTERVIEW: ['INTERVIEW', 'OFFERED', 'REJECTED'],
    OFFERED: ['HIRE', 'REJECTED'],
  };
  const actLabel = {
    SCREENED: 'screen',
    INTERVIEW: 'interview',
    OFFERED: 'offer',
    REJECTED: 'reject',
    HIRE: 'hire',
  };
  const dialog =
    act &&
    {
      INTERVIEW: {
        schema: z.object({
          rating: z.coerce.number().int().min(1).max(5),
          notes: z.string().max(1000).optional(),
        }),
        defaults: { rating: '3', notes: '' },
        fields: [
          { name: 'rating', label: t('hr.tal.rec.rating'), type: 'number' },
          { name: 'notes', label: t('hr.tal.rec.notes'), type: 'textarea', optional: true },
        ],
        body: (v) => ({
          stage: 'INTERVIEW',
          interview: { rating: Number(v.rating), notes: v.notes || undefined },
        }),
      },
      OFFERED: {
        schema: z.object({
          ctc: z.string().refine((x) => (paiseFrom(x) ?? 0) > 0, t('hr.tal.rec.ctcError')),
          joinOn: z.string().min(10),
        }),
        defaults: { ctc: '', joinOn: istToday() },
        fields: [
          { name: 'ctc', label: t('hr.tal.rec.ctc'), required: true },
          { name: 'joinOn', label: t('hr.tal.rec.joinOn'), type: 'date' },
        ],
        body: (v) => ({ stage: 'OFFERED', offer: { ctc: paiseFrom(v.ctc), joinOn: v.joinOn } }),
      },
      HIRE: {
        schema: z.object({
          gender: z.enum(['M', 'F', 'O']),
          designation: z.string().max(60).optional(),
        }),
        defaults: { gender: 'F', designation: opening.title },
        fields: [
          {
            name: 'gender',
            label: t('hr.tal.rec.gender'),
            type: 'select',
            options: ['F', 'M', 'O'].map((g) => ({
              value: g,
              label: t(`hr.tal.rec.genders.${g}`),
            })),
          },
          { name: 'designation', label: t('hr.tal.rec.designation'), optional: true },
        ],
      },
      SCREENED: {
        schema: z.object({ note: z.string().max(500).optional() }),
        defaults: { note: '' },
        fields: [{ name: 'note', label: t('hr.tal.rec.notes'), optional: true }],
        body: (v) => ({ stage: 'SCREENED', note: v.note || undefined }),
      },
      REJECTED: {
        schema: z.object({ note: z.string().max(500).optional() }),
        defaults: { note: '' },
        fields: [{ name: 'note', label: t('hr.tal.rec.reason'), optional: true }],
        body: (v) => ({ stage: 'REJECTED', note: v.note || undefined }),
      },
    }[act.kind];
  return (
    <Card
      title={t('hr.tal.rec.candidates', { title: opening.title })}
      actions={
        can('hr:recruitment:create') &&
        opening.status === 'OPEN' && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            {t('hr.tal.rec.addCandidate')}
          </Button>
        )
      }
      padding={false}
    >
      <QueryView query={q} rows={3}>
        {(d) => (
          <DataTable
            caption={t('hr.tal.rec.candidates', { title: opening.title })}
            data={d.items}
            empty={t('hr.tal.rec.noCandidates')}
            columns={[
              { id: 'name', header: t('hr.tal.rec.name'), cell: ({ row }) => row.original.name },
              {
                id: 'mobile',
                header: t('hr.tal.rec.mobile'),
                cell: ({ row }) => row.original.mobile ?? '',
              },
              {
                id: 'source',
                header: t('hr.tal.rec.source'),
                cell: ({ row }) => row.original.source ?? '',
              },
              {
                id: 'rating',
                header: t('hr.tal.rec.ratingShort'),
                cell: ({ row }) => row.original.interviews.map((i) => i.rating).join(', '),
              },
              {
                id: 'stage',
                header: t('hr.tal.rec.stageLabel'),
                cell: ({ row }) => (
                  <StatusBadge
                    tone={STAGE_TONE[row.original.stage]}
                    label={t(`hr.tal.rec.stage.${row.original.stage}`)}
                  />
                ),
              },
              edit && {
                id: 'act',
                header: '',
                cell: ({ row }) => (
                  <div className="flex flex-wrap gap-1">
                    {(kinds[row.original.stage] ?? []).map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={k === 'REJECTED' ? 'ghost' : 'secondary'}
                        onClick={() => setAct({ c: row.original, kind: k })}
                      >
                        {t(`hr.tal.rec.${actLabel[k]}`)}
                      </Button>
                    ))}
                  </div>
                ),
              },
            ].filter(Boolean)}
          />
        )}
      </QueryView>
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title={t('hr.tal.rec.addCandidate')}
        schema={z.object({
          name: z.string().trim().min(2),
          mobile: z
            .string()
            .regex(/^([6-9]\d{9})?$/, t('hr.tal.rec.mobileError'))
            .optional(),
          email: z.union([z.literal(''), z.email()]).optional(),
          source: z.string().max(40).optional(),
        })}
        defaultValues={{ name: '', mobile: '', email: '', source: '' }}
        fields={[
          { name: 'name', label: t('hr.tal.rec.name'), required: true },
          { name: 'mobile', label: t('hr.tal.rec.mobile'), optional: true },
          { name: 'email', label: t('hr.tal.rec.email'), optional: true },
          { name: 'source', label: t('hr.tal.rec.source'), optional: true },
        ]}
        submitLabel={t('hr.tal.save')}
        onSubmit={(v) =>
          write({
            path: `/hr/openings/${opening.id}/candidates`,
            body: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '')),
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('hr.tal.saved') })}
      />
      {dialog && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setAct(null)}
          title={`${t(`hr.tal.rec.${actLabel[act.kind]}`)} · ${act.c.name}`}
          schema={dialog.schema}
          defaultValues={dialog.defaults}
          fields={dialog.fields}
          submitLabel={t(`hr.tal.rec.${actLabel[act.kind]}`)}
          onSubmit={(v) =>
            act.kind === 'HIRE'
              ? write({
                  path: `/hr/candidates/${act.c.id}/hire`,
                  body: {
                    version: act.c.version,
                    gender: v.gender,
                    designation: v.designation || undefined,
                  },
                }).unwrap()
              : write({
                  path: `/hr/candidates/${act.c.id}/move`,
                  body: { version: act.c.version, ...dialog.body(v) },
                }).unwrap()
          }
          onDone={(r) =>
            toast({
              tone: 'success',
              title: r?.employee
                ? t('hr.tal.rec.hired', { name: r.employee.name, empNo: r.employee.empNo })
                : t('hr.tal.saved'),
            })
          }
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- training

const COMPLY_TONE = { NEVER: 'critical', LAPSED: 'critical', DUE: 'warning' };

export function TrainingTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const sessions = useTalentQuery({ path: '/hr/training' });
  const comp = useTalentQuery({ path: '/hr/training/compliance' });
  const [write] = useTalentWriteMutation();
  const [adding, setAdding] = useState(false);
  const topic = (x) => t(`hr.tal.trn.topics.${x}`, { defaultValue: x });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">{t('hr.tal.trn.hint')}</p>
        {can('hr:training:create') && (
          <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setAdding(true)}>
            {t('hr.tal.trn.add')}
          </Button>
        )}
      </div>
      <QueryView query={comp} rows={3}>
        {(d) => (
          <>
            <KpiRow
              items={d.topics.map((x) => ({
                label: topic(x.topic),
                value: `${x.percent}%`,
                sub: t('hr.tal.trn.compliant', { done: x.compliant, total: x.total }),
                tone: x.percent < 90 ? 'warning' : undefined,
              }))}
            />
            <Card title={t('hr.tal.trn.gaps')} padding={false}>
              <DataTable
                caption={t('hr.tal.trn.gaps')}
                data={d.gaps.map((g) => ({ ...g, id: `${g.employeeId}-${g.topic}` }))}
                empty={t('hr.tal.trn.noGaps')}
                columns={[
                  {
                    id: 'emp',
                    header: t('hr.tal.trn.employee'),
                    cell: ({ row }) => `${row.original.name} · ${row.original.empNo}`,
                  },
                  {
                    id: 'dept',
                    header: t('hr.tal.rec.department'),
                    cell: ({ row }) => row.original.department ?? '',
                  },
                  {
                    id: 'topic',
                    header: t('hr.tal.trn.topic'),
                    cell: ({ row }) => topic(row.original.topic),
                  },
                  {
                    id: 'last',
                    header: t('hr.tal.trn.last'),
                    cell: ({ row }) =>
                      row.original.lastOn ? fmtDate(row.original.lastOn, locale) : '',
                  },
                  {
                    id: 'status',
                    header: t('hr.tal.trn.statusLabel'),
                    cell: ({ row }) => (
                      <StatusBadge
                        tone={COMPLY_TONE[row.original.status]}
                        label={t(`hr.tal.trn.status.${row.original.status}`)}
                      />
                    ),
                  },
                ]}
              />
            </Card>
          </>
        )}
      </QueryView>
      <Card title={t('hr.tal.trn.sessions')} padding={false}>
        <QueryView query={sessions} rows={3}>
          {(d) => (
            <DataTable
              caption={t('hr.tal.trn.sessions')}
              data={d.items}
              empty={t('hr.tal.none')}
              columns={[
                {
                  id: 'date',
                  header: t('hr.tal.trn.date'),
                  cell: ({ row }) => fmtDate(row.original.date, locale),
                },
                {
                  id: 'title',
                  header: t('hr.tal.trn.title'),
                  cell: ({ row }) => row.original.title,
                },
                {
                  id: 'topic',
                  header: t('hr.tal.trn.topic'),
                  cell: ({ row }) => (
                    <span>
                      {topic(row.original.topic)}
                      {row.original.mandatory && (
                        <StatusBadge
                          className="ml-2"
                          tone="info"
                          label={t('hr.tal.trn.mandatory')}
                        />
                      )}
                    </span>
                  ),
                },
                {
                  id: 'trainer',
                  header: t('hr.tal.trn.trainer'),
                  cell: ({ row }) => row.original.trainer ?? '',
                },
                {
                  id: 'att',
                  header: t('hr.tal.trn.attendees'),
                  cell: ({ row }) => row.original.attendees.filter((a) => a.attended).length,
                },
              ]}
            />
          )}
        </QueryView>
      </Card>
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title={t('hr.tal.trn.add')}
        schema={z.object({
          title: z.string().trim().min(3),
          topic: z.string().trim().min(2),
          date: z.string().min(10),
          hours: z.string().optional(),
          trainer: z.string().max(80).optional(),
          empNos: z.string().optional(),
        })}
        defaultValues={{
          title: '',
          topic: 'BLS',
          date: istToday(),
          hours: '',
          trainer: '',
          empNos: '',
        }}
        fields={[
          { name: 'title', label: t('hr.tal.trn.title'), required: true, span: 2 },
          {
            name: 'topic',
            label: t('hr.tal.trn.topic'),
            type: 'select',
            options: [
              ...['BLS', 'FIRE', 'INFECTION', 'BMW'].map((x) => ({ value: x, label: topic(x) })),
              { value: 'OTHER', label: t('hr.tal.trn.other') },
            ],
          },
          { name: 'date', label: t('hr.tal.trn.date'), type: 'date' },
          { name: 'hours', label: t('hr.tal.trn.hours'), type: 'number', optional: true },
          { name: 'trainer', label: t('hr.tal.trn.trainer'), optional: true },
          { name: 'empNos', label: t('hr.tal.trn.empNos'), type: 'textarea', optional: true },
        ]}
        submitLabel={t('hr.tal.save')}
        onSubmit={(v) =>
          write({
            path: '/hr/training',
            body: {
              title: v.title,
              topic: v.topic,
              date: v.date,
              hours: v.hours ? Number(v.hours) : undefined,
              trainer: v.trainer || undefined,
              empNos: csv(v.empNos),
            },
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('hr.tal.trn.recorded') })}
      />
    </div>
  );
}

// ---------------------------------------------------------------- appraisal

const APR_TONE = { SELF: 'neutral', MANAGER: 'info', HR: 'warning', DONE: 'success' };

/** Goals as "title, weight" lines. */
const parseGoals = (text) =>
  csvLines(text).map((l) => {
    const i = l.lastIndexOf(',');
    return { title: l.slice(0, i).trim(), weight: Number(l.slice(i + 1)) };
  });
const csvLines = (text) =>
  String(text ?? '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

export function AppraisalTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const cycles = useTalentQuery({ path: '/hr/appraisal-cycles' });
  const [cycleId, setCycleId] = useUrlState('cycle', '');
  const [opening, setOpening] = useState(false);
  const [write] = useTalentWriteMutation();
  const [failure, setFailure] = useState(null);
  const list = cycles.data?.items ?? [];
  const cycle = list.find((c) => c.id === cycleId) ?? list[0];
  const total = cycle ? Object.values(cycle.progress).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-muted">{t('hr.tal.apr.hint')}</p>
        <div className="flex flex-wrap items-end gap-2">
          {list.length > 1 && (
            <FormField label={t('hr.tal.apr.cycle')} className="w-48">
              <Select
                value={cycle?.id}
                onChange={(e) => setCycleId(e.target.value)}
                options={list.map((c) => ({ value: c.id, label: c.name }))}
              />
            </FormField>
          )}
          {can('hr:appraisal:create') && !list.some((c) => c.status === 'OPEN') && (
            <Button onClick={() => setOpening(true)}>{t('hr.tal.apr.open')}</Button>
          )}
          {can('hr:appraisal:update') && cycle?.status === 'OPEN' && (
            <Button
              variant="secondary"
              disabled={cycle.progress.DONE !== total}
              onClick={async () => {
                setFailure(null);
                try {
                  await write({
                    path: `/hr/appraisal-cycles/${cycle.id}/close`,
                    body: { version: cycle.version },
                  }).unwrap();
                  toast({ tone: 'success', title: t('hr.tal.apr.closed') });
                } catch (e) {
                  setFailure(e);
                }
              }}
            >
              {t('hr.tal.apr.close')}
            </Button>
          )}
        </div>
      </div>
      <ApiErrorNotice error={failure} />
      <QueryView query={cycles} rows={3}>
        {() =>
          cycle ? (
            <>
              <KpiRow
                items={['SELF', 'MANAGER', 'HR', 'DONE'].map((s) => ({
                  label: t(`hr.tal.apr.status.${s}`),
                  value: String(cycle.progress[s]),
                }))}
              />
              <CycleAppraisals key={cycle.id} cycle={cycle} />
            </>
          ) : (
            <EmptyState title={t('hr.tal.apr.none')} />
          )
        }
      </QueryView>
      <FormDialog
        open={opening}
        onOpenChange={setOpening}
        title={t('hr.tal.apr.open')}
        description={t('hr.tal.apr.goalsHint')}
        schema={z.object({
          name: z.string().trim().min(3),
          from: z.string().min(10),
          to: z.string().min(10),
          goals: z
            .string()
            .refine(
              (g) =>
                parseGoals(g).length > 0 &&
                parseGoals(g).every((x) => x.title && x.weight > 0) &&
                parseGoals(g).reduce((a, x) => a + x.weight, 0) === 100,
              t('hr.tal.apr.goalsError'),
            ),
        })}
        defaultValues={{ name: '', from: '', to: '', goals: t('hr.tal.apr.goalsDefault') }}
        fields={[
          { name: 'name', label: t('hr.tal.apr.name'), required: true, span: 2 },
          { name: 'from', label: t('hr.tal.apr.from'), type: 'date' },
          { name: 'to', label: t('hr.tal.apr.to'), type: 'date' },
          { name: 'goals', label: t('hr.tal.apr.goals'), type: 'textarea' },
        ]}
        submitLabel={t('hr.tal.apr.open')}
        onSubmit={(v) =>
          write({
            path: '/hr/appraisal-cycles',
            body: { name: v.name, from: v.from, to: v.to, goals: parseGoals(v.goals) },
          }).unwrap()
        }
        onDone={(c) => {
          setCycleId(c.id);
          toast({ tone: 'success', title: t('hr.tal.apr.opened') });
        }}
      />
    </div>
  );
}

function CycleAppraisals({ cycle }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const [status, setStatus] = useUrlState('st', '');
  const q = useTalentQuery({
    path: `/hr/appraisal-cycles/${cycle.id}/appraisals`,
    params: { status },
  });
  const [write] = useTalentWriteMutation();
  const [finalising, setFinalising] = useState(null);
  return (
    <Card padding={false}>
      <div className="p-4">
        <FormField label={t('hr.tal.apr.show')} className="w-48">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: '', label: t('hr.tal.apr.all') },
              ...['SELF', 'MANAGER', 'HR', 'DONE'].map((s) => ({
                value: s,
                label: t(`hr.tal.apr.status.${s}`),
              })),
            ]}
          />
        </FormField>
      </div>
      <QueryView query={q} rows={4}>
        {(d) => (
          <DataTable
            caption={cycle.name}
            data={d.items}
            empty={t('hr.tal.none')}
            columns={[
              {
                id: 'emp',
                header: t('hr.tal.apr.employee'),
                cell: ({ row }) => `${row.original.name} · ${row.original.empNo ?? ''}`,
              },
              {
                id: 'mgr',
                header: t('hr.tal.apr.manager'),
                cell: ({ row }) => row.original.managerName ?? '',
              },
              {
                id: 'self',
                header: t('hr.tal.apr.self'),
                cell: ({ row }) => row.original.selfRating ?? '',
              },
              {
                id: 'm',
                header: t('hr.tal.apr.mgr'),
                cell: ({ row }) => row.original.managerRating ?? '',
              },
              {
                id: 'final',
                header: t('hr.tal.apr.final'),
                cell: ({ row }) => row.original.finalRating ?? '',
              },
              {
                id: 'status',
                header: t('hr.tal.apr.statusLabel'),
                cell: ({ row }) => (
                  <StatusBadge
                    tone={APR_TONE[row.original.status]}
                    label={t(`hr.tal.apr.status.${row.original.status}`)}
                  />
                ),
              },
              can('hr:appraisal:update') && {
                id: 'act',
                header: '',
                cell: ({ row }) =>
                  row.original.status === 'HR' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setFinalising(row.original)}
                    >
                      {t('hr.tal.apr.finalise')}
                    </Button>
                  ) : null,
              },
            ].filter(Boolean)}
          />
        )}
      </QueryView>
      <FormDialog
        open={Boolean(finalising)}
        onOpenChange={(o) => !o && setFinalising(null)}
        title={finalising ? t('hr.tal.apr.finalTitle', { name: finalising.name }) : ''}
        description={
          finalising
            ? [
                finalising.selfComments && `${t('hr.tal.apr.self')}: ${finalising.selfComments}`,
                finalising.managerComments &&
                  `${t('hr.tal.apr.mgr')}: ${finalising.managerComments}`,
              ]
                .filter(Boolean)
                .join(' · ')
            : ''
        }
        schema={z.object({ finalRating: z.coerce.number().min(1).max(5) })}
        defaultValues={{
          finalRating: String(finalising?.managerRating ?? finalising?.selfRating ?? 3),
        }}
        fields={[{ name: 'finalRating', label: t('hr.tal.apr.finalRating'), type: 'number' }]}
        submitLabel={t('hr.tal.apr.finalise')}
        onSubmit={(v) =>
          write({
            path: `/hr/appraisals/${finalising.id}/final`,
            body: { version: finalising.version, finalRating: Number(v.finalRating) },
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('hr.tal.saved') })}
      />
    </Card>
  );
}

// ---------------------------------------------------------------- exits

export function ExitsTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const q = useTalentQuery({ path: '/hr/exits' });
  const [write] = useTalentWriteMutation();
  const [failure, setFailure] = useState(null);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{t('hr.tal.exit.hint')}</p>
      <ApiErrorNotice error={failure} />
      <QueryView query={q} rows={3}>
        {(d) =>
          d.items.length ? (
            d.items.map((e) => (
              <Card
                key={e.id}
                title={`${e.name} · ${e.empNo}`}
                description={[
                  e.designation,
                  e.department,
                  e.exitOn && t('hr.tal.exit.lastDay', { date: fmtDate(e.exitOn, locale) }),
                  e.exitReason,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                actions={
                  e.cleared ? (
                    <StatusBadge tone="success" label={t('hr.tal.exit.cleared')} />
                  ) : (
                    <StatusBadge tone="warning" label={t(`hr.tal.exit.status.${e.status}`)} />
                  )
                }
              >
                <ul className="grid gap-2 sm:grid-cols-5">
                  {e.clearance.map((c) => (
                    <li
                      key={c.dept}
                      className="flex flex-col gap-1 rounded-control border border-line p-2"
                    >
                      <span className="text-sm font-semibold text-ink">
                        {t(`hr.tal.exit.depts.${c.dept}`)}
                      </span>
                      {c.at ? (
                        <span className="text-sm text-muted">
                          {t('hr.tal.exit.by', { by: c.by, date: fmtDate(c.at, locale) })}
                        </span>
                      ) : can('hr:employee:update') ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            setFailure(null);
                            try {
                              await write({
                                path: `/hr/exits/${e.id}/clear`,
                                body: { version: e.version, dept: c.dept },
                              }).unwrap();
                              toast({
                                tone: 'success',
                                title: t('hr.tal.exit.clearedToast', {
                                  dept: t(`hr.tal.exit.depts.${c.dept}`),
                                }),
                              });
                            } catch (err) {
                              setFailure(err);
                            }
                          }}
                        >
                          {t('hr.tal.exit.clear')}
                        </Button>
                      ) : (
                        <span className="text-sm text-muted">{t('hr.tal.exit.pending')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ))
          ) : (
            <EmptyState title={t('hr.tal.exit.none')} />
          )
        }
      </QueryView>
    </div>
  );
}

// ---------------------------------------------------------------- my appraisal (My Space)

export function MyAppraisalTab() {
  const { t } = useTranslation();
  const q = useTalentQuery({ path: '/me/appraisal' });
  return (
    <QueryView query={q} rows={4}>
      {(d) =>
        !d.cycle ? (
          <EmptyState title={t('me.apr.none')} />
        ) : (
          <div className="flex flex-col gap-4">
            {d.appraisal && <ReviewCard a={d.appraisal} cycle={d.cycle} mode="self" />}
            {d.team.length > 0 && (
              <>
                <h2 className="text-lg font-semibold text-ink">{t('me.apr.team')}</h2>
                {d.team.map((a) => (
                  <ReviewCard key={a.id} a={a} cycle={d.cycle} mode="manager" />
                ))}
              </>
            )}
          </div>
        )
      }
    </QueryView>
  );
}

function ReviewCard({ a, cycle, mode }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [write, state] = useTalentWriteMutation();
  const key = mode === 'self' ? 'self' : 'manager';
  const open = mode === 'self' ? a.status === 'SELF' : a.status === 'MANAGER';
  const [ratings, setRatings] = useState(
    a.goals.map((g) => (g[key] != null ? String(g[key]) : '')),
  );
  const [comments, setComments] = useState('');
  const [failure, setFailure] = useState(null);
  const title =
    mode === 'self'
      ? t('me.apr.mine', { cycle: cycle.name })
      : t('me.apr.reviewTitle', { name: a.name });
  return (
    <Card
      title={title}
      description={open ? t('me.apr.scale') : undefined}
      actions={
        !open && (
          <StatusBadge
            tone={APR_TONE[a.status]}
            label={t(`me.apr.waiting.${a.status}`, {
              defaultValue: t(`hr.tal.apr.status.${a.status}`),
            })}
          />
        )
      }
    >
      <div className="flex flex-col gap-3">
        {mode === 'manager' && a.selfRating != null && (
          <p className="text-muted">
            {t('me.apr.selfShort', { r: a.selfRating })}
            {a.selfComments ? ` · ${a.selfComments}` : ''}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {a.goals.map((g, i) => (
            <li key={g.title} className="grid items-center gap-2 sm:grid-cols-[1fr_6rem_10rem]">
              <span className="text-ink">{g.title}</span>
              <span className="text-sm text-muted">{t('me.apr.weight', { w: g.weight })}</span>
              {open ? (
                <Select
                  aria-label={t('me.apr.rateGoal', { goal: g.title })}
                  value={ratings[i]}
                  placeholder={t('me.apr.rate')}
                  onChange={(e) =>
                    setRatings(ratings.map((r, j) => (j === i ? e.target.value : r)))
                  }
                  options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                />
              ) : (
                <span className="text-ink">{g[key] ?? ''}</span>
              )}
            </li>
          ))}
        </ul>
        {open ? (
          <>
            <FormField label={t('me.apr.comments')}>
              <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} />
            </FormField>
            <ApiErrorNotice error={failure} />
            <div>
              <Button
                loading={state.isLoading}
                disabled={ratings.some((r) => !r)}
                onClick={async () => {
                  setFailure(null);
                  try {
                    await write({
                      path: `/me/appraisal/${a.id}/${mode}`,
                      body: {
                        version: a.version,
                        ratings: ratings.map(Number),
                        comments: comments.trim() || undefined,
                      },
                    }).unwrap();
                    toast({ tone: 'success', title: t('me.apr.submitted') });
                  } catch (e) {
                    setFailure(e);
                  }
                }}
              >
                {t('me.apr.submit')}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-muted">
            {[
              a.selfRating != null && t('me.apr.selfShort', { r: a.selfRating }),
              a.managerRating != null && t('me.apr.managerShort', { r: a.managerRating }),
              a.finalRating != null && t('me.apr.finalShort', { r: a.finalRating }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>
    </Card>
  );
}
