import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import { addLabStrings } from '@hms/i18n/lab';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Dialog,
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
import { apiError } from '../../../app/apiError.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { fmtTime, localeOf } from '../../dx-kit/format.js';
import {
  useCollectMutation,
  useCollectionListQuery,
  useLabSamplesQuery,
  useLabSettingsQuery,
  useReceiveSampleMutation,
  useRejectSampleMutation,
} from '../api.js';
import { RejectionsTab, SendOutsTab, StorageTab } from '../components/Registers.jsx';
import { PRIORITY_TONE } from '../lab.js';

/** Barcode labels after collection: one per container, printed from the browser. */
function LabelsDialog({ labels, onClose }) {
  const { t, i18n } = useTranslation();
  return (
    <Dialog
      open={Boolean(labels)}
      onOpenChange={(v) => !v && onClose()}
      title={t('lab.col.labelsTitle', { count: labels?.length ?? 0 })}
      size="md"
    >
      <div className="flex flex-col gap-3">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(labels ?? []).map((l) => (
            <li
              key={l.sampleNo}
              className="rounded-control border border-line-strong p-3 font-mono text-sm"
            >
              <p className="text-base font-bold tracking-wider">{l.sampleNo}</p>
              <p>
                {l.patient.name} · {l.patient.age} {l.patient.gender}
              </p>
              <p>{l.patient.uhid}</p>
              <p>
                {t(`lab.container.${l.container}`, { defaultValue: l.container })} ·{' '}
                {l.tests.join(', ')}
              </p>
              <p>
                {l.priority !== 'ROUTINE' && <strong>{l.priority} · </strong>}
                {fmtTime(l.collectedAt, localeOf(i18n))}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" />
            {t('lab.col.print')}
          </Button>
          <Button onClick={onClose}>{t('lab.col.done')}</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** One patient order on the collection list: tick the tests, scan the wristband, collect (R1). */
function OrderRow({ order, onCollected }) {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const [picked, setPicked] = useState(() => order.tests.map((x) => x.id));
  const [scan, setScan] = useState('');
  const [failure, setFailure] = useState(null);
  const [collect, state] = useCollectMutation();
  const unpaid = order.payment !== 'OK';
  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-ink">{order.patient.name}</strong>
        <span className="text-sm text-muted">
          {[order.patient.uhid, order.ipNo, order.location, order.doctor]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {order.priority !== 'ROUTINE' && (
          <StatusBadge
            tone={PRIORITY_TONE[order.priority]}
            label={t(`lab.priority.${order.priority}`)}
          />
        )}
        {unpaid && <StatusBadge tone="warning" label={t(`lab.col.pay.${order.payment}`)} />}
        <span className="ml-auto text-sm text-muted">
          {order.orderNo} · {fmtTime(order.orderedAt, localeOf(i18n))}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4">
        {order.tests.map((x) => (
          <Checkbox
            key={x.id}
            checked={picked.includes(x.id)}
            onChange={(e) =>
              setPicked((p) => (e.target.checked ? [...p, x.id] : p.filter((v) => v !== x.id)))
            }
            label={x.recollect ? `${x.name} · ${t('lab.col.recollect')}` : x.name}
          />
        ))}
      </div>
      {unpaid ? (
        <p className="text-sm text-warning">
          {t('lab.col.payFirst')}{' '}
          {order.billId && (
            <Link className="font-semibold underline" to={`/billing/bills/${order.billId}`}>
              {t('lab.col.toBill')}
            </Link>
          )}
        </p>
      ) : (
        can('lab:sample:collect') && (
          <form
            noValidate
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setFailure(null);
              try {
                const r = await collect({ itemIds: picked, scan: scan.trim() }).unwrap();
                setScan('');
                onCollected(r.labels);
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            <FormField label={t('lab.col.scan')} hint={t('lab.col.scanHint')} className="w-72">
              <Input
                mono
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                autoComplete="off"
              />
            </FormField>
            <Button
              type="submit"
              loading={state.isLoading}
              disabled={!picked.length || scan.trim().length < 3}
            >
              {t('lab.col.collect', { count: picked.length })}
            </Button>
          </form>
        )
      )}
      <ApiErrorNotice error={failure} />
    </li>
  );
}

function CollectTab() {
  const { t } = useTranslation();
  const [source, setSource] = useUrlState('source', '');
  const [search, setSearch] = useUrlState('search', '');
  const [labels, setLabels] = useState(null);
  const list = useCollectionListQuery({ source: source || undefined, q: search || undefined });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('lab.col.source')} className="w-48">
          <Select
            value={source}
            placeholder={t('lab.col.allSources')}
            onChange={(e) => setSource(e.target.value)}
            options={['IPD', 'OPD', 'WALKIN'].map((s) => ({
              value: s,
              label: t(`lab.source.${s}`),
            }))}
          />
        </FormField>
        <FormField label={t('lab.filter.search')} className="w-64">
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </FormField>
      </div>
      <QueryView
        query={list}
        empty={<EmptyState bordered={false} title={t('lab.col.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {d.items.map((o) => (
              <OrderRow key={`${o.orderNo}-${o.tests.length}`} order={o} onCollected={setLabels} />
            ))}
          </ul>
        )}
      </QueryView>
      <LabelsDialog labels={labels} onClose={() => setLabels(null)} />
    </div>
  );
}

/** Receipt by scan (R3): accept, or reject with a reason (the tests go back for recollection). */
function ReceiveTab() {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const can = useCan();
  const [scan, setScan] = useState('');
  const [failure, setFailure] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const transit = useLabSamplesQuery({ status: 'COLLECTED' });
  const settings = useLabSettingsQuery();
  const [receive, receiving] = useReceiveSampleMutation();
  const [reject, rejectState] = useRejectSampleMutation();
  const accept = async (sampleNo) => {
    setFailure(null);
    try {
      const s = await receive(sampleNo).unwrap();
      toast({
        tone: 'success',
        title: t('lab.rec.received', { no: s.sampleNo }),
        description: s.tests.join(', '),
      });
      setScan('');
    } catch (err) {
      setFailure(err);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {can('lab:sample:receive') && (
        <form
          noValidate
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (scan.trim()) accept(scan.trim());
          }}
        >
          <FormField label={t('lab.rec.scan')} hint={t('lab.rec.scanHint')} className="w-72">
            <Input
              mono
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </FormField>
          <Button type="submit" loading={receiving.isLoading} disabled={scan.trim().length < 3}>
            {t('lab.rec.accept')}
          </Button>
        </form>
      )}
      {failure && apiError(failure)?.code === 'UNKNOWN_SAMPLE' ? (
        <Banner tone="critical">{apiError(failure).message}</Banner>
      ) : (
        <ApiErrorNotice error={failure} />
      )}
      <Card title={t('lab.rec.transit', { count: transit.data?.items?.length ?? 0 })}>
        <QueryView
          query={transit}
          empty={<EmptyState bordered={false} title={t('lab.rec.none')} />}
          isEmpty={(d) => !d.items.length}
        >
          {(d) => (
            <ul className="flex flex-col divide-y divide-line">
              {d.items.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="font-mono font-semibold">{s.sampleNo}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    {s.patient.name} · {s.tests.join(', ')}
                    <span className="block text-muted">
                      {[
                        s.location,
                        t(`lab.container.${s.container}`, { defaultValue: s.container }),
                        t('lab.rec.collected', {
                          time: fmtTime(s.collectedAt, locale),
                          by: s.collectedBy,
                        }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {s.priority !== 'ROUTINE' && (
                    <StatusBadge
                      tone={PRIORITY_TONE[s.priority]}
                      label={t(`lab.priority.${s.priority}`)}
                    />
                  )}
                  <StatusBadge
                    tone={s.minutesInTransit > 60 ? 'warning' : 'neutral'}
                    label={t('lab.rec.minutes', { n: s.minutesInTransit })}
                  />
                  {can('lab:sample:receive') && (
                    <>
                      <Button size="sm" onClick={() => accept(s.sampleNo)}>
                        {t('lab.rec.accept')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRejecting(s);
                          setReason('');
                          setNote('');
                        }}
                      >
                        {t('lab.rec.reject')}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Card>
      <Dialog
        open={Boolean(rejecting)}
        onOpenChange={(v) => !v && setRejecting(null)}
        title={rejecting ? t('lab.rec.rejectTitle', { no: rejecting.sampleNo }) : ''}
        size="md"
      >
        {rejecting && (
          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await reject({
                  sampleNo: rejecting.sampleNo,
                  reason,
                  note: note.trim() || undefined,
                }).unwrap();
                toast({
                  tone: 'warning',
                  title: t('lab.rec.rejected', { no: rejecting.sampleNo }),
                });
                setRejecting(null);
              } catch (err) {
                setFailure(err);
                setRejecting(null);
              }
            }}
          >
            <p className="text-sm text-muted">{t('lab.rec.rejectHint')}</p>
            <FormField label={t('lab.rec.reason')} required>
              <Select
                value={reason}
                placeholder={t('lab.res.choose')}
                onChange={(e) => setReason(e.target.value)}
                options={(settings.data?.rejectReasons ?? []).map((r) => ({
                  value: r,
                  label: t(`lab.reject.${r}`, { defaultValue: r }),
                }))}
              />
            </FormField>
            <FormField label={t('lab.rec.note')} optional>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRejecting(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={rejectState.isLoading}
                disabled={!reason}
              >
                {t('lab.rec.reject')}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

/**
 * Sample collection and receipt (board LabSample, route /lab/samples): the collection list with
 * payment state (R2) and the wristband scan (R1), barcode labels, and receipt by scan with
 * rejection reasons (R3).
 */
export default function LabSamplePage() {
  useStrings(addPatientsStrings, addDxkitStrings, addLabStrings);
  const { t } = useTranslation();
  const can = useCan();
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('lab.crumb') }, { label: t('lab.col.title') }]}
        title={t('lab.col.title')}
        description={t('lab.col.description')}
        actions={
          <Link className="text-sm font-semibold text-primary underline" to="/lab">
            {t('lab.toWorklists')}
          </Link>
        }
      />
      <UrlTabs
        param="tab"
        label={t('lab.col.tabsLabel')}
        tabs={[
          { id: 'collect', label: t('lab.col.tabs.collect'), body: <CollectTab /> },
          (can('lab:sample:receive') || can('lab:sample:read')) && {
            id: 'receive',
            label: t('lab.col.tabs.receive'),
            body: <ReceiveTab />,
          },
          (can('lab:sample:receive') || can('lab:sample:read')) && {
            id: 'rejections',
            label: t('lab.reg.tabs.rejections'),
            body: <RejectionsTab />,
          },
          (can('lab:sample:receive') || can('lab:sample:read')) && {
            id: 'sendouts',
            label: t('lab.reg.tabs.sendouts'),
            body: <SendOutsTab />,
          },
          (can('lab:sample:receive') || can('lab:sample:read')) && {
            id: 'storage',
            label: t('lab.reg.tabs.storage'),
            body: <StorageTab />,
          },
        ]}
      />
    </Page>
  );
}
