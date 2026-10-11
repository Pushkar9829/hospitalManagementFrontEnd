import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { MapPin, Phone } from 'lucide-react';
import { addLabStrings } from '@hms/i18n/lab';
import {
  Banner,
  Button,
  Checkbox,
  FormField,
  Input,
  Page,
  PageHeader,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import {
  useBookHomeVisitMutation,
  useHomeVisitActionMutation,
  useHomeVisitStaffQuery,
  useHomeVisitsQuery,
  useLabTestsQuery,
} from '../api.js';

const TONE = {
  BOOKED: 'neutral',
  ASSIGNED: 'info',
  ON_THE_WAY: 'accent',
  COLLECTED: 'success',
  HANDED_OVER: 'success',
  CANCELLED: 'neutral',
};
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** One visit as a card: who, where, what, and the next step for its state. */
function VisitCard({ v, canAssign, onAction }) {
  const { t } = useTranslation();
  const open = ['BOOKED', 'ASSIGNED', 'ON_THE_WAY'].includes(v.status);
  return (
    <li className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tabular text-md font-semibold text-ink">{v.slot}</span>
        <StatusBadge tone={TONE[v.status]} label={t(`lab.hv.status.${v.status}`)} />
      </div>
      <div>
        <p className="font-semibold text-ink">
          {v.patient?.name} <span className="font-mono text-sm text-muted">{v.patient?.uhid}</span>
        </p>
        <p className="text-sm text-ink">{v.address}</p>
        {v.landmark && <p className="text-sm text-muted">{v.landmark}</p>}
      </div>
      <p className="text-sm text-muted">{v.tests.join(', ')}</p>
      {v.notes && <p className="text-sm text-muted">{v.notes}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono text-muted">{v.visitNo}</span>
        <span className="text-muted">·</span>
        <span className="text-muted">{v.phlebotomist?.name ?? t('lab.hv.unassigned')}</span>
        {open && (
          <StatusBadge
            tone={v.payment === 'OK' ? 'success' : 'warning'}
            label={t(`lab.hv.payment.${v.payment}`)}
          />
        )}
      </div>
      {open && v.payment !== 'OK' && (
        <p className="text-sm text-warning">{t('lab.hv.unpaidHint')}</p>
      )}
      {v.sampleNos.length > 0 && (
        <p className="font-mono text-sm text-ink">
          {t('lab.hv.samples', { list: v.sampleNos.join(', ') })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {v.phone && (
          <a
            className="inline-flex min-h-tap items-center gap-1.5 rounded-control border border-line-strong px-3 text-sm font-semibold"
            href={`tel:${v.phone}`}
          >
            <Phone aria-hidden="true" className="size-4" />
            {t('lab.hv.call')}
          </a>
        )}
        {open && (
          <a
            className="inline-flex min-h-tap items-center gap-1.5 rounded-control border border-line-strong px-3 text-sm font-semibold"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin aria-hidden="true" className="size-4" />
            {t('lab.hv.map')}
          </a>
        )}
        {canAssign && ['BOOKED', 'ASSIGNED'].includes(v.status) && (
          <Button size="sm" variant="secondary" onClick={() => onAction('assign', v)}>
            {t('lab.hv.assign')}
          </Button>
        )}
        {v.status === 'ASSIGNED' && (
          <Button size="sm" onClick={() => onAction('start', v)}>
            {t('lab.hv.start')}
          </Button>
        )}
        {['ASSIGNED', 'ON_THE_WAY'].includes(v.status) && (
          <Button
            size="sm"
            variant={v.status === 'ON_THE_WAY' ? 'primary' : 'secondary'}
            disabled={v.payment !== 'OK'}
            onClick={() => onAction('collect', v)}
          >
            {t('lab.hv.collect')}
          </Button>
        )}
        {v.status === 'COLLECTED' && (
          <Button size="sm" onClick={() => onAction('handover', v)}>
            {t('lab.hv.handover')}
          </Button>
        )}
        {canAssign && open && (
          <Button size="sm" variant="ghost" onClick={() => onAction('cancel', v)}>
            {t('lab.hv.cancel')}
          </Button>
        )}
      </div>
    </li>
  );
}

function BookDialog({ open, onOpenChange, staff }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const tests = useLabTestsQuery({}, { skip: !open });
  const [book] = useBookHomeVisitMutation();
  const [picked, setPicked] = useState([]);
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setPicked([]);
        onOpenChange(o);
      }}
      title={t('lab.hv.bookTitle')}
      description={t('lab.hv.bookHint')}
      size="lg"
      schema={z.object({
        patient: z.object({ id: z.string() }, { error: t('lab.hv.patient') }),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        slot: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/),
        address: z.string().trim().min(5).max(300),
        landmark: z.string().max(120).optional(),
        phone: z.string().max(15).optional(),
        notes: z.string().max(300).optional(),
        phlebotomistUserId: z.string().optional(),
      })}
      defaultValues={{
        patient: null,
        date: istToday(),
        slot: '07:00-08:00',
        address: '',
        landmark: '',
        phone: '',
        notes: '',
        phlebotomistUserId: '',
      }}
      fields={[
        { name: 'patient', label: t('lab.hv.patient'), type: 'patient' },
        { name: 'date', label: t('lab.hv.date'), type: 'date', required: true },
        {
          name: 'slot',
          label: t('lab.hv.slot'),
          type: 'select',
          options: [
            '06:00-07:00',
            '07:00-08:00',
            '08:00-09:00',
            '09:00-10:00',
            '10:00-11:00',
            '11:00-12:00',
            '16:00-17:00',
            '17:00-18:00',
          ].map((s) => ({ value: s, label: s })),
        },
        { name: 'address', label: t('lab.hv.address'), type: 'textarea', required: true },
        { name: 'landmark', label: t('lab.hv.landmark'), optional: true },
        { name: 'phone', label: t('lab.hv.phone'), optional: true },
        {
          name: 'phlebotomistUserId',
          label: t('lab.hv.phlebotomist'),
          type: 'select',
          options: [
            { value: '', label: t('lab.hv.unassigned') },
            ...(staff ?? []).map((s) => ({ value: s.userId, label: s.name })),
          ],
        },
        { name: 'notes', label: t('lab.hv.notes'), type: 'textarea', optional: true },
      ]}
      submitLabel={t('lab.hv.book')}
      onSubmit={(v) => {
        if (!picked.length)
          return Promise.reject({
            status: 422,
            data: {
              error: {
                code: 'VALIDATION',
                message: t('lab.hv.pickTests'),
                details: [{ path: 'tests', message: t('lab.hv.pickTests') }],
              },
            },
          });
        return book({
          patientId: v.patient.id,
          tests: picked,
          date: v.date,
          slot: v.slot,
          address: v.address,
          landmark: v.landmark || undefined,
          phone: v.phone || undefined,
          notes: v.notes || undefined,
          phlebotomistUserId: v.phlebotomistUserId || undefined,
        }).unwrap();
      }}
      onDone={(r) => {
        setPicked([]);
        toast({ tone: 'success', title: t('lab.hv.booked', { no: r.visitNo }) });
      }}
    >
      {() => (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-semibold text-ink">{t('lab.hv.tests')}</legend>
          <div className="grid max-h-60 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {(tests.data?.items ?? []).map((x) => (
              <Checkbox
                key={x.serviceId}
                label={x.name}
                checked={picked.includes(x.serviceId)}
                onChange={(e) =>
                  setPicked((p) =>
                    e.target.checked ? [...p, x.serviceId] : p.filter((id) => id !== x.serviceId),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
      )}
    </FormDialog>
  );
}

/**
 * Home collection (design board "Phlebotomist phone screens"): the phlebotomist sees their own
 * visits for the day as cards built for a phone; lab staff book, assign and follow every visit.
 */
export default function HomeVisitsPage() {
  useStrings(addLabStrings);
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const canAssign = can('lab:homevisit:assign');
  const canBook = can('lab:homevisit:create');
  const [date, setDate] = useUrlState('date', istToday());
  const [onlyMine, setOnlyMine] = useUrlState('mine', canAssign || canBook ? '' : 'true');
  const query = useHomeVisitsQuery(
    { date, mine: onlyMine === 'true' ? 'true' : undefined },
    { pollingInterval: 60_000 },
  );
  const staff = useHomeVisitStaffQuery(undefined, { skip: !(canAssign || canBook) });
  const [act] = useHomeVisitActionMutation();
  const [dialog, setDialog] = useState(null); // { action, visit }
  const [booking, setBooking] = useState(false);
  const [labels, setLabels] = useState(null);

  const run = async (action, v, body = {}) => {
    const r = await act({ id: v.id, action, version: v.version, ...body }).unwrap();
    if (action === 'start')
      toast({ tone: 'success', title: t('lab.hv.started', { name: v.patient?.name }) });
    if (action === 'handover') toast({ tone: 'success', title: t('lab.hv.handedOver') });
    return r;
  };
  const onAction = (action, v) => {
    if (action === 'start' || action === 'handover')
      run(action, v).catch((e) =>
        toast({ tone: 'critical', title: e?.data?.error?.message ?? String(e?.status) }),
      );
    else setDialog({ action, visit: v });
  };
  const v = dialog?.visit;

  return (
    <Page>
      <PageHeader
        title={canAssign || canBook ? t('lab.hv.title') : t('lab.hv.phoneTitle')}
        description={canAssign || canBook ? t('lab.hv.description') : t('lab.hv.phoneDescription')}
        actions={canBook && <Button onClick={() => setBooking(true)}>{t('lab.hv.book')}</Button>}
      />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <FormField label={t('lab.hv.date')}>
          <Input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </FormField>
        {(canAssign || canBook) && (
          <Checkbox
            label={t('lab.hv.mine')}
            checked={onlyMine === 'true'}
            onChange={(e) => setOnlyMine(e.target.checked ? 'true' : '')}
          />
        )}
      </div>
      {labels && (
        <Banner
          tone="success"
          className="mb-4"
          action={
            <Button size="sm" variant="ghost" onClick={() => setLabels(null)}>
              {t('common.close')}
            </Button>
          }
        >
          <p className="font-semibold">{t('lab.hv.labels')}</p>
          <ul className="mt-1 font-mono text-sm">
            {labels.map((l) => (
              <li key={l.sampleNo}>
                {l.sampleNo} · {l.container ?? l.sampleType} · {l.tests.join(', ')}
              </li>
            ))}
          </ul>
        </Banner>
      )}
      <QueryView query={query} rows={3} empty={t('lab.hv.none')} isEmpty={(d) => !d.items.length}>
        {(d) => (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {d.items.map((x) => (
              <VisitCard key={x.id} v={x} canAssign={canAssign} onAction={onAction} />
            ))}
          </ul>
        )}
      </QueryView>

      <BookDialog open={booking} onOpenChange={setBooking} staff={staff.data?.items} />

      <FormDialog
        open={dialog?.action === 'assign'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={v ? t('lab.hv.assignTitle', { no: v.visitNo }) : ''}
        schema={z.object({ userId: z.string().min(1) })}
        defaultValues={{ userId: v?.phlebotomist?.userId ?? '' }}
        fields={[
          {
            name: 'userId',
            label: t('lab.hv.phlebotomist'),
            type: 'select',
            options: [
              { value: '', label: '' },
              ...(staff.data?.items ?? []).map((s) => ({ value: s.userId, label: s.name })),
            ],
          },
        ]}
        submitLabel={t('lab.hv.assign')}
        onSubmit={(f) => run('assign', v, { userId: f.userId })}
        onDone={(r) =>
          toast({
            tone: 'success',
            title: t('lab.hv.assigned', { no: r.visitNo, name: r.phlebotomist?.name }),
          })
        }
      />
      <FormDialog
        open={dialog?.action === 'collect'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={v ? t('lab.hv.collectTitle', { name: v.patient?.name }) : ''}
        description={t('lab.hv.collectHint')}
        schema={z.object({ scan: z.string().trim().min(3).max(40) })}
        defaultValues={{ scan: '' }}
        fields={[{ name: 'scan', label: t('lab.hv.scan'), required: true, mono: true }]}
        submitLabel={t('lab.hv.collect')}
        onSubmit={(f) => run('collect', v, { scan: f.scan })}
        onDone={(r) => {
          setLabels(r.labels);
          toast({
            tone: 'success',
            title: t('lab.hv.collected', { samples: r.labels.map((l) => l.sampleNo).join(', ') }),
          });
        }}
      />
      <FormDialog
        open={dialog?.action === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={v ? t('lab.hv.cancelTitle', { no: v.visitNo }) : ''}
        destructive
        schema={z.object({ reason: z.string().trim().min(5).max(200) })}
        defaultValues={{ reason: '' }}
        fields={[{ name: 'reason', label: t('lab.hv.reason'), type: 'textarea', required: true }]}
        submitLabel={t('lab.hv.cancel')}
        onSubmit={(f) => run('cancel', v, { reason: f.reason })}
        onDone={(r) => toast({ tone: 'success', title: t('lab.hv.cancelled', { no: r.visitNo }) })}
      />
    </Page>
  );
}
