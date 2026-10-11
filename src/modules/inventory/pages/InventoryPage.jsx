import { useState } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { addInventoryStrings } from '@hms/i18n/inventory';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  DataTable,
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
import { PendingApprovalNotice } from '../../../components/PendingApprovalNotice.jsx';
import { inr, parseRupees } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtDate, localeOf } from '../../dx-kit/format.js';
import {
  PO_TONE,
  SCHEDULE_TONE,
  useAdjustMutation,
  useConvertRequisitionMutation,
  useCreateRequisitionMutation,
  useRejectRequisitionMutation,
  useReorderRequisitionMutation,
  useRequisitionsQuery,
  useStockTransferMutation,
  useStockTransfersQuery,
  useCreateGrnMutation,
  useCreateIndentMutation,
  useCreateItemMutation,
  useCreatePoMutation,
  useDeadStockQuery,
  useExpiryReportQuery,
  useGrnsQuery,
  useIndentsQuery,
  useInvItemsQuery,
  useInvStockQuery,
  useInvStoresQuery,
  useInvVendorsQuery,
  useIssueIndentMutation,
  useItemBatchesQuery,
  usePurchaseOrdersQuery,
  useReorderQuery,
} from '../api.js';

const ymNow = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);

function useStores() {
  const q = useInvStoresQuery();
  return q.data?.items ?? [];
}

function StoreSelect({ value, onChange, label, allowAll }) {
  const { t } = useTranslation();
  const stores = useStores();
  return (
    <FormField label={label ?? t('inv.store')} className="w-56">
      <Select
        value={value}
        placeholder={allowAll ? t('inv.allStores') : t('inv.pickStore')}
        onChange={(e) => onChange(e.target.value)}
        options={stores.map((s) => ({ value: s.id, label: s.name }))}
      />
    </FormField>
  );
}

/** Item lines picked by search, with a quantity (and optional rate). */
function LinePicker({ lines, setLines, withRate }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const search = useInvItemsQuery({ q }, { skip: q.trim().length < 2 });
  return (
    <div className="flex flex-col gap-2">
      <FormField label={t('inv.searchItem')}>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </FormField>
      {q.trim().length >= 2 && (
        <ul className="flex flex-wrap gap-2">
          {(search.data?.items ?? []).slice(0, 10).map((i) => (
            <li key={i.id}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setLines((ls) =>
                    ls.some((x) => x.itemId === i.id)
                      ? ls
                      : [...ls, { itemId: i.id, name: i.name, qty: '', rate: '' }],
                  )
                }
              >
                {i.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {lines.map((l, i) => (
        <div key={l.itemId} className="flex flex-wrap items-end gap-2">
          <span className="min-w-48 flex-1 text-sm">{l.name}</span>
          <FormField label={t('inv.qty')} className="w-28">
            <Input
              type="number"
              min={1}
              value={l.qty}
              onChange={(e) =>
                setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))
              }
            />
          </FormField>
          {withRate && (
            <FormField label={t('inv.rate')} className="w-32">
              <Input
                inputMode="decimal"
                value={l.rate}
                onChange={(e) =>
                  setLines((ls) => ls.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))
                }
              />
            </FormField>
          )}
          <Button variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
            {t('inv.remove')}
          </Button>
        </div>
      ))}
    </div>
  );
}

function Batches({ itemId, storeId }) {
  const { t } = useTranslation();
  const q = useItemBatchesQuery({ id: itemId, storeId: storeId || undefined });
  return (
    <QueryView query={q} rows={2}>
      {(d) => (
        <ul className="flex flex-col gap-1 py-2 text-sm">
          {d.items.map((b) => (
            <li key={b.id} className={b.expired ? 'text-critical' : ''}>
              <span className="font-mono">{b.batchNo}</span> · {b.store} ·{' '}
              {t('inv.expires', { ym: b.expiry })} · {b.qty} ·{' '}
              {t('inv.mrpEach', { mrp: inr(b.mrp) })}
              {b.expired && ` · ${t('inv.expired')}`}
            </li>
          ))}
        </ul>
      )}
    </QueryView>
  );
}

function StockTab() {
  const { t } = useTranslation();
  const [storeId, setStoreId] = useUrlState('store', '');
  const [q, setQ] = useUrlState('search', '');
  const [low, setLow] = useState(false);
  const [open, setOpen] = useState('');
  const stock = useInvStockQuery({
    storeId: storeId || undefined,
    q: q || undefined,
    low: low || undefined,
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <StoreSelect value={storeId} onChange={setStoreId} allowAll />
        <FormField label={t('inv.search')} className="w-64">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </FormField>
        <Checkbox
          checked={low}
          onChange={(e) => setLow(e.target.checked)}
          label={t('inv.lowOnly')}
        />
      </div>
      <QueryView
        query={stock}
        rows={6}
        empty={<EmptyState bordered={false} title={t('inv.noStock')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <>
            <p className="text-sm text-muted">
              {t('inv.stockValue', { value: inr(d.value), count: d.total })}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <caption className="sr-only">{t('inv.tabs.stock')}</caption>
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    {['item', 'qty', 'expiry', 'value', 'status'].map((k) => (
                      <th key={k} className="px-3 py-2 font-semibold">
                        {t(`inv.col.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.items.map((r) => (
                    <tr key={r.itemId} className="align-top">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-left font-semibold text-ink underline-offset-2 hover:underline"
                          aria-expanded={open === r.itemId}
                          onClick={() => setOpen(open === r.itemId ? '' : r.itemId)}
                        >
                          {r.name}
                        </button>
                        <span className="block text-muted">
                          {[r.code, r.generic].filter(Boolean).join(' · ')}{' '}
                          {r.schedule && (
                            <StatusBadge
                              tone={SCHEDULE_TONE[r.schedule]}
                              label={t(`inv.schedule.${r.schedule}`)}
                            />
                          )}
                        </span>
                        {open === r.itemId && <Batches itemId={r.itemId} storeId={storeId} />}
                      </td>
                      <td className="tabular px-3 py-2">
                        {r.qty} {r.unit}
                        {r.expiredQty > 0 && (
                          <span className="block text-critical">
                            {t('inv.expiredQty', { n: r.expiredQty })}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{r.nearestExpiry ?? '-'}</td>
                      <td className="tabular px-3 py-2">{inr(r.value)}</td>
                      <td className="px-3 py-2">
                        {r.low ? (
                          <StatusBadge
                            tone="warning"
                            label={t('inv.reorder', { n: r.reorderLevel })}
                          />
                        ) : (
                          <StatusBadge tone="success" label={t('inv.ok')} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </QueryView>
    </div>
  );
}

function PoTab() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const vendors = useInvVendorsQuery().data?.items ?? [];
  const pos = usePurchaseOrdersQuery();
  const [vendorId, setVendorId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [lines, setLines] = useState([]);
  const [failure, setFailure] = useState(null);
  const [approvalId, setApprovalId] = useState(null);
  const [create, state] = useCreatePoMutation();
  const reorder = useReorderQuery({ storeId: storeId || undefined }, { skip: !storeId });
  const valid =
    vendorId &&
    storeId &&
    lines.length &&
    lines.every((l) => Number(l.qty) > 0 && parseRupees(l.rate) > 0);
  return (
    <div className="flex flex-col gap-4">
      {can('inventory:po:create') && (
        <Card title={t('inv.po.new')}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <FormField label={t('inv.vendor')} className="w-64">
                <Select
                  value={vendorId}
                  placeholder={t('inv.pickVendor')}
                  onChange={(e) => setVendorId(e.target.value)}
                  options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                />
              </FormField>
              <StoreSelect value={storeId} onChange={setStoreId} label={t('inv.po.deliverTo')} />
            </div>
            {reorder.data?.items?.length > 0 && (
              <Banner tone="info">
                <div className="flex flex-wrap items-center gap-2">
                  {t('inv.po.reorderHint', { count: reorder.data.items.length })}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setLines(
                        reorder.data.items.map((r) => ({
                          itemId: r.itemId,
                          name: r.name,
                          qty: String(r.suggest),
                          rate: r.lastRate ? String(r.lastRate / 100) : '',
                        })),
                      )
                    }
                  >
                    {t('inv.po.useReorder')}
                  </Button>
                </div>
              </Banner>
            )}
            <LinePicker lines={lines} setLines={setLines} withRate />
            <ApiErrorNotice error={failure} />
            {approvalId && (
              <PendingApprovalNotice approvalId={approvalId}>
                {t('inv.po.pending')}
              </PendingApprovalNotice>
            )}
            <div>
              <Button
                loading={state.isLoading}
                disabled={!valid}
                onClick={async () => {
                  setFailure(null);
                  try {
                    const r = await create({
                      vendorId,
                      storeId,
                      lines: lines.map((l) => ({
                        itemId: l.itemId,
                        qty: Number(l.qty),
                        rate: parseRupees(l.rate),
                      })),
                    }).unwrap();
                    setApprovalId(r.approvalId ?? null);
                    setLines([]);
                    toast({
                      tone: 'success',
                      title: t(r.approvalId ? 'inv.po.sent' : 'inv.po.approved'),
                    });
                  } catch (err) {
                    setFailure(err);
                  }
                }}
              >
                {t('inv.po.raise')}
              </Button>
            </div>
          </div>
        </Card>
      )}
      <QueryView
        query={pos}
        empty={<EmptyState bordered={false} title={t('inv.po.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono">{p.poNo ?? t('inv.po.draftNo')}</span>
                <span className="min-w-0 flex-1">
                  {p.vendorName} ·{' '}
                  {p.lines.map((l) => `${l.name} ${l.received}/${l.qty}`).join(', ')}
                </span>
                <span className="tabular">{inr(p.total)}</span>
                <StatusBadge tone={PO_TONE[p.status]} label={t(`inv.po.status.${p.status}`)} />
                <span className="text-muted">{fmtDate(p.createdAt, localeOf(i18n))}</span>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

const blankGrnLine = () => ({
  itemId: '',
  name: '',
  batchNo: '',
  expiry: '',
  qty: '',
  freeQty: '',
  rate: '',
  mrp: '',
});

function GrnTab() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const pos = usePurchaseOrdersQuery({ status: 'APPROVED,PARTIAL' }).data?.items ?? [];
  const vendors = useInvVendorsQuery().data?.items ?? [];
  const grns = useGrnsQuery();
  const [poId, setPoId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lines, setLines] = useState([]);
  const [failure, setFailure] = useState(null);
  const [approvalId, setApprovalId] = useState(null);
  const [create, state] = useCreateGrnMutation();
  const po = pos.find((p) => p.id === poId);
  const set = (i, k, v) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="flex flex-col gap-4">
      {can('inventory:grn:create') && (
        <Card title={t('inv.grn.new')} description={t('inv.grn.hint')}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <FormField label={t('inv.grn.againstPo')} className="w-72">
                <Select
                  value={poId}
                  placeholder={t('inv.grn.direct')}
                  onChange={(e) => {
                    const p = pos.find((x) => x.id === e.target.value);
                    setPoId(e.target.value);
                    setLines(
                      p
                        ? p.lines
                            .filter((l) => l.received < l.qty)
                            .map((l) => ({
                              ...blankGrnLine(),
                              itemId: l.itemId,
                              name: l.name,
                              qty: String(l.qty - l.received),
                              rate: String(l.rate / 100),
                            }))
                        : [],
                    );
                  }}
                  options={pos.map((p) => ({ value: p.id, label: `${p.poNo} · ${p.vendorName}` }))}
                />
              </FormField>
              {!po && (
                <>
                  <FormField label={t('inv.vendor')} className="w-56">
                    <Select
                      value={vendorId}
                      placeholder={t('inv.pickVendor')}
                      onChange={(e) => setVendorId(e.target.value)}
                      options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                    />
                  </FormField>
                  <StoreSelect value={storeId} onChange={setStoreId} />
                </>
              )}
              <FormField label={t('inv.grn.invoice')} className="w-48">
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </FormField>
            </div>
            {!po && (
              <LinePicker
                lines={lines}
                setLines={(fn) =>
                  setLines((ls) =>
                    (typeof fn === 'function' ? fn(ls) : fn).map((l) => ({
                      ...blankGrnLine(),
                      ...l,
                    })),
                  )
                }
              />
            )}
            {lines.map((l, i) => (
              <div
                key={`${l.itemId}-${i}`}
                className="grid grid-cols-2 gap-2 rounded-control border border-line p-2 md:grid-cols-7"
              >
                <span className="col-span-2 self-center text-sm font-semibold md:col-span-1">
                  {l.name}
                </span>
                <FormField label={t('inv.grn.batch')}>
                  <Input
                    mono
                    value={l.batchNo}
                    onChange={(e) => set(i, 'batchNo', e.target.value)}
                  />
                </FormField>
                <FormField label={t('inv.grn.expiry')}>
                  <Input
                    type="month"
                    min={ymNow()}
                    value={l.expiry}
                    onChange={(e) => set(i, 'expiry', e.target.value)}
                  />
                </FormField>
                <FormField label={t('inv.qty')}>
                  <Input
                    type="number"
                    value={l.qty}
                    onChange={(e) => set(i, 'qty', e.target.value)}
                  />
                </FormField>
                <FormField label={t('inv.grn.free')}>
                  <Input
                    type="number"
                    value={l.freeQty}
                    onChange={(e) => set(i, 'freeQty', e.target.value)}
                  />
                </FormField>
                <FormField label={t('inv.rate')}>
                  <Input
                    inputMode="decimal"
                    value={l.rate}
                    onChange={(e) => set(i, 'rate', e.target.value)}
                  />
                </FormField>
                <FormField label={t('inv.grn.mrp')}>
                  <Input
                    inputMode="decimal"
                    value={l.mrp}
                    onChange={(e) => set(i, 'mrp', e.target.value)}
                  />
                </FormField>
              </div>
            ))}
            <ApiErrorNotice error={failure} />
            {approvalId && (
              <PendingApprovalNotice approvalId={approvalId}>
                {t('inv.grn.pending')}
              </PendingApprovalNotice>
            )}
            <div>
              <Button
                loading={state.isLoading}
                disabled={
                  !invoiceNo.trim() ||
                  !lines.length ||
                  lines.some((l) => !l.batchNo || !l.expiry || !(Number(l.qty) > 0))
                }
                onClick={async () => {
                  setFailure(null);
                  try {
                    const r = await create({
                      poId: poId || undefined,
                      vendorId: poId ? undefined : vendorId,
                      storeId: poId ? undefined : storeId,
                      invoiceNo: invoiceNo.trim(),
                      lines: lines.map((l) => ({
                        itemId: l.itemId,
                        batchNo: l.batchNo.trim(),
                        expiry: l.expiry,
                        qty: Number(l.qty),
                        freeQty: Number(l.freeQty || 0),
                        rate: parseRupees(l.rate) ?? 0,
                        mrp: parseRupees(l.mrp) ?? 0,
                      })),
                    }).unwrap();
                    setApprovalId(r.status === 'PENDING_APPROVAL' ? r.approvalId : null);
                    toast({
                      tone: r.status === 'POSTED' ? 'success' : 'warning',
                      title: t(r.status === 'POSTED' ? 'inv.grn.posted' : 'inv.grn.held', {
                        no: r.grnNo ?? '',
                      }),
                    });
                    if (r.status === 'POSTED') {
                      setLines([]);
                      setPoId('');
                      setInvoiceNo('');
                    }
                  } catch (err) {
                    setFailure(err);
                  }
                }}
              >
                {t('inv.grn.post')}
              </Button>
            </div>
          </div>
        </Card>
      )}
      <QueryView
        query={grns}
        empty={<EmptyState bordered={false} title={t('inv.grn.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono">{g.grnNo ?? '-'}</span>
                <span className="min-w-0 flex-1">
                  {g.vendorName} · {t('inv.grn.invoiceNo', { no: g.invoiceNo })} ·{' '}
                  {t('inv.grn.lines', { count: g.lines.length })}
                </span>
                <span className="tabular">{inr(g.total)}</span>
                <StatusBadge
                  tone={
                    g.status === 'POSTED'
                      ? 'success'
                      : g.status === 'REJECTED'
                        ? 'critical'
                        : 'warning'
                  }
                  label={t(`inv.grn.status.${g.status}`)}
                />
                <span className="text-muted">{fmtDate(g.createdAt, localeOf(i18n))}</span>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

/** Purchase requisitions (board Inventory): raised by departments or from reorder levels. */
function RequisitionTab() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const { toast } = useToast();
  const can = useCan();
  const stores = useStores();
  const vendors =
    useInvVendorsQuery(undefined, { skip: !can('inventory:po:create') }).data?.items ?? [];
  const name = (id) => stores.find((s) => s.id === id)?.name ?? '-';
  const list = useRequisitionsQuery({});
  const [storeId, setStore] = useState('');
  const [reorderStore, setReorderStore] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState([]);
  const [failure, setFailure] = useState(null);
  const [create, creating] = useCreateRequisitionMutation();
  const [fromReorder, reordering] = useReorderRequisitionMutation();
  const [convert] = useConvertRequisitionMutation();
  const [reject] = useRejectRequisitionMutation();
  const [dialog, setDialog] = useState(null);
  const r = dialog?.req;
  const tone = { OPEN: 'info', PO_CREATED: 'success', REJECTED: 'neutral' };
  return (
    <div className="flex flex-col gap-4">
      {(can('inventory:indent:create') || can('inventory:po:create')) && (
        <Card title={t('inv.req.new')}>
          <div className="flex flex-col gap-3">
            <StoreSelect value={storeId} onChange={setStore} />
            <FormField label={t('inv.req.reason')}>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </FormField>
            <LinePicker lines={lines} setLines={setLines} />
            <ApiErrorNotice error={failure} />
            <div>
              <Button
                loading={creating.isLoading}
                disabled={
                  !storeId ||
                  reason.trim().length < 3 ||
                  !lines.length ||
                  lines.some((l) => !(Number(l.qty) > 0))
                }
                onClick={async () => {
                  setFailure(null);
                  try {
                    const res = await create({
                      storeId,
                      reason: reason.trim(),
                      lines: lines.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })),
                    }).unwrap();
                    setLines([]);
                    setReason('');
                    toast({ tone: 'success', title: t('inv.req.raised', { no: res.prNo }) });
                  } catch (err) {
                    setFailure(err);
                  }
                }}
              >
                {t('inv.req.raise')}
              </Button>
            </div>
          </div>
        </Card>
      )}
      {can('inventory:po:create') && (
        <Card title={t('inv.req.fromReorder')} description={t('inv.req.fromReorderHint')}>
          <div className="flex flex-wrap items-end gap-3">
            <StoreSelect value={reorderStore} onChange={setReorderStore} />
            <Button
              variant="secondary"
              loading={reordering.isLoading}
              disabled={!reorderStore}
              onClick={async () => {
                try {
                  const res = await fromReorder({ storeId: reorderStore }).unwrap();
                  toast({ tone: 'success', title: t('inv.req.raised', { no: res.prNo }) });
                } catch (err) {
                  toast({
                    tone: 'warning',
                    title: err?.data?.error?.message ?? String(err?.status),
                  });
                }
              }}
            >
              {t('inv.req.fromReorder')}
            </Button>
          </div>
        </Card>
      )}
      <QueryView
        query={list}
        empty={<EmptyState bordered={false} title={t('inv.req.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono">{x.prNo}</span>
                <span className="min-w-0 flex-1">
                  {name(x.storeId)} · {x.lines.map((l) => `${l.name} ${l.qty}`).join(', ')}
                  <span className="block text-muted">
                    {t(`inv.req.source.${x.source}`)} · {x.reason}
                    {x.raisedBy ? ` · ${t('inv.req.by', { name: x.raisedBy })}` : ''}
                    {x.estimate ? ` · ${t('inv.req.estimate', { amount: inr(x.estimate) })}` : ''}
                    {x.createdAt ? ` · ${new Date(x.createdAt).toLocaleDateString(locale)}` : ''}
                  </span>
                </span>
                <StatusBadge tone={tone[x.status]} label={t(`inv.req.status.${x.status}`)} />
                {x.status === 'OPEN' && can('inventory:po:create') && (
                  <>
                    <Button size="sm" onClick={() => setDialog({ action: 'convert', req: x })}>
                      {t('inv.req.convert')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ action: 'reject', req: x })}
                    >
                      {t('inv.req.reject')}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      <FormDialog
        open={dialog?.action === 'convert'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={r ? t('inv.req.convertTitle', { no: r.prNo }) : ''}
        schema={z.object({ vendorId: z.string().min(1, t('inv.pickVendor')) })}
        defaultValues={{ vendorId: '' }}
        fields={[
          {
            name: 'vendorId',
            label: t('inv.vendor'),
            type: 'select',
            options: [
              { value: '', label: t('inv.pickVendor') },
              ...vendors.map((v) => ({ value: v.id, label: v.name })),
            ],
          },
        ]}
        submitLabel={t('inv.req.convert')}
        onSubmit={(f) => convert({ id: r.id, version: r.version, vendorId: f.vendorId }).unwrap()}
        onDone={() => toast({ tone: 'success', title: t('inv.req.converted', { no: r.prNo }) })}
      />
      <FormDialog
        open={dialog?.action === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={r ? t('inv.req.rejectTitle', { no: r.prNo }) : ''}
        destructive
        schema={z.object({ reason: z.string().trim().min(3).max(300) })}
        defaultValues={{ reason: '' }}
        fields={[
          { name: 'reason', label: t('inv.req.rejectReason'), type: 'textarea', required: true },
        ]}
        submitLabel={t('inv.req.reject')}
        onSubmit={(f) => reject({ id: r.id, version: r.version, reason: f.reason }).unwrap()}
        onDone={() => toast({ tone: 'success', title: t('inv.req.rejected', { no: r.prNo }) })}
      />
    </div>
  );
}

/** Store-to-store transfers: a direct move, and the register of every move. */
function TransferTab() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const { toast } = useToast();
  const can = useCan();
  const register = useStockTransfersQuery();
  const [fromStoreId, setFrom] = useState('');
  const [toStoreId, setTo] = useState('');
  const [lines, setLines] = useState([]);
  const [failure, setFailure] = useState(null);
  const [move, moving] = useStockTransferMutation();
  return (
    <div className="flex flex-col gap-4">
      {can('inventory:indent:issue') && (
        <Card title={t('inv.trf.new')}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <StoreSelect value={fromStoreId} onChange={setFrom} label={t('inv.ind.from')} />
              <StoreSelect value={toStoreId} onChange={setTo} label={t('inv.ind.for')} />
            </div>
            <LinePicker lines={lines} setLines={setLines} />
            <ApiErrorNotice error={failure} />
            <div>
              <Button
                loading={moving.isLoading}
                disabled={
                  !fromStoreId ||
                  !toStoreId ||
                  !lines.length ||
                  lines.some((l) => !(Number(l.qty) > 0))
                }
                onClick={async () => {
                  setFailure(null);
                  try {
                    const res = await move({
                      fromStoreId,
                      toStoreId,
                      lines: lines.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })),
                    }).unwrap();
                    setLines([]);
                    toast({ tone: 'success', title: t('inv.trf.moved', { no: res.ref }) });
                  } catch (err) {
                    setFailure(err);
                  }
                }}
              >
                {t('inv.trf.move')}
              </Button>
            </div>
          </div>
        </Card>
      )}
      <Card title={t('inv.trf.register')} padding={false}>
        <QueryView query={register} rows={3}>
          {(d) => (
            <DataTable
              caption={t('inv.trf.register')}
              data={d.items.map((x) => ({ ...x, id: x.ref }))}
              empty={t('inv.trf.none')}
              columns={[
                {
                  id: 'ref',
                  header: t('inv.trf.ref'),
                  cell: ({ row }) => <span className="font-mono">{row.original.ref}</span>,
                },
                {
                  id: 'kind',
                  header: '',
                  cell: ({ row }) => t(`inv.trf.kind.${row.original.kind}`),
                },
                {
                  id: 'route',
                  header: t('inv.trf.route'),
                  cell: ({ row }) => `${row.original.from} → ${row.original.to}`,
                },
                { id: 'lines', header: t('inv.trf.lines'), cell: ({ row }) => row.original.lines },
                { id: 'qty', header: t('inv.trf.qty'), cell: ({ row }) => row.original.qty },
                {
                  id: 'value',
                  header: t('inv.trf.value'),
                  cell: ({ row }) => inr(row.original.value),
                },
                {
                  id: 'at',
                  header: t('inv.trf.at'),
                  cell: ({ row }) =>
                    new Date(row.original.at).toLocaleString(locale, {
                      timeZone: 'Asia/Kolkata',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      hour12: false,
                    }),
                },
              ]}
            />
          )}
        </QueryView>
      </Card>
    </div>
  );
}

function IndentTab() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const stores = useStores();
  const name = (id) => stores.find((s) => s.id === id)?.name ?? '-';
  const list = useIndentsQuery({ status: 'OPEN,PARTIAL' });
  const [fromStoreId, setFrom] = useState('');
  const [toStoreId, setTo] = useState('');
  const [lines, setLines] = useState([]);
  const [failure, setFailure] = useState(null);
  const [create, creating] = useCreateIndentMutation();
  const [issue] = useIssueIndentMutation();
  return (
    <div className="flex flex-col gap-4">
      {can('inventory:indent:create') && (
        <Card title={t('inv.ind.new')}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <StoreSelect value={toStoreId} onChange={setTo} label={t('inv.ind.for')} />
              <StoreSelect value={fromStoreId} onChange={setFrom} label={t('inv.ind.from')} />
            </div>
            <LinePicker lines={lines} setLines={setLines} />
            <ApiErrorNotice error={failure} />
            <div>
              <Button
                loading={creating.isLoading}
                disabled={
                  !fromStoreId ||
                  !toStoreId ||
                  !lines.length ||
                  lines.some((l) => !(Number(l.qty) > 0))
                }
                onClick={async () => {
                  setFailure(null);
                  try {
                    const r = await create({
                      fromStoreId,
                      toStoreId,
                      lines: lines.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })),
                    }).unwrap();
                    setLines([]);
                    toast({ tone: 'success', title: t('inv.ind.raised', { no: r.indentNo }) });
                  } catch (err) {
                    setFailure(err);
                  }
                }}
              >
                {t('inv.ind.raise')}
              </Button>
            </div>
          </div>
        </Card>
      )}
      <QueryView
        query={list}
        empty={<EmptyState bordered={false} title={t('inv.ind.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono">{n.indentNo}</span>
                <span className="min-w-0 flex-1">
                  {t('inv.ind.route', { from: name(n.fromStoreId), to: name(n.toStoreId) })} ·{' '}
                  {n.lines.map((l) => `${l.name} ${l.issued}/${l.qty}`).join(', ')}
                </span>
                <StatusBadge
                  tone={n.status === 'PARTIAL' ? 'warning' : 'info'}
                  label={t(`inv.ind.status.${n.status}`)}
                />
                <span className="text-muted">{fmtDate(n.createdAt, localeOf(i18n))}</span>
                {can('inventory:indent:issue') && (
                  <Button
                    size="sm"
                    onClick={() =>
                      issue(n.id)
                        .unwrap()
                        .then((r) =>
                          toast({
                            tone: r.status === 'ISSUED' ? 'success' : 'warning',
                            title: t(`inv.ind.issued.${r.status}`),
                          }),
                        )
                    }
                  >
                    {t('inv.ind.issue')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function CountTab() {
  const { t } = useTranslation();
  const [storeId, setStoreId] = useState('');
  const [lines, setLines] = useState([]);
  const item = lines[0];
  const batches = useItemBatchesQuery({ id: item?.itemId, storeId }, { skip: !item || !storeId });
  const [batchNo, setBatchNo] = useState('');
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState(null);
  const [approvalId, setApprovalId] = useState(null);
  const [adjust, state] = useAdjustMutation();
  const batch = batches.data?.items?.find((b) => b.batchNo === batchNo);
  return (
    <Card title={t('inv.count.title')} description={t('inv.count.hint')}>
      <div className="flex flex-col gap-3">
        <StoreSelect value={storeId} onChange={setStoreId} />
        <LinePicker
          lines={lines}
          setLines={(fn) => setLines((ls) => (typeof fn === 'function' ? fn(ls) : fn).slice(-1))}
        />
        {item && storeId && (
          <div className="flex flex-wrap items-end gap-3">
            <FormField label={t('inv.grn.batch')} className="w-56">
              <Select
                value={batchNo}
                placeholder={t('inv.count.pickBatch')}
                onChange={(e) => setBatchNo(e.target.value)}
                options={(batches.data?.items ?? []).map((b) => ({
                  value: b.batchNo,
                  label: `${b.batchNo} · ${b.qty}`,
                }))}
              />
            </FormField>
            <FormField
              label={t('inv.count.counted')}
              hint={batch ? t('inv.count.system', { n: batch.qty }) : undefined}
              className="w-40"
            >
              <Input
                type="number"
                min={0}
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            </FormField>
            <FormField label={t('inv.count.reason')} className="min-w-64 flex-1">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
          </div>
        )}
        <ApiErrorNotice error={failure} />
        {approvalId && (
          <PendingApprovalNotice approvalId={approvalId}>
            {t('inv.count.pending')}
          </PendingApprovalNotice>
        )}
        <div>
          <Button
            loading={state.isLoading}
            disabled={!batchNo || counted === '' || reason.trim().length < 3}
            onClick={async () => {
              setFailure(null);
              try {
                const r = await adjust({
                  storeId,
                  itemId: item.itemId,
                  batchNo,
                  countedQty: Number(counted),
                  reason: reason.trim(),
                }).unwrap();
                setApprovalId(r.approvalId ?? null);
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            {t('inv.count.send')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ReportsTab() {
  const { t } = useTranslation();
  const [days, setDays] = useUrlState('days', '90');
  const expiry = useExpiryReportQuery({ days });
  const dead = useDeadStockQuery({ days: 90 });
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card title={t('inv.rep.expiry')}>
        <FormField label={t('inv.rep.within')} className="mb-3 w-40">
          <Select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            options={['30', '60', '90'].map((d) => ({
              value: d,
              label: t('inv.rep.days', { n: d }),
            }))}
          />
        </FormField>
        <QueryView
          query={expiry}
          empty={<EmptyState bordered={false} title={t('inv.rep.noExpiry')} />}
          isEmpty={(d) => !d.items.length}
        >
          {(d) => (
            <>
              <p className="mb-2 text-sm text-muted">
                {t('inv.rep.atCost', { value: inr(d.value) })}
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {d.items.map((r) => (
                  <li
                    key={`${r.itemId}-${r.batchNo}-${r.store}`}
                    className={r.expired ? 'text-critical' : ''}
                  >
                    {r.item} · <span className="font-mono">{r.batchNo}</span> · {r.store} ·{' '}
                    {r.expiry} · {r.qty}
                    {r.expired && ` · ${t('inv.expired')}`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </QueryView>
      </Card>
      <Card title={t('inv.rep.dead')}>
        <QueryView
          query={dead}
          empty={<EmptyState bordered={false} title={t('inv.rep.noDead')} />}
          isEmpty={(d) => !d.items.length}
        >
          {(d) => (
            <ul className="flex flex-col gap-1 text-sm">
              {d.items.map((r) => (
                <li key={r.itemId}>
                  {r.item} · {r.qty} · {inr(r.value)}
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Card>
    </div>
  );
}

function ItemsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const [q, setQ] = useUrlState('search', '');
  const items = useInvItemsQuery({ q: q || undefined });
  const [create, state] = useCreateItemMutation();
  const [f, setF] = useState({
    code: '',
    name: '',
    kind: 'DRUG',
    unit: 'tablet',
    gstRate: '5',
    generic: '',
    schedule: 'H',
    strengthMg: '',
    lifeSaving: false,
    reorderLevel: '',
  });
  const [failure, setFailure] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="flex flex-col gap-4">
      {can('inventory:item:create') && (
        <Card title={t('inv.item.new')}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <FormField label={t('inv.item.code')}>
              <Input mono value={f.code} onChange={set('code')} />
            </FormField>
            <FormField label={t('inv.item.name')} className="md:col-span-2">
              <Input value={f.name} onChange={set('name')} />
            </FormField>
            <FormField label={t('inv.item.kind')}>
              <Select
                value={f.kind}
                onChange={set('kind')}
                options={['DRUG', 'CONSUMABLE', 'REAGENT', 'GENERAL'].map((k) => ({
                  value: k,
                  label: t(`inv.kind.${k}`),
                }))}
              />
            </FormField>
            <FormField label={t('inv.item.unit')}>
              <Input value={f.unit} onChange={set('unit')} />
            </FormField>
            <FormField label={t('inv.item.gst')}>
              <Select
                value={f.gstRate}
                onChange={set('gstRate')}
                options={['0', '5', '12', '18'].map((r) => ({ value: r, label: `${r}%` }))}
              />
            </FormField>
            <FormField label={t('inv.item.reorder')}>
              <Input type="number" value={f.reorderLevel} onChange={set('reorderLevel')} />
            </FormField>
            {f.kind === 'DRUG' && (
              <>
                <FormField label={t('inv.item.generic')}>
                  <Input value={f.generic} onChange={set('generic')} />
                </FormField>
                <FormField label={t('inv.item.schedule')}>
                  <Select
                    value={f.schedule}
                    onChange={set('schedule')}
                    options={['OTC', 'H', 'H1', 'X', 'NARCOTIC'].map((s) => ({
                      value: s,
                      label: t(`inv.schedule.${s}`),
                    }))}
                  />
                </FormField>
                <FormField label={t('inv.item.strength')}>
                  <Input inputMode="decimal" value={f.strengthMg} onChange={set('strengthMg')} />
                </FormField>
                <Checkbox
                  checked={f.lifeSaving}
                  onChange={(e) => setF((s) => ({ ...s, lifeSaving: e.target.checked }))}
                  label={t('inv.item.lifeSaving')}
                />
              </>
            )}
          </div>
          <ApiErrorNotice error={failure} />
          <Button
            className="mt-3"
            loading={state.isLoading}
            disabled={f.code.trim().length < 2 || f.name.trim().length < 2}
            onClick={async () => {
              setFailure(null);
              try {
                await create({
                  code: f.code.trim(),
                  name: f.name.trim(),
                  kind: f.kind,
                  unit: f.unit.trim() || 'unit',
                  gstRate: Number(f.gstRate),
                  reorderLevel: Number(f.reorderLevel || 0),
                  drug:
                    f.kind === 'DRUG'
                      ? {
                          generic: f.generic.trim() || undefined,
                          schedule: f.schedule,
                          strengthMg: f.strengthMg ? Number(f.strengthMg) : undefined,
                          lifeSaving: f.lifeSaving,
                        }
                      : undefined,
                }).unwrap();
                toast({ tone: 'success', title: t('inv.item.added', { name: f.name }) });
                setF((s) => ({ ...s, code: '', name: '', generic: '', strengthMg: '' }));
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            {t('inv.item.add')}
          </Button>
        </Card>
      )}
      <FormField label={t('inv.search')} className="w-64">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </FormField>
      <QueryView query={items} rows={6}>
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono">{i.code}</span>
                <span className="min-w-0 flex-1">
                  {i.name}{' '}
                  {i.drug?.generic && <span className="text-muted">· {i.drug.generic}</span>}
                </span>
                {i.drug && (
                  <StatusBadge
                    tone={SCHEDULE_TONE[i.drug.schedule]}
                    label={t(`inv.schedule.${i.drug.schedule}`)}
                  />
                )}
                <span>{t('inv.item.gstShort', { rate: i.gstRate })}</span>
                <span className="text-muted">{t(`inv.kind.${i.kind}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

/**
 * Inventory (board Inventory, route /inventory): stock by store with batches and expiry,
 * purchase orders (reorder suggestions, approval), goods receipts with batch, expiry and MRP
 * (price variance held), indents and issues, physical counts through approval, expiry and dead
 * stock reports, and the item master.
 */
export default function InventoryPage() {
  useStrings(addDxkitStrings, addInventoryStrings);
  const { t } = useTranslation();
  const stock = useInvStockQuery({ low: true });
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('inv.crumb') }, { label: t('inv.title') }]}
        title={t('inv.title')}
        description={t('inv.description')}
      />
      {stock.data?.total > 0 && (
        <KpiRow
          items={[{ label: t('inv.kpi.low'), value: String(stock.data.total), tone: 'warning' }]}
        />
      )}
      <UrlTabs
        param="tab"
        label={t('inv.tabsLabel')}
        reset={['store', 'search', 'days']}
        tabs={[
          { id: 'stock', label: t('inv.tabs.stock'), body: <StockTab /> },
          { id: 'po', label: t('inv.tabs.po'), body: <PoTab /> },
          { id: 'grn', label: t('inv.tabs.grn'), body: <GrnTab /> },
          { id: 'indents', label: t('inv.tabs.indents'), body: <IndentTab /> },
          { id: 'requisitions', label: t('inv.req.tab'), body: <RequisitionTab /> },
          { id: 'transfers', label: t('inv.trf.tab'), body: <TransferTab /> },
          { id: 'count', label: t('inv.tabs.count'), body: <CountTab /> },
          { id: 'reports', label: t('inv.tabs.reports'), body: <ReportsTab /> },
          { id: 'items', label: t('inv.tabs.items'), body: <ItemsTab /> },
        ]}
      />
    </Page>
  );
}
