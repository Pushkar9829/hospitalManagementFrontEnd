import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  DataTable,
  FormField,
  Input,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { paiseFrom, rupeesText } from '../../../lib/money.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, fmtDateTime, localeOf } from '../../dx-kit/format.js';
import {
  useLabRegisterQuery,
  useLabRegisterWriteMutation,
  useLabSettingsQuery,
  useSaveLabSettingsMutation,
} from '../api.js';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const in6Weeks = () => new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10);
const csv = (v) =>
  String(v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

/**
 * A register as a table with add and edit through one dialog. `toBody(values)` shapes the form
 * values for the API; `fromRow(row)` fills the dialog when editing.
 */
function RegisterTab({
  path,
  hint,
  caption,
  columns,
  fields,
  schema,
  blank,
  toBody = clean,
  fromRow = (r) => r,
  write,
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const edit = can(write);
  const q = useLabRegisterQuery({ path });
  const [save] = useLabRegisterWriteMutation();
  const [editing, setEditing] = useState(null); // {} for new, a row to edit
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">{hint}</p>
        {edit && (
          <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setEditing({})}>
            {t('lab.reg.add')}
          </Button>
        )}
      </div>
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={caption}
              data={d.items}
              empty={t('lab.reg.none')}
              columns={[
                ...columns,
                edit && {
                  id: 'edit',
                  header: '',
                  cell: ({ row }) => (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(row.original)}>
                      {t('lab.reg.edit')}
                    </Button>
                  ),
                },
              ].filter(Boolean)}
            />
          </Card>
        )}
      </QueryView>
      <FormDialog
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        title={caption}
        schema={schema}
        defaultValues={editing?.id ? { ...blank, ...fromRow(editing) } : blank}
        fields={fields}
        submitLabel={t('lab.reg.save')}
        onSubmit={(v) =>
          editing?.id
            ? save({
                method: 'PUT',
                path: `${path}/${editing.id}`,
                body: { ...toBody(v), version: editing.version },
              }).unwrap()
            : save({ path, body: toBody(v) }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('lab.reg.saved') })}
      />
    </div>
  );
}

const expiryBadge = (t, expiresOn, active = true) => {
  if (!active) return <StatusBadge tone="neutral" label={t('lab.reg.inactive')} />;
  if (expiresOn < istToday()) return <StatusBadge tone="critical" label={t('lab.reg.expired')} />;
  if (expiresOn <= in6Weeks())
    return <StatusBadge tone="warning" label={t('lab.reg.expiresSoon')} />;
  return <StatusBadge tone="success" label={t('lab.reg.active')} />;
};

// ---------------------------------------------------------------- QC

export function LotsTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  return (
    <RegisterTab
      path="qc/lots"
      write="lab:qc:create"
      caption={t('lab.reg.tabs.lots')}
      hint={t('lab.reg.lot.hint')}
      blank={{
        lotNo: '',
        material: '',
        level: '',
        analyser: '',
        openedOn: '',
        expiresOn: '',
        active: true,
      }}
      schema={z.object({
        lotNo: z.string().trim().min(2),
        material: z.string().trim().min(2),
        level: z.string().optional(),
        analyser: z.string().optional(),
        openedOn: z.string().optional(),
        expiresOn: z.string().min(10),
        active: z.boolean(),
      })}
      fields={[
        { name: 'lotNo', label: t('lab.reg.lot.lotNo'), required: true, mono: true },
        { name: 'material', label: t('lab.reg.lot.material'), required: true },
        { name: 'level', label: t('lab.reg.lot.level'), optional: true },
        { name: 'analyser', label: t('lab.reg.lot.analyser'), optional: true },
        { name: 'openedOn', label: t('lab.reg.lot.openedOn'), type: 'date', optional: true },
        { name: 'expiresOn', label: t('lab.reg.lot.expiresOn'), type: 'date', required: true },
        { name: 'active', label: t('lab.reg.active'), type: 'checkbox' },
      ]}
      columns={[
        {
          id: 'lot',
          header: t('lab.reg.lot.lotNo'),
          cell: ({ row }) => <span className="font-mono">{row.original.lotNo}</span>,
        },
        {
          id: 'material',
          header: t('lab.reg.lot.material'),
          cell: ({ row }) => row.original.material,
        },
        {
          id: 'level',
          header: t('lab.reg.lot.level'),
          cell: ({ row }) => row.original.level ?? '',
        },
        {
          id: 'analyser',
          header: t('lab.reg.lot.analyser'),
          cell: ({ row }) => row.original.analyser ?? '',
        },
        {
          id: 'opened',
          header: t('lab.reg.lot.openedOn'),
          cell: ({ row }) => (row.original.openedOn ? fmtDate(row.original.openedOn, locale) : ''),
        },
        {
          id: 'expires',
          header: t('lab.reg.lot.expiresOn'),
          cell: ({ row }) => fmtDate(row.original.expiresOn, locale),
        },
        {
          id: 'status',
          header: t('lab.reg.lot.status'),
          cell: ({ row }) => expiryBadge(t, row.original.expiresOn, row.original.active),
        },
      ]}
    />
  );
}

export function EqasTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const tone = { DUE: 'warning', SUBMITTED: 'info', REVIEWED: 'success' };
  return (
    <RegisterTab
      path="qc/eqas"
      write="lab:qc:create"
      caption={t('lab.reg.tabs.eqas')}
      hint={t('lab.reg.eqas.hint')}
      blank={{
        scheme: '',
        cycle: '',
        department: '',
        dueOn: '',
        analytes: '',
        acceptable: '',
        status: 'DUE',
      }}
      schema={z.object({
        scheme: z.string().trim().min(3),
        cycle: z.string().trim().min(2),
        department: z.string().optional(),
        dueOn: z.string().optional(),
        analytes: z.coerce.number().int().min(0).optional(),
        acceptable: z.coerce.number().int().min(0).optional(),
        status: z.enum(['DUE', 'SUBMITTED', 'REVIEWED']),
      })}
      fields={[
        { name: 'scheme', label: t('lab.reg.eqas.scheme'), required: true, span: 2 },
        { name: 'cycle', label: t('lab.reg.eqas.cycle'), required: true },
        { name: 'department', label: t('lab.reg.eqas.department'), optional: true },
        { name: 'dueOn', label: t('lab.reg.eqas.dueOn'), type: 'date', optional: true },
        { name: 'analytes', label: t('lab.reg.eqas.analytes'), type: 'number', optional: true },
        { name: 'acceptable', label: t('lab.reg.eqas.acceptable'), type: 'number', optional: true },
        {
          name: 'status',
          label: t('lab.reg.eqas.statusLabel'),
          type: 'select',
          options: ['DUE', 'SUBMITTED', 'REVIEWED'].map((s) => ({
            value: s,
            label: t(`lab.reg.eqas.status.${s}`),
          })),
        },
      ]}
      toBody={(v) =>
        clean({
          ...v,
          analytes: v.analytes === '' ? undefined : v.analytes,
          acceptable: v.acceptable === '' ? undefined : v.acceptable,
        })
      }
      columns={[
        { id: 'scheme', header: t('lab.reg.eqas.scheme'), cell: ({ row }) => row.original.scheme },
        { id: 'cycle', header: t('lab.reg.eqas.cycle'), cell: ({ row }) => row.original.cycle },
        {
          id: 'result',
          header: t('lab.reg.eqas.acceptable'),
          cell: ({ row }) =>
            row.original.analytes
              ? `${row.original.acceptable ?? 0} / ${row.original.analytes} (${Math.round(((row.original.acceptable ?? 0) * 100) / row.original.analytes)}%)`
              : '',
        },
        {
          id: 'due',
          header: t('lab.reg.eqas.dueOn'),
          cell: ({ row }) => (row.original.dueOn ? fmtDate(row.original.dueOn, locale) : ''),
        },
        {
          id: 'status',
          header: t('lab.reg.eqas.statusLabel'),
          cell: ({ row }) => (
            <StatusBadge
              tone={tone[row.original.status]}
              label={t(`lab.reg.eqas.status.${row.original.status}`)}
            />
          ),
        },
      ]}
    />
  );
}

export function MaintenanceTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  return (
    <RegisterTab
      path="qc/maintenance"
      write="lab:qc:create"
      caption={t('lab.reg.tabs.maintenance')}
      hint={t('lab.reg.mnt.hint')}
      blank={{
        equipment: '',
        activity: '',
        kind: 'MAINTENANCE',
        doneOn: istToday(),
        doneBy: '',
        nextDue: '',
      }}
      schema={z.object({
        equipment: z.string().trim().min(2),
        activity: z.string().trim().min(3),
        kind: z.enum(['CALIBRATION', 'MAINTENANCE']),
        doneOn: z.string().min(10),
        doneBy: z.string().optional(),
        nextDue: z.string().optional(),
      })}
      fields={[
        { name: 'equipment', label: t('lab.reg.mnt.equipment'), required: true },
        {
          name: 'kind',
          label: t('lab.reg.mnt.kindLabel'),
          type: 'select',
          options: ['CALIBRATION', 'MAINTENANCE'].map((k) => ({
            value: k,
            label: t(`lab.reg.mnt.kind.${k}`),
          })),
        },
        { name: 'activity', label: t('lab.reg.mnt.activity'), required: true, span: 2 },
        { name: 'doneOn', label: t('lab.reg.mnt.doneOn'), type: 'date', required: true },
        { name: 'doneBy', label: t('lab.reg.mnt.doneBy'), optional: true },
        { name: 'nextDue', label: t('lab.reg.mnt.nextDue'), type: 'date', optional: true },
      ]}
      columns={[
        {
          id: 'equipment',
          header: t('lab.reg.mnt.equipment'),
          cell: ({ row }) => row.original.equipment,
        },
        {
          id: 'activity',
          header: t('lab.reg.mnt.activity'),
          cell: ({ row }) => row.original.activity,
        },
        {
          id: 'kind',
          header: t('lab.reg.mnt.kindLabel'),
          cell: ({ row }) => t(`lab.reg.mnt.kind.${row.original.kind}`),
        },
        {
          id: 'done',
          header: t('lab.reg.mnt.doneOn'),
          cell: ({ row }) => fmtDate(row.original.doneOn, locale),
        },
        { id: 'by', header: t('lab.reg.mnt.doneBy'), cell: ({ row }) => row.original.doneBy ?? '' },
        {
          id: 'next',
          header: t('lab.reg.mnt.nextDue'),
          cell: ({ row }) =>
            row.original.nextDue ? (
              row.original.nextDue < istToday() ? (
                <StatusBadge
                  tone="critical"
                  label={`${t('lab.reg.overdue')} · ${fmtDate(row.original.nextDue, locale)}`}
                />
              ) : (
                fmtDate(row.original.nextDue, locale)
              )
            ) : (
              ''
            ),
        },
      ]}
    />
  );
}

const RULES = ['1-2s', '1-3s', '2-2s', 'R-4s'];

/** Westgard rules per analyser, kept in the lab settings. */
export function QcRulesTab() {
  const { t } = useTranslation();
  const q = useLabSettingsQuery();
  return (
    <QueryView query={q} rows={3}>
      {(s) => <QcRulesForm key={s.version} settings={s} t={t} />}
    </QueryView>
  );
}

function QcRulesForm({ settings, t }) {
  const { toast } = useToast();
  const can = useCan();
  const edit = can('lab:settings:update');
  const [rows, setRows] = useState(settings.qcRules ?? []);
  const [save, saving] = useSaveLabSettingsMutation();
  const [failure, setFailure] = useState(null);
  const set = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Card title={t('lab.reg.tabs.rules')} description={t('lab.reg.rules.hint')}>
      <div className="flex flex-col gap-3">
        {!rows.length && <p className="text-muted">{t('lab.reg.rules.none')}</p>}
        {rows.map((r, i) => (
          <fieldset
            key={i}
            className="grid gap-3 rounded-control border border-line p-3 sm:grid-cols-4"
          >
            <FormField label={t('lab.reg.rules.analyser')}>
              <Input
                value={r.analyser}
                onChange={(e) => set(i, { analyser: e.target.value })}
                disabled={!edit}
              />
            </FormField>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-semibold text-ink">{t('lab.reg.rules.reject')}</span>
              <div className="flex flex-wrap gap-3">
                {RULES.map((rule) => (
                  <Checkbox
                    key={rule}
                    label={rule}
                    disabled={!edit}
                    checked={(r.reject ?? []).includes(rule)}
                    onChange={(e) =>
                      set(i, {
                        reject: e.target.checked
                          ? [...(r.reject ?? []), rule]
                          : (r.reject ?? []).filter((x) => x !== rule),
                      })
                    }
                  />
                ))}
              </div>
            </div>
            <FormField label={t('lab.reg.rules.frequency')}>
              <Input
                value={r.frequency ?? ''}
                onChange={(e) => set(i, { frequency: e.target.value })}
                disabled={!edit}
              />
            </FormField>
          </fieldset>
        ))}
        <ApiErrorNotice error={failure} />
        {edit && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() =>
                setRows([...rows, { analyser: '', reject: ['1-3s', '2-2s'], frequency: '' }])
              }
            >
              {t('lab.reg.rules.add')}
            </Button>
            <Button
              loading={saving.isLoading}
              onClick={async () => {
                setFailure(null);
                try {
                  await save({
                    version: settings.version,
                    qcRules: rows
                      .filter((r) => r.analyser.trim())
                      .map((r) =>
                        clean({
                          analyser: r.analyser.trim(),
                          reject: r.reject,
                          frequency: r.frequency?.trim(),
                        }),
                      ),
                  }).unwrap();
                  toast({ tone: 'success', title: t('lab.reg.saved') });
                } catch (e) {
                  setFailure(e);
                }
              }}
            >
              {t('lab.reg.save')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- settings

export function PartnersTab() {
  const { t } = useTranslation();
  return (
    <RegisterTab
      path="partners"
      write="lab:settings:update"
      caption={t('lab.reg.tabs.partners')}
      hint={t('lab.reg.partner.hint')}
      blank={{
        code: '',
        name: '',
        nabl: false,
        contact: '',
        phone: '',
        tatHours: '',
        tests: '',
        active: true,
      }}
      schema={z.object({
        code: z.string().trim().min(2),
        name: z.string().trim().min(2),
        nabl: z.boolean(),
        contact: z.string().optional(),
        phone: z.string().optional(),
        tatHours: z.coerce.number().int().min(1).optional(),
        tests: z.string().optional(),
        active: z.boolean(),
      })}
      fields={[
        { name: 'code', label: t('lab.reg.partner.code'), required: true, mono: true },
        { name: 'name', label: t('lab.reg.partner.name'), required: true },
        { name: 'contact', label: t('lab.reg.partner.contact'), optional: true },
        { name: 'phone', label: t('lab.reg.partner.phone'), optional: true },
        { name: 'tatHours', label: t('lab.reg.partner.tat'), type: 'number', optional: true },
        { name: 'tests', label: t('lab.reg.partner.tests'), optional: true },
        { name: 'nabl', label: t('lab.reg.partner.nabl'), type: 'checkbox' },
        { name: 'active', label: t('lab.reg.active'), type: 'checkbox' },
      ]}
      fromRow={(r) => ({ ...r, tests: (r.tests ?? []).join(', '), tatHours: r.tatHours ?? '' })}
      toBody={(v) =>
        clean({ ...v, tatHours: v.tatHours === '' ? undefined : v.tatHours, tests: csv(v.tests) })
      }
      columns={[
        {
          id: 'code',
          header: t('lab.reg.partner.code'),
          cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
        },
        { id: 'name', header: t('lab.reg.partner.name'), cell: ({ row }) => row.original.name },
        {
          id: 'nabl',
          header: t('lab.reg.partner.nabl'),
          cell: ({ row }) => (row.original.nabl ? t('lab.reg.yes') : t('lab.reg.no')),
        },
        {
          id: 'tat',
          header: t('lab.reg.partner.tat'),
          cell: ({ row }) => row.original.tatHours ?? '',
        },
        {
          id: 'tests',
          header: t('lab.reg.partner.tests'),
          cell: ({ row }) => (row.original.tests ?? []).join(', '),
        },
      ]}
    />
  );
}

/** Home collection fee, slots and areas, and the report header, footer and signatories. */
export function LabSettingsExtra({ section }) {
  const { t } = useTranslation();
  const q = useLabSettingsQuery();
  return (
    <QueryView query={q} rows={3}>
      {(s) => <SettingsExtraForm key={s.version} settings={s} section={section} t={t} />}
    </QueryView>
  );
}

function SettingsExtraForm({ settings, section, t }) {
  const { toast } = useToast();
  const can = useCan();
  const edit = can('lab:settings:update');
  const [save, saving] = useSaveLabSettingsMutation();
  const [failure, setFailure] = useState(null);
  const [home, setHome] = useState({
    fee: rupeesText(settings.homeCollection?.fee ?? 0),
    slots: (settings.homeCollection?.slots ?? []).join(', '),
    areas: (settings.homeCollection?.areas ?? []).join(', '),
  });
  const [report, setReport] = useState({
    header: settings.report?.header ?? '',
    footer: settings.report?.footer ?? '',
    signatories: settings.report?.signatories ?? [],
  });
  const submit = async () => {
    setFailure(null);
    try {
      await save({
        version: settings.version,
        ...(section === 'home'
          ? {
              homeCollection: {
                fee: paiseFrom(home.fee) ?? 0,
                slots: csv(home.slots),
                areas: csv(home.areas),
              },
            }
          : {
              report: {
                header: report.header,
                footer: report.footer,
                signatories: report.signatories.filter((x) => x.name.trim()).map((x) => clean(x)),
              },
            }),
      }).unwrap();
      toast({ tone: 'success', title: t('lab.reg.saved') });
    } catch (e) {
      setFailure(e);
    }
  };
  return (
    <Card
      title={section === 'home' ? t('lab.reg.tabs.home') : t('lab.reg.tabs.report')}
      description={section === 'home' ? t('lab.reg.home.hint') : t('lab.reg.report.hint')}
    >
      <div className="flex max-w-2xl flex-col gap-3">
        {section === 'home' ? (
          <>
            <FormField label={t('lab.reg.home.fee')}>
              <Input
                inputMode="decimal"
                value={home.fee}
                onChange={(e) => setHome({ ...home, fee: e.target.value })}
                disabled={!edit}
              />
            </FormField>
            <FormField label={t('lab.reg.home.slots')}>
              <Input
                value={home.slots}
                onChange={(e) => setHome({ ...home, slots: e.target.value })}
                disabled={!edit}
              />
            </FormField>
            <FormField label={t('lab.reg.home.areas')}>
              <Input
                value={home.areas}
                onChange={(e) => setHome({ ...home, areas: e.target.value })}
                disabled={!edit}
              />
            </FormField>
          </>
        ) : (
          <>
            <FormField label={t('lab.reg.report.header')}>
              <Input
                value={report.header}
                onChange={(e) => setReport({ ...report, header: e.target.value })}
                disabled={!edit}
              />
            </FormField>
            <FormField label={t('lab.reg.report.footer')}>
              <Input
                value={report.footer}
                onChange={(e) => setReport({ ...report, footer: e.target.value })}
                disabled={!edit}
              />
            </FormField>
            <p className="text-sm font-semibold text-ink">{t('lab.reg.report.signatories')}</p>
            {report.signatories.map((x, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-3">
                {['department', 'name', 'qualification'].map((k) => (
                  <FormField key={k} label={t(`lab.reg.report.${k}`)}>
                    <Input
                      value={x[k] ?? ''}
                      disabled={!edit}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          signatories: report.signatories.map((y, j) =>
                            j === i ? { ...y, [k]: e.target.value } : y,
                          ),
                        })
                      }
                    />
                  </FormField>
                ))}
              </div>
            ))}
            {edit && (
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={16} aria-hidden="true" />}
                  onClick={() =>
                    setReport({
                      ...report,
                      signatories: [
                        ...report.signatories,
                        { department: '', name: '', qualification: '' },
                      ],
                    })
                  }
                >
                  {t('lab.reg.report.addSignatory')}
                </Button>
              </div>
            )}
          </>
        )}
        <ApiErrorNotice error={failure} />
        {edit && (
          <div>
            <Button loading={saving.isLoading} onClick={submit}>
              {t('lab.reg.save')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- microbiology

export function MediaTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const tone = { PASS: 'success', FAIL: 'critical', PENDING: 'warning' };
  return (
    <RegisterTab
      path="micro/media"
      write="lab:micro:update"
      caption={t('lab.reg.tabs.media')}
      hint={t('lab.reg.media.hint')}
      blank={{
        medium: '',
        lotNo: '',
        qcStrain: '',
        result: 'PENDING',
        testedOn: '',
        expiresOn: '',
      }}
      schema={z.object({
        medium: z.string().trim().min(2),
        lotNo: z.string().trim().min(2),
        qcStrain: z.string().optional(),
        result: z.enum(['PASS', 'FAIL', 'PENDING']),
        testedOn: z.string().optional(),
        expiresOn: z.string().min(10),
      })}
      fields={[
        { name: 'medium', label: t('lab.reg.media.medium'), required: true },
        { name: 'lotNo', label: t('lab.reg.media.lotNo'), required: true, mono: true },
        { name: 'qcStrain', label: t('lab.reg.media.strain'), optional: true, span: 2 },
        {
          name: 'result',
          label: t('lab.reg.media.resultLabel'),
          type: 'select',
          options: ['PENDING', 'PASS', 'FAIL'].map((r) => ({
            value: r,
            label: t(`lab.reg.media.result.${r}`),
          })),
        },
        { name: 'testedOn', label: t('lab.reg.media.testedOn'), type: 'date', optional: true },
        { name: 'expiresOn', label: t('lab.reg.media.expiresOn'), type: 'date', required: true },
      ]}
      columns={[
        { id: 'medium', header: t('lab.reg.media.medium'), cell: ({ row }) => row.original.medium },
        {
          id: 'lot',
          header: t('lab.reg.media.lotNo'),
          cell: ({ row }) => <span className="font-mono">{row.original.lotNo}</span>,
        },
        {
          id: 'strain',
          header: t('lab.reg.media.strain'),
          cell: ({ row }) => row.original.qcStrain ?? '',
        },
        {
          id: 'result',
          header: t('lab.reg.media.resultLabel'),
          cell: ({ row }) => (
            <StatusBadge
              tone={tone[row.original.result]}
              label={t(`lab.reg.media.result.${row.original.result}`)}
            />
          ),
        },
        {
          id: 'expires',
          header: t('lab.reg.media.expiresOn'),
          cell: ({ row }) => expiryBadge(t, row.original.expiresOn),
        },
        { id: 'expDate', header: '', cell: ({ row }) => fmtDate(row.original.expiresOn, locale) },
      ]}
    />
  );
}

const ALERT_TONE = {
  MRSA: 'critical',
  VRE: 'critical',
  CRE: 'critical',
  CRAB: 'critical',
  ESBL: 'warning',
};

export function AlertsTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const q = useLabRegisterQuery({ path: 'micro/alerts' });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('lab.reg.alerts.hint')}</p>
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('lab.reg.tabs.alerts')}
              data={d.items}
              empty={t('lab.reg.none')}
              columns={[
                {
                  id: 'alert',
                  header: t('lab.reg.alerts.alert'),
                  cell: ({ row }) => (
                    <StatusBadge tone={ALERT_TONE[row.original.alert]} label={row.original.alert} />
                  ),
                },
                {
                  id: 'patient',
                  header: t('lab.reg.alerts.patient'),
                  cell: ({ row }) => row.original.patient,
                },
                {
                  id: 'location',
                  header: t('lab.reg.alerts.location'),
                  cell: ({ row }) => row.original.location ?? '',
                },
                {
                  id: 'specimen',
                  header: t('lab.reg.alerts.specimen'),
                  cell: ({ row }) => row.original.specimen ?? '',
                },
                {
                  id: 'organism',
                  header: t('lab.reg.alerts.organism'),
                  cell: ({ row }) => <em>{row.original.organism}</em>,
                },
                {
                  id: 'at',
                  header: t('lab.reg.alerts.at'),
                  cell: ({ row }) =>
                    `${fmtDateTime(row.original.at, locale)}${row.original.final ? '' : ` · ${t('lab.reg.alerts.prelim')}`}`,
                },
              ]}
            />
          </Card>
        )}
      </QueryView>
    </div>
  );
}

// ---------------------------------------------------------------- sample receipt

export function RejectionsTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const [date, setDate] = useState(istToday());
  const q = useLabRegisterQuery({ path: 'samples-rejected', params: { date } });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('lab.reg.rej.hint')}</p>
      <FormField label={t('lab.reg.rej.day')} className="max-w-xs">
        <Input
          type="date"
          value={date}
          max={istToday()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </FormField>
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('lab.reg.tabs.rejections')}
              data={d.items.map((x) => ({ ...x, id: x.sampleNo }))}
              empty={t('lab.reg.none')}
              columns={[
                {
                  id: 'sample',
                  header: t('lab.reg.rej.sample'),
                  cell: ({ row }) => <span className="font-mono">{row.original.sampleNo}</span>,
                },
                {
                  id: 'patient',
                  header: t('lab.reg.rej.patient'),
                  cell: ({ row }) => row.original.patient,
                },
                {
                  id: 'source',
                  header: t('lab.reg.rej.source'),
                  cell: ({ row }) => row.original.location ?? '',
                },
                {
                  id: 'reason',
                  header: t('lab.reg.rej.reason'),
                  cell: ({ row }) =>
                    t(`lab.reject.${row.original.reason}`, { defaultValue: row.original.reason }),
                },
                {
                  id: 'at',
                  header: t('lab.reg.rej.at'),
                  cell: ({ row }) => fmtDateTime(row.original.at, locale),
                },
              ]}
            />
          </Card>
        )}
      </QueryView>
    </div>
  );
}

export function SendOutsTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const edit = can('lab:sample:receive');
  const list = useLabRegisterQuery({ path: 'send-outs' });
  const partners = useLabRegisterQuery({ path: 'partners' });
  const [write] = useLabRegisterWriteMutation();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">{t('lab.reg.so.hint')}</p>
        {edit && <Button onClick={() => setOpen(true)}>{t('lab.reg.so.new')}</Button>}
      </div>
      <QueryView query={list} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('lab.reg.tabs.sendouts')}
              data={d.items}
              empty={t('lab.reg.none')}
              columns={[
                {
                  id: 'no',
                  header: t('lab.reg.so.manifest'),
                  cell: ({ row }) => <span className="font-mono">{row.original.manifestNo}</span>,
                },
                {
                  id: 'partner',
                  header: t('lab.reg.so.partner'),
                  cell: ({ row }) => row.original.partnerName,
                },
                {
                  id: 'samples',
                  header: t('lab.reg.so.samples'),
                  cell: ({ row }) => row.original.samples.map((s) => s.sampleNo).join(', '),
                },
                {
                  id: 'sent',
                  header: t('lab.reg.so.sent'),
                  cell: ({ row }) => fmtDateTime(row.original.sentAt, locale),
                },
                {
                  id: 'status',
                  header: t('lab.reg.so.statusLabel'),
                  cell: ({ row }) => (
                    <StatusBadge
                      tone={row.original.status === 'SENT' ? 'info' : 'success'}
                      label={t(`lab.reg.so.status.${row.original.status}`)}
                    />
                  ),
                },
                edit && {
                  id: 'act',
                  header: '',
                  cell: ({ row }) =>
                    row.original.status === 'SENT' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await write({
                            path: `send-outs/${row.original.id}/received`,
                            body: { version: row.original.version },
                          }).unwrap();
                          toast({ tone: 'success', title: t('lab.reg.so.received') });
                        }}
                      >
                        {t('lab.reg.so.received')}
                      </Button>
                    ) : null,
                },
              ].filter(Boolean)}
            />
          </Card>
        )}
      </QueryView>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={t('lab.reg.so.new')}
        schema={z.object({
          partnerId: z.string().min(1),
          sampleNos: z.string().trim().min(3),
          courier: z.string().optional(),
        })}
        defaultValues={{ partnerId: '', sampleNos: '', courier: '' }}
        fields={[
          {
            name: 'partnerId',
            label: t('lab.reg.so.partner'),
            type: 'select',
            options: [
              { value: '', label: '' },
              ...(partners.data?.items ?? [])
                .filter((p) => p.active)
                .map((p) => ({ value: p.id, label: p.name })),
            ],
          },
          {
            name: 'sampleNos',
            label: t('lab.reg.so.samples'),
            required: true,
            mono: true,
            span: 2,
          },
          { name: 'courier', label: t('lab.reg.so.courier'), optional: true },
        ]}
        submitLabel={t('lab.reg.so.new')}
        onSubmit={(v) =>
          write({
            path: 'send-outs',
            body: {
              partnerId: v.partnerId,
              sampleNos: csv(v.sampleNos).map((x) => x.toUpperCase()),
              courier: v.courier || undefined,
            },
          }).unwrap()
        }
        onDone={(m) =>
          toast({ tone: 'success', title: t('lab.reg.so.created', { no: m.manifestNo }) })
        }
      />
    </div>
  );
}

export function StorageTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const edit = can('lab:sample:receive');
  const q = useLabRegisterQuery({ path: 'storage' });
  const [write] = useLabRegisterWriteMutation();
  const [form, setForm] = useState({ sampleNo: '', location: '', days: '7' });
  const [failure, setFailure] = useState(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('lab.reg.store.hint')}</p>
      {edit && (
        <Card title={t('lab.reg.store.new')}>
          <div className="flex flex-wrap items-end gap-3">
            <FormField label={t('lab.reg.store.sampleNo')}>
              <Input
                className="font-mono"
                value={form.sampleNo}
                onChange={(e) => setForm({ ...form, sampleNo: e.target.value })}
              />
            </FormField>
            <FormField label={t('lab.reg.store.location')}>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </FormField>
            <FormField label={t('lab.reg.store.days')} className="w-32">
              <Input
                inputMode="numeric"
                value={form.days}
                onChange={(e) => setForm({ ...form, days: e.target.value })}
              />
            </FormField>
            <Button
              disabled={
                !form.sampleNo.trim() || form.location.trim().length < 2 || !(Number(form.days) > 0)
              }
              onClick={async () => {
                setFailure(null);
                try {
                  const no = form.sampleNo.trim().toUpperCase();
                  await write({
                    path: `storage/${no}`,
                    body: { location: form.location.trim(), days: Number(form.days) },
                  }).unwrap();
                  toast({ tone: 'success', title: t('lab.reg.store.stored', { no }) });
                  setForm({ ...form, sampleNo: '' });
                } catch (e) {
                  setFailure(e);
                }
              }}
            >
              {t('lab.reg.store.new')}
            </Button>
            <ApiErrorNotice error={failure} className="w-full" />
          </div>
        </Card>
      )}
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            {d.items.some((x) => x.due) && (
              <Banner tone="warning" className="m-4">
                {t('lab.reg.store.due')}
              </Banner>
            )}
            <DataTable
              caption={t('lab.reg.tabs.storage')}
              data={d.items.map((x) => ({ ...x, id: x.sampleNo }))}
              empty={t('lab.reg.none')}
              columns={[
                {
                  id: 'sample',
                  header: t('lab.reg.store.sample'),
                  cell: ({ row }) => <span className="font-mono">{row.original.sampleNo}</span>,
                },
                {
                  id: 'patient',
                  header: t('lab.reg.store.patient'),
                  cell: ({ row }) => row.original.patient,
                },
                {
                  id: 'type',
                  header: t('lab.reg.store.type'),
                  cell: ({ row }) => row.original.sampleType ?? '',
                },
                {
                  id: 'loc',
                  header: t('lab.reg.store.location'),
                  cell: ({ row }) => row.original.location,
                },
                {
                  id: 'until',
                  header: t('lab.reg.store.until'),
                  cell: ({ row }) =>
                    row.original.due ? (
                      <StatusBadge tone="warning" label={fmtDate(row.original.until, locale)} />
                    ) : (
                      fmtDate(row.original.until, locale)
                    ),
                },
                edit && {
                  id: 'act',
                  header: '',
                  cell: ({ row }) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await write({ path: `storage/${row.original.sampleNo}/discard` }).unwrap();
                        toast({
                          tone: 'success',
                          title: t('lab.reg.store.discarded', { no: row.original.sampleNo }),
                        });
                      }}
                    >
                      {t('lab.reg.store.discard')}
                    </Button>
                  ),
                },
              ].filter(Boolean)}
            />
          </Card>
        )}
      </QueryView>
    </div>
  );
}

// ---------------------------------------------------------------- histopathology

export function StainsTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const q = useLabRegisterQuery({ path: 'histo/stains' });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('lab.reg.stain.hint')}</p>
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('lab.reg.tabs.stains')}
              data={d.items}
              empty={t('lab.reg.none')}
              columns={[
                {
                  id: 'case',
                  header: t('lab.reg.stain.case'),
                  cell: ({ row }) => <span className="font-mono">{row.original.caseNo}</span>,
                },
                {
                  id: 'patient',
                  header: t('lab.reg.stain.patient'),
                  cell: ({ row }) => row.original.patient,
                },
                {
                  id: 'specimen',
                  header: t('lab.reg.stain.specimen'),
                  cell: ({ row }) => row.original.specimen ?? '',
                },
                {
                  id: 'stains',
                  header: t('lab.reg.stain.stains'),
                  cell: ({ row }) => row.original.stains.join(', '),
                },
                {
                  id: 'ordered',
                  header: t('lab.reg.stain.ordered'),
                  cell: ({ row }) => fmtDate(row.original.orderedAt, locale),
                },
                {
                  id: 'done',
                  header: t('common.status'),
                  cell: ({ row }) => (
                    <StatusBadge
                      tone={row.original.done ? 'success' : 'warning'}
                      label={
                        row.original.done ? t('lab.reg.stain.done') : t('lab.reg.stain.pending')
                      }
                    />
                  ),
                },
              ]}
            />
          </Card>
        )}
      </QueryView>
    </div>
  );
}

export function ArchiveTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const edit = can('lab:histo:update');
  const q = useLabRegisterQuery({ path: 'histo/archive' });
  const [write] = useLabRegisterWriteMutation();
  const [issuing, setIssuing] = useState(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('lab.reg.arc.hint')}</p>
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('lab.reg.tabs.archive')}
              data={d.items}
              empty={t('lab.reg.none')}
              columns={[
                {
                  id: 'case',
                  header: t('lab.reg.arc.case'),
                  cell: ({ row }) => <span className="font-mono">{row.original.caseNo}</span>,
                },
                {
                  id: 'patient',
                  header: t('lab.reg.arc.patient'),
                  cell: ({ row }) => row.original.patient,
                },
                {
                  id: 'blocks',
                  header: t('lab.reg.arc.blocks'),
                  cell: ({ row }) => row.original.blocks,
                },
                {
                  id: 'slides',
                  header: t('lab.reg.arc.slides'),
                  cell: ({ row }) => row.original.slides,
                },
                {
                  id: 'loc',
                  header: t('lab.reg.arc.location'),
                  cell: ({ row }) => row.original.location,
                },
                {
                  id: 'issued',
                  header: t('lab.reg.arc.issuedTo'),
                  cell: ({ row }) =>
                    row.original.issuedTo ? (
                      <StatusBadge tone="info" label={row.original.issuedTo} />
                    ) : (
                      <span className="text-muted">{t('lab.reg.arc.inArchive')}</span>
                    ),
                },
                edit && {
                  id: 'act',
                  header: '',
                  cell: ({ row }) =>
                    row.original.issuedTo ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await write({ path: `histo/archive/${row.original.id}/return` }).unwrap();
                          toast({ tone: 'success', title: t('lab.reg.arc.returned') });
                        }}
                      >
                        {t('lab.reg.arc.return')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setIssuing(row.original)}>
                        {t('lab.reg.arc.issue')}
                      </Button>
                    ),
                },
              ].filter(Boolean)}
            />
          </Card>
        )}
      </QueryView>
      <FormDialog
        open={Boolean(issuing)}
        onOpenChange={(o) => !o && setIssuing(null)}
        title={issuing ? t('lab.reg.arc.issueTitle', { no: issuing.caseNo }) : ''}
        schema={z.object({
          to: z.string().trim().min(2).max(120),
          reason: z.string().max(200).optional(),
        })}
        defaultValues={{ to: '', reason: '' }}
        fields={[
          { name: 'to', label: t('lab.reg.arc.to'), required: true },
          { name: 'reason', label: t('lab.reg.arc.reason'), optional: true },
        ]}
        submitLabel={t('lab.reg.arc.issue')}
        onSubmit={(v) =>
          write({ path: `histo/archive/${issuing.id}/issue`, body: clean(v) }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('lab.reg.saved') })}
      />
    </div>
  );
}

export function TurnaroundTab() {
  const { t } = useTranslation();
  const q = useLabRegisterQuery({ path: 'histo/turnaround' });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('lab.reg.tat.hint')}</p>
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card padding={false}>
            <DataTable
              caption={t('lab.reg.tabs.turnaround')}
              data={d.items.map((x) => ({ ...x, id: x.specimen }))}
              empty={t('lab.reg.tat.none')}
              columns={[
                {
                  id: 'specimen',
                  header: t('lab.reg.tat.specimen'),
                  cell: ({ row }) => row.original.specimen,
                },
                {
                  id: 'cases',
                  header: t('lab.reg.tat.cases'),
                  cell: ({ row }) => row.original.cases,
                },
                {
                  id: 'median',
                  header: t('lab.reg.tat.median'),
                  cell: ({ row }) => row.original.medianHours,
                },
                {
                  id: 'within',
                  header: t('lab.reg.tat.within'),
                  cell: ({ row }) => (
                    <StatusBadge
                      tone={row.original.within48h >= 90 ? 'success' : 'warning'}
                      label={`${row.original.within48h}%`}
                    />
                  ),
                },
              ]}
            />
          </Card>
        )}
      </QueryView>
    </div>
  );
}
