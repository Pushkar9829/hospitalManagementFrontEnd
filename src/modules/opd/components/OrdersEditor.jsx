import { useFieldArray, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { EmptyState, FormField, IconButton, Select, useToast } from '@hms/ui';
import { inr } from '../../../lib/money.js';
import { useOpdTemplatesQuery, useOrderablesQuery } from '../api.js';
import { ORDER_PRIORITIES, mergeLines, orderFrom } from '../consult.js';
import { LookupSearch } from './LookupSearch.jsx';

/**
 * Orders tab: lab, radiology and procedure orders, order sets, and the admission and referral
 * actions (`actions`, from the page). Orders reach the bill and the worklists on completion.
 */
export function OrdersEditor({ form, actions }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { register, control, getValues, setValue } = form;
  const orders = useFieldArray({ control, name: 'orders', keyName: 'key' });
  const lines = useWatch({ control, name: 'orders' }) ?? [];
  const sets = useOpdTemplatesQuery({ kind: 'ORDER_SET' });
  const total = lines.reduce((s, o) => s + (o.price ?? 0), 0);

  const applySet = (id) => {
    const set = sets.data?.items.find((x) => x.id === id);
    if (!set) return;
    setValue('orders', mergeLines(getValues('orders'), set.orders ?? [], 'code'), {
      shouldDirty: true,
    });
    toast({ tone: 'success', title: t('opd.consult.orders.applied', { name: set.name }) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_18rem]">
        <LookupSearch
          label={t('opd.consult.orders.add')}
          hint={t('opd.consult.orders.addHint')}
          useQuery={useOrderablesQuery}
          params={{}}
          itemKey={(o) => o.code}
          render={(o) => (
            <>
              <strong className="flex-1 font-semibold">{o.name}</strong>
              <span className="text-sm text-muted">{t(`opd.consult.orders.types.${o.type}`)}</span>
              <span className="tabular w-20 text-right text-sm">{inr(o.price)}</span>
            </>
          )}
          onPick={(o) => {
            if (!getValues('orders').some((x) => x.code === o.code)) orders.append(orderFrom(o));
          }}
        />
        <FormField label={t('opd.consult.orders.orderSet')}>
          <Select
            value=""
            placeholder={t('opd.consult.orders.orderSetNone')}
            options={(sets.data?.items ?? []).map((x) => ({
              value: x.id,
              label: `${x.name} · ${x.department}`,
            }))}
            onChange={(e) => applySet(e.target.value)}
          />
        </FormField>
      </div>

      {orders.fields.length === 0 ? (
        <EmptyState
          title={t('opd.consult.orders.empty')}
          description={t('opd.consult.orders.emptyHint')}
        />
      ) : (
        <div className="overflow-x-auto rounded-control border border-line">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">{t('opd.consult.orders.name')}</th>
                <th className="px-3 py-2 font-semibold">{t('opd.consult.orders.type')}</th>
                <th className="px-3 py-2 font-semibold">{t('opd.consult.orders.priority')}</th>
                <th className="px-3 py-2 text-right font-semibold">
                  {t('opd.consult.orders.price')}
                </th>
                <th className="px-3 py-2">
                  <span className="sr-only">{t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.fields.map((o, i) => (
                <tr key={o.key}>
                  <td className="px-3 py-2 font-semibold text-ink">{o.name}</td>
                  <td className="px-3 py-2">{t(`opd.consult.orders.types.${o.type}`)}</td>
                  <td className="px-3 py-2">
                    <Select
                      aria-label={`${t('opd.consult.orders.priority')}, ${o.name}`}
                      options={ORDER_PRIORITIES.map((p) => ({
                        value: p,
                        label: t(`opd.consult.orders.priorities.${p}`),
                      }))}
                      {...register(`orders.${i}.priority`)}
                    />
                  </td>
                  <td className="tabular px-3 py-2 text-right">{inr(o.price)}</td>
                  <td className="px-3 py-2">
                    <IconButton
                      size="sm"
                      label={t('opd.consult.orders.remove', { name: o.name })}
                      icon={<X size={16} aria-hidden="true" />}
                      onClick={() => orders.remove(i)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lines.length > 0 && (
        <p className="text-sm text-muted">
          <strong className="tabular text-ink">
            {t('opd.consult.orders.total', { amount: inr(total) })}
          </strong>
          {' · '}
          {t('opd.consult.orders.billing')}
        </p>
      )}
      {actions && <div className="flex flex-wrap gap-2 border-t border-line pt-4">{actions}</div>}
    </div>
  );
}
