import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Banner, Button, Card, StatusBadge, useToast } from '@hms/ui';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { RecordsTable } from '../../dx-kit/RecordsTable.jsx';
import {
  useCreateTemplateMutation,
  useAddTokenSeriesMutation,
  useAddVisitTypeMutation,
  useMessageTemplatesQuery,
  useOpdDepartmentsQuery,
  useOpdTemplatesQuery,
  useSaveMessageTemplateMutation,
  useTokenSeriesQuery,
  useVisitTypesQuery,
} from '../api.js';

const yesNo = (t, on) => (
  <StatusBadge tone={on ? 'success' : 'neutral'} label={on ? t('opd.cfg.yes') : t('opd.cfg.no')} />
);

/** Token series and the TV displays they show on. */
export function TokenSeriesTab({ canEdit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [add] = useAddTokenSeriesMutation();
  const columns = useMemo(
    () => [
      {
        id: 'prefix',
        header: t('opd.cfg.tokens.prefix'),
        cell: ({ row }) => <span className="font-mono font-semibold">{row.original.prefix}</span>,
      },
      {
        id: 'usedFor',
        header: t('opd.cfg.tokens.usedFor'),
        cell: ({ row }) => row.original.usedFor,
      },
      {
        id: 'example',
        header: t('opd.cfg.tokens.example'),
        cell: ({ row }) => <span className="font-mono">{row.original.example}</span>,
      },
      {
        id: 'resets',
        header: t('opd.cfg.tokens.resets'),
        cell: ({ row }) => t(`opd.cfg.tokens.reset.${row.original.resets}`),
      },
      {
        id: 'display',
        header: t('opd.cfg.tokens.display'),
        cell: ({ row }) => row.original.display,
      },
    ],
    [t],
  );
  return (
    <Card
      title={t('opd.cfg.tokens.title')}
      description={t('opd.cfg.tokens.hint')}
      padding={false}
      actions={canEdit && <Button onClick={() => setOpen(true)}>{t('opd.cfg.tokens.add')}</Button>}
    >
      <RecordsTable
        useQuery={useTokenSeriesQuery}
        columns={columns}
        caption={t('opd.cfg.tokens.title')}
        emptyTitle={t('opd.cfg.tokens.empty')}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={t('opd.cfg.tokens.add')}
        schema={z.object({
          prefix: z
            .string()
            .trim()
            .regex(/^[A-Z]{1,3}-$/, t('opd.cfg.errors.prefix')),
          usedFor: z.string().trim().min(2, t('opd.cfg.errors.required')),
          resets: z.enum(['DAILY', 'SESSION', 'NEVER']),
          display: z.string().trim().min(2, t('opd.cfg.errors.required')),
        })}
        defaultValues={{ prefix: '', usedFor: '', resets: 'DAILY', display: '' }}
        fields={[
          {
            name: 'prefix',
            label: t('opd.cfg.tokens.prefix'),
            placeholder: 'V-',
            mono: true,
            required: true,
            hint: t('opd.cfg.tokens.prefixHint'),
          },
          { name: 'usedFor', label: t('opd.cfg.tokens.usedFor'), required: true },
          {
            name: 'resets',
            label: t('opd.cfg.tokens.resets'),
            type: 'select',
            options: ['DAILY', 'SESSION', 'NEVER'].map((r) => ({
              value: r,
              label: t(`opd.cfg.tokens.reset.${r}`),
            })),
          },
          { name: 'display', label: t('opd.cfg.tokens.display'), required: true },
        ]}
        submitLabel={t('opd.cfg.tokens.add')}
        onSubmit={(v) => add(v).unwrap()}
        onDone={(s) =>
          toast({ tone: 'success', title: t('opd.cfg.tokens.added', { prefix: s.prefix }) })
        }
      />
    </Card>
  );
}

/** Patient messages: when each goes out, on which channels and languages; on or off. */
export function MessagesTab({ canEdit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [save] = useSaveMessageTemplateMutation();
  const columns = useMemo(
    () => [
      {
        id: 'code',
        header: t('opd.cfg.msg.message'),
        cell: ({ row }) => t(`opd.cfg.msg.codes.${row.original.code}`),
      },
      {
        id: 'when',
        header: t('opd.cfg.msg.when'),
        cell: ({ row }) => t(`opd.cfg.msg.whens.${row.original.when}`),
      },
      {
        id: 'channels',
        header: t('opd.cfg.msg.channels'),
        cell: ({ row }) =>
          row.original.channels.map((c) => t(`opd.cfg.msg.channel.${c}`)).join(', '),
      },
      {
        id: 'languages',
        header: t('opd.cfg.msg.languages'),
        cell: ({ row }) => row.original.languages.map((l) => l.toUpperCase()).join(', '),
      },
      {
        id: 'on',
        header: t('opd.cfg.msg.status'),
        cell: ({ row }) => {
          const m = row.original;
          const name = t(`opd.cfg.msg.codes.${m.code}`);
          return (
            <span className="flex items-center gap-2">
              <StatusBadge
                tone={m.on ? 'success' : 'neutral'}
                label={m.on ? t('opd.cfg.msg.on') : t('opd.cfg.msg.off')}
              />
              {canEdit && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await save({ id: m.id, on: !m.on }).unwrap();
                    toast({
                      tone: 'success',
                      title: t(m.on ? 'opd.cfg.msg.turnedOff' : 'opd.cfg.msg.turnedOn', { name }),
                    });
                  }}
                >
                  {m.on ? t('opd.cfg.msg.turnOff', { name }) : t('opd.cfg.msg.turnOn', { name })}
                </Button>
              )}
            </span>
          );
        },
      },
    ],
    [t, canEdit, save, toast],
  );
  return (
    <Card title={t('opd.cfg.msg.title')} description={t('opd.cfg.msg.hint')} padding={false}>
      <RecordsTable
        useQuery={useMessageTemplatesQuery}
        columns={columns}
        caption={t('opd.cfg.msg.title')}
        emptyTitle={t('opd.cfg.msg.empty')}
      />
    </Card>
  );
}

const FEE_RULES = [
  'DOCTOR_FEE',
  'FREE_IN_WINDOW',
  'TELE_FEE',
  'FEE_PLUS_VACCINE',
  'PER_PROCEDURE',
  'PACKAGE',
];

/** Visit types: slot length, how the fee is worked out, free follow-up, online and tele. */
export function VisitTypesTab({ canEdit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [add] = useAddVisitTypeMutation();
  const columns = useMemo(
    () => [
      {
        id: 'code',
        header: t('opd.cfg.vt.type'),
        cell: ({ row }) =>
          t(`opd.visitType.${row.original.code}`, {
            defaultValue: row.original.name ?? row.original.code,
          }),
      },
      {
        id: 'slot',
        header: t('opd.cfg.vt.slot'),
        cell: ({ row }) =>
          row.original.slotMin
            ? t('opd.sched.minutes', { n: row.original.slotMin })
            : t('opd.cfg.vt.package'),
      },
      {
        id: 'fee',
        header: t('opd.cfg.vt.fee'),
        cell: ({ row }) => t(`opd.cfg.vt.fees.${row.original.fee}`),
      },
      {
        id: 'free',
        header: t('opd.cfg.vt.free'),
        cell: ({ row }) =>
          row.original.freeFollowUp ? t(`opd.cfg.vt.frees.${row.original.freeFollowUp}`) : '-',
      },
      {
        id: 'online',
        header: t('opd.cfg.vt.online'),
        cell: ({ row }) => yesNo(t, row.original.online),
      },
      { id: 'tele', header: t('opd.cfg.vt.tele'), cell: ({ row }) => yesNo(t, row.original.tele) },
    ],
    [t],
  );
  return (
    <Card
      title={t('opd.cfg.vt.title')}
      padding={false}
      actions={canEdit && <Button onClick={() => setOpen(true)}>{t('opd.cfg.vt.add')}</Button>}
    >
      <RecordsTable
        useQuery={useVisitTypesQuery}
        columns={columns}
        caption={t('opd.cfg.vt.title')}
        emptyTitle={t('opd.cfg.vt.empty')}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={t('opd.cfg.vt.add')}
        schema={z.object({
          code: z
            .string()
            .trim()
            .regex(/^[A-Z_]{3,20}$/, t('opd.cfg.errors.code')),
          name: z.string().trim().min(2, t('opd.cfg.errors.required')),
          slotMin: z.coerce
            .number()
            .int()
            .min(5, t('opd.cfg.errors.slot'))
            .max(120, t('opd.cfg.errors.slot')),
          fee: z.enum(FEE_RULES),
          online: z.boolean(),
          tele: z.boolean(),
        })}
        defaultValues={{
          code: '',
          name: '',
          slotMin: 10,
          fee: 'DOCTOR_FEE',
          online: true,
          tele: false,
        }}
        fields={[
          {
            name: 'code',
            label: t('opd.cfg.vt.code'),
            mono: true,
            required: true,
            placeholder: 'ANC',
            hint: t('opd.cfg.vt.codeHint'),
          },
          { name: 'name', label: t('opd.cfg.vt.name'), required: true },
          { name: 'slotMin', label: t('opd.cfg.vt.slotMin'), type: 'number', required: true },
          {
            name: 'fee',
            label: t('opd.cfg.vt.fee'),
            type: 'select',
            options: FEE_RULES.map((f) => ({ value: f, label: t(`opd.cfg.vt.fees.${f}`) })),
          },
          { name: 'online', label: t('opd.cfg.vt.onlineLabel'), type: 'checkbox' },
          { name: 'tele', label: t('opd.cfg.vt.teleLabel'), type: 'checkbox' },
        ]}
        submitLabel={t('opd.cfg.vt.add')}
        onSubmit={(v) => add(v).unwrap()}
        onDone={(_r, v) =>
          toast({ tone: 'success', title: t('opd.cfg.vt.added', { name: v.name }) })
        }
      />
    </Card>
  );
}

const KINDS = ['RX', 'ORDER_SET', 'SPECIALTY'];

/** Consultation templates and order sets the doctors use, with how often. */
export function TemplatesTab({ canEdit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [add] = useCreateTemplateMutation();
  const departments = useOpdDepartmentsQuery(undefined, { skip: !open });
  const columns = useMemo(
    () => [
      {
        id: 'name',
        header: t('opd.cfg.tpl.name'),
        cell: ({ row }) => <strong className="font-semibold">{row.original.name}</strong>,
      },
      {
        id: 'kind',
        header: t('opd.cfg.tpl.kind'),
        cell: ({ row }) => t(`opd.cfg.tpl.kinds.${row.original.kind}`),
      },
      {
        id: 'department',
        header: t('opd.cfg.tpl.department'),
        cell: ({ row }) => row.original.department,
      },
      { id: 'owner', header: t('opd.cfg.tpl.owner'), cell: ({ row }) => row.original.owner },
      {
        id: 'used',
        header: t('opd.cfg.tpl.used'),
        meta: { align: 'right' },
        cell: ({ row }) => row.original.usedThisMonth ?? 0,
      },
    ],
    [t],
  );
  return (
    <Card
      title={t('opd.cfg.tpl.title')}
      padding={false}
      actions={canEdit && <Button onClick={() => setOpen(true)}>{t('opd.cfg.tpl.add')}</Button>}
    >
      <Banner tone="info" className="m-4">
        {t('opd.cfg.tpl.hint')}
      </Banner>
      <RecordsTable
        useQuery={useOpdTemplatesQuery}
        columns={columns}
        caption={t('opd.cfg.tpl.title')}
        emptyTitle={t('opd.cfg.tpl.empty')}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={t('opd.cfg.tpl.add')}
        description={t('opd.cfg.tpl.addHint')}
        schema={z.object({
          name: z.string().trim().min(3, t('opd.cfg.errors.required')),
          kind: z.enum(KINDS),
          department: z.string().min(1, t('opd.cfg.errors.required')),
        })}
        defaultValues={{ name: '', kind: 'ORDER_SET', department: '' }}
        fields={[
          { name: 'name', label: t('opd.cfg.tpl.name'), required: true },
          {
            name: 'kind',
            label: t('opd.cfg.tpl.kind'),
            type: 'select',
            options: KINDS.map((k) => ({ value: k, label: t(`opd.cfg.tpl.kinds.${k}`) })),
          },
          {
            name: 'department',
            label: t('opd.cfg.tpl.department'),
            type: 'select',
            required: true,
            options: (departments.data?.items ?? []).map((d) => ({ value: d.name, label: d.name })),
          },
        ]}
        submitLabel={t('opd.cfg.tpl.add')}
        onSubmit={(v) => add({ ...v, owner: 'Department' }).unwrap()}
        onDone={(r) => toast({ tone: 'success', title: t('opd.cfg.tpl.added', { name: r.name }) })}
      />
    </Card>
  );
}
