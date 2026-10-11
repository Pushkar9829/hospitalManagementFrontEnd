import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate } from '../../dx-kit/format.js';
import {
  PRIORITY_TONE,
  TICKET_TONE,
  useAssetsQuery,
  useRaiseTicketMutation,
  useTicketActionMutation,
  useTicketsQuery,
} from '../api.js';

const CATEGORIES = [
  'ELECTRICAL',
  'PLUMBING',
  'AC',
  'CIVIL',
  'IT',
  'BIOMEDICAL',
  'CARPENTRY',
  'OTHER',
];

/** Raise a maintenance ticket (any user); a biomedical breakdown names the equipment. */
export function TicketForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const [f, setF] = useState({
    category: 'ELECTRICAL',
    priority: 'NORMAL',
    location: '',
    description: '',
    assetId: '',
    breakdown: false,
  });
  const assets = useAssetsQuery(
    { category: 'BIOMEDICAL' },
    { skip: f.category !== 'BIOMEDICAL' || !can('facility:asset:read') },
  );
  const [raise, state] = useRaiseTicketMutation();
  const [failure, setFailure] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={t('fac.tk.raise')} description={t('fac.tk.raiseHint')}>
      {failure && <ApiErrorNotice error={failure} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={t('fac.tk.category')}>
          <Select
            value={f.category}
            onChange={set('category')}
            options={CATEGORIES.map((c) => ({ value: c, label: t(`fac.tk.cat.${c}`) }))}
          />
        </FormField>
        <FormField label={t('fac.tk.priority')}>
          <Select
            value={f.priority}
            onChange={set('priority')}
            options={['URGENT', 'HIGH', 'NORMAL', 'LOW'].map((p) => ({
              value: p,
              label: t(`fac.tk.prio.${p}`),
            }))}
          />
        </FormField>
        <FormField label={t('fac.tk.location')}>
          <Input value={f.location} onChange={set('location')} />
        </FormField>
        {f.category === 'BIOMEDICAL' && (assets.data?.items.length ?? 0) > 0 && (
          <>
            <FormField label={t('fac.tk.equipment')} className="sm:col-span-2">
              <Select
                value={f.assetId}
                placeholder={t('fac.tk.noEquipment')}
                onChange={set('assetId')}
                options={assets.data.items.map((a) => ({
                  value: a.id,
                  label: `${a.code} · ${a.name} · ${a.location}`,
                }))}
              />
            </FormField>
            <Checkbox
              checked={f.breakdown}
              onChange={(e) => setF({ ...f, breakdown: e.target.checked })}
              label={t('fac.tk.breakdown')}
            />
          </>
        )}
        <FormField label={t('fac.tk.description')} className="sm:col-span-3">
          <Textarea rows={3} value={f.description} onChange={set('description')} />
        </FormField>
      </div>
      <Button
        className="mt-3"
        loading={state.isLoading}
        disabled={f.location.trim().length < 2 || f.description.trim().length < 5}
        onClick={async () => {
          setFailure(null);
          try {
            const out = await raise({
              ...f,
              location: f.location.trim(),
              description: f.description.trim(),
              assetId: f.assetId || undefined,
              breakdown: Boolean(f.assetId) && f.breakdown,
            }).unwrap();
            toast({ tone: 'success', title: t('fac.tk.raised', { no: out.ticketNo }) });
            setF({ ...f, description: '', assetId: '', breakdown: false });
          } catch (err) {
            setFailure(err);
          }
        }}
      >
        {t('fac.tk.submit')}
      </Button>
    </Card>
  );
}

function TicketRow({ tk }) {
  const { t } = useTranslation();
  const can = useCan();
  const manage = can('facility:ticket:update');
  const [act, state] = useTicketActionMutation();
  const [note, setNote] = useState('');
  const [failure, setFailure] = useState(null);
  const go = async (action, extra = {}) => {
    setFailure(null);
    try {
      await act({ id: tk.id, action, ...extra }).unwrap();
      setNote('');
    } catch (err) {
      setFailure(err);
    }
  };
  return (
    <li className="flex flex-col gap-2 px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono">{tk.ticketNo}</span>
        <StatusBadge tone={PRIORITY_TONE[tk.priority]} label={t(`fac.tk.prio.${tk.priority}`)} />
        <StatusBadge tone={TICKET_TONE[tk.status]} label={t(`fac.tk.status.${tk.status}`)} />
        {tk.overdue && <StatusBadge tone="critical" label={t('fac.tk.overdue')} />}
        {tk.breakdown && <StatusBadge tone="critical" label={t('fac.tk.breakdownShort')} />}
        <span className="ml-auto text-muted">
          {t(`fac.tk.cat.${tk.category}`)} · {tk.location} · {fmtDate(tk.createdAt)}
        </span>
      </div>
      <p>
        {tk.description}
        {tk.assetName && <span className="text-muted"> · {tk.assetName}</span>}
      </p>
      <p className="text-xs text-muted">
        {t('fac.tk.raisedBy', { by: tk.raisedBy })}
        {tk.assignee && ` · ${t('fac.tk.assignedTo', { to: tk.assignee })}`}
        {tk.resolution && ` · ${tk.resolution}`}
        {tk.downtimeMin != null && ` · ${t('fac.tk.downtime', { min: tk.downtimeMin })}`}
      </p>
      {failure && <ApiErrorNotice error={failure} />}
      <div className="flex flex-wrap items-end gap-2">
        {manage && ['OPEN', 'REOPENED', 'ASSIGNED', 'IN_PROGRESS'].includes(tk.status) && (
          <Input
            aria-label={t('fac.tk.note')}
            placeholder={
              ['OPEN', 'REOPENED'].includes(tk.status)
                ? t('fac.tk.assigneeHint')
                : t('fac.tk.resolutionHint')
            }
            className="w-64"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
        {manage && ['OPEN', 'REOPENED'].includes(tk.status) && (
          <Button
            size="sm"
            disabled={!note.trim() || state.isLoading}
            onClick={() => go('ASSIGN', { assignee: note.trim() })}
          >
            {t('fac.tk.assign')}
          </Button>
        )}
        {manage && tk.status === 'ASSIGNED' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={state.isLoading}
            onClick={() => go('START')}
          >
            {t('fac.tk.start')}
          </Button>
        )}
        {manage && ['ASSIGNED', 'IN_PROGRESS'].includes(tk.status) && (
          <Button
            size="sm"
            disabled={!note.trim() || state.isLoading}
            onClick={() => go('RESOLVE', { note: note.trim() })}
          >
            {t('fac.tk.resolve')}
          </Button>
        )}
        {tk.status === 'RESOLVED' && (
          <>
            <Button size="sm" disabled={state.isLoading} onClick={() => go('CONFIRM')}>
              {t('fac.tk.confirm')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={state.isLoading}
              onClick={() => go('REOPEN', { note: t('fac.tk.notFixed') })}
            >
              {t('fac.tk.reopen')}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** Ticket list with status filter; `mineOnly` shows what the user raised (My Space). */
export function TicketList({ defaultStatus = 'OPEN,ASSIGNED,IN_PROGRESS,RESOLVED,REOPENED' }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(defaultStatus);
  const q = useTicketsQuery({ status: status || undefined });
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t('fac.show')} className="w-56">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: 'OPEN,ASSIGNED,IN_PROGRESS,RESOLVED,REOPENED', label: t('fac.tk.open') },
            { value: 'CLOSED', label: t('fac.tk.status.CLOSED') },
          ]}
        />
      </FormField>
      <QueryView
        query={q}
        rows={4}
        empty={<EmptyState bordered={false} title={t('fac.tk.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((tk) => (
              <TicketRow key={tk.id} tk={tk} />
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}
