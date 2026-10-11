import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button, ConfirmDialog, EmptyState, StatusBadge, useToast } from '@hms/ui';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import {
  useMedOrdersQuery,
  useOrderMedicineMutation,
  useStopOrderMutation,
  useVerifyOrderMutation,
} from '../api.js';

const FREQUENCIES = ['OD', 'BD', 'TDS', 'QID', 'Q6H', 'Q8H', 'HS', 'SOS', 'STAT'];
const ROUTES = ['Oral', 'IV', 'IM', 'SC', 'Inhalation', 'Sublingual', 'Topical', 'PR'];
const ORDER_TONE = {
  ORDERED: 'warning',
  VERIFIED: 'success',
  STOPPED: 'neutral',
  REJECTED: 'critical',
};

const orderSchema = (t) =>
  z.object({
    brand: z.string().trim().min(2, t('ipd.orders.errors.drug')),
    generic: z.string().max(120).optional(),
    dose: z.string().trim().min(1, t('ipd.orders.errors.dose')),
    route: z.enum(ROUTES),
    frequency: z.enum(FREQUENCIES),
    days: z.coerce.number().int().min(1).max(90).optional(),
    instructions: z.string().max(300).optional(),
  });

/**
 * Medicine orders on a stay: doctors order and stop, the pharmacist verifies (rule R11).
 * High-alert medicines are flagged; their doses need a second nurse on the MAR (rule R12).
 */
export function MedOrders({ admissionId, canOrder, canVerify }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState(null);
  const orders = useMedOrdersQuery({ id: admissionId });
  const [order] = useOrderMedicineMutation();
  const [stop] = useStopOrderMutation();
  const [verify] = useVerifyOrderMutation();
  return (
    <div className="flex flex-col gap-3">
      {canOrder && (
        <div>
          <Button onClick={() => setOpen(true)}>{t('ipd.orders.add')}</Button>
        </div>
      )}
      <QueryView
        query={orders}
        empty={<EmptyState bordered={false} title={t('ipd.orders.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <strong className="font-semibold text-ink">{o.drug.brand}</strong>{' '}
                  <span className="text-sm text-muted">
                    {o.dose} · {o.route} · {t(`ipd.freq.${o.frequency}`)}
                    {o.instructions && ` · ${o.instructions}`}
                  </span>
                </span>
                {o.highAlert && <StatusBadge tone="critical" label={t('ipd.orders.highAlert')} />}
                <StatusBadge
                  tone={ORDER_TONE[o.status]}
                  label={t(`ipd.orders.status.${o.status}`)}
                />
                {canVerify && o.status === 'ORDERED' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      verify({ id: o.id })
                        .unwrap()
                        .then(() =>
                          toast({
                            tone: 'success',
                            title: t('ipd.orders.verified', { drug: o.drug.brand }),
                          }),
                        )
                    }
                  >
                    {t('ipd.orders.verify')}
                  </Button>
                )}
                {canOrder && ['ORDERED', 'VERIFIED'].includes(o.status) && (
                  <Button size="sm" variant="ghost" onClick={() => setStopping(o)}>
                    {t('ipd.orders.stop')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={t('ipd.orders.add')}
        description={t('ipd.orders.addHint')}
        schema={orderSchema(t)}
        defaultValues={{
          brand: '',
          generic: '',
          dose: '',
          route: 'Oral',
          frequency: 'BD',
          days: 5,
          instructions: '',
        }}
        fields={[
          { name: 'brand', label: t('ipd.orders.drug'), required: true },
          { name: 'generic', label: t('ipd.orders.generic'), optional: true },
          { name: 'dose', label: t('ipd.orders.dose'), required: true },
          {
            name: 'route',
            label: t('ipd.orders.route'),
            type: 'select',
            options: ROUTES.map((r) => ({ value: r, label: r })),
          },
          {
            name: 'frequency',
            label: t('ipd.orders.frequency'),
            type: 'select',
            options: FREQUENCIES.map((f) => ({ value: f, label: t(`ipd.freq.${f}`) })),
          },
          { name: 'days', label: t('ipd.orders.days'), type: 'number', optional: true },
          { name: 'instructions', label: t('ipd.orders.instructions'), optional: true, span: 2 },
        ]}
        submitLabel={t('ipd.orders.save')}
        onSubmit={({ brand, generic, ...v }) =>
          order({ id: admissionId, drug: { brand, generic: generic || undefined }, ...v }).unwrap()
        }
        onDone={(o) =>
          toast({
            tone: o.highAlert ? 'warning' : 'success',
            title: t('ipd.orders.ordered', { drug: o.drug.brand }),
            description: o.highAlert ? t('ipd.orders.highAlertHint') : undefined,
          })
        }
      />
      <ConfirmDialog
        open={Boolean(stopping)}
        onOpenChange={(v) => !v && setStopping(null)}
        title={t('ipd.orders.stopTitle', { drug: stopping?.drug.brand ?? '' })}
        confirmLabel={t('ipd.orders.stop')}
        reasonLabel={t('ipd.beds.reason')}
        onConfirm={(reason) => stop({ id: stopping.id, reason }).unwrap()}
      />
    </div>
  );
}
