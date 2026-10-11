import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addIpdStrings } from '@hms/i18n/ipd';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  Page,
  PageHeader,
  Select,
  StatusBadge,
  useToast,
} from '@hms/ui';
import { apiError } from '../../../app/apiError.js';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { inr } from '../../../lib/money.js';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { PickList } from '../../dx-kit/PickList.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtMinutes, fmtTime, localeOf } from '../../dx-kit/format.js';
import {
  useAdmissionQuery,
  useAdmissionRequestsQuery,
  useBedBoardQuery,
  useCancelRequestMutation,
  useEstimateRequestMutation,
  useReserveBedMutation,
  useSignEstimateMutation,
  useSuggestBedsQuery,
  useTransferMutation,
} from '../api.js';

const URGENCY_TONE = { EMERGENCY: 'critical', TODAY: 'warning', ROUTINE: 'neutral' };

function RequestDetail({ request }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const suggest = useSuggestBedsQuery(request.id);
  const [estimate, est] = useEstimateRequestMutation();
  const [sign] = useSignEstimateMutation();
  const [reserve, res] = useReserveBedMutation();
  const [cancel] = useCancelRequestMutation();
  const [signedBy, setSignedBy] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [failure, setFailure] = useState(null);
  return (
    <Card
      title={`${request.patient.name} · ${request.patient.age ?? ''}`}
      description={`${request.reason} · ${t('ipd.req.by', { doctor: request.doctor.name })}`}
      actions={
        <StatusBadge
          tone={URGENCY_TONE[request.urgency]}
          label={t(`ipd.urgency.${request.urgency}`)}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted">{t('ipd.req.needs')}</dt>
          <dd>
            {t(`ipd.category.${request.wardCategory}`)}
            {request.isolation && ` · ${t('ipd.req.isolation')}`}
          </dd>
          <dt className="text-muted">{t('ipd.req.stay')}</dt>
          <dd>{t('ipd.req.days', { n: request.expectedDays })}</dd>
          <dt className="text-muted">{t('ipd.req.status')}</dt>
          <dd>{t(`ipd.reqStatus.${request.status}`)}</dd>
          {request.reservedUntil && (
            <>
              <dt className="text-muted">{t('ipd.req.heldUntil')}</dt>
              <dd>{fmtTime(request.reservedUntil, localeOf(i18n))}</dd>
            </>
          )}
        </dl>
        <ApiErrorNotice error={failure} />
        <section aria-labelledby="estimate" className="flex flex-col gap-2">
          <h3 id="estimate" className="font-semibold text-ink">
            {t('ipd.req.estimate')}
          </h3>
          {request.estimate ? (
            <p className="text-sm">
              {t('ipd.req.estimateLine', {
                amount: inr(request.estimate.amount),
                deposit: inr(request.estimate.deposit),
                days: request.estimate.days,
              })}
              {request.estimate.signedAt &&
                ` · ${t('ipd.req.signed', { by: request.estimate.signedBy })}`}
            </p>
          ) : (
            <p className="text-sm text-muted">{t('ipd.req.noEstimate')}</p>
          )}
          {can('ipd:admission:create') && (
            <div className="flex flex-wrap items-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={est.isLoading}
                onClick={() => estimate({ id: request.id }).unwrap().catch(setFailure)}
              >
                {t('ipd.req.giveEstimate')}
              </Button>
              {request.estimate && !request.estimate.signedAt && (
                <>
                  <FormField label={t('ipd.req.signedBy')} className="w-56">
                    <Input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} />
                  </FormField>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={signedBy.trim().length < 2}
                    onClick={() => sign({ id: request.id, signedBy }).unwrap().catch(setFailure)}
                  >
                    {t('ipd.req.recordSign')}
                  </Button>
                </>
              )}
            </div>
          )}
        </section>
        <section aria-labelledby="beds" className="flex flex-col gap-2">
          <h3 id="beds" className="font-semibold text-ink">
            {t('ipd.req.suggested')}
          </h3>
          <QueryView
            query={suggest}
            rows={3}
            empty={<Banner tone="warning">{t('ipd.req.noBed')}</Banner>}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
                {d.items.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <span className="font-mono font-semibold">{b.code}</span>
                    <span className="flex-1 text-sm text-muted">
                      {b.ward} · {t(`ipd.category.${b.category}`)}
                      {b.gender !== 'ANY' && ` · ${t(`ipd.gender.${b.gender}`)}`}
                    </span>
                    {can('ipd:bed:allocate') && (
                      <Button
                        size="sm"
                        loading={res.isLoading}
                        onClick={async () => {
                          setFailure(null);
                          try {
                            await reserve({ id: request.id, bedId: b.id }).unwrap();
                            toast({
                              tone: 'success',
                              title: t('ipd.req.reserved', {
                                code: b.code,
                                name: request.patient.name,
                              }),
                            });
                          } catch (e) {
                            setFailure(e);
                          }
                        }}
                      >
                        {t('ipd.req.reserve', { code: b.code })}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </section>
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {['RESERVED', 'ESTIMATED'].includes(request.status) && (
            <Link
              className="text-sm font-semibold text-primary underline"
              to={`/ipd/admit?request=${request.id}`}
            >
              {t('ipd.req.admitNow')}
            </Link>
          )}
          {can('ipd:admission:create') && (
            <Button size="sm" variant="secondary" onClick={() => setCancelling(true)}>
              {t('ipd.req.cancel')}
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={t('ipd.req.cancelTitle', { name: request.patient.name })}
        confirmLabel={t('ipd.req.cancel')}
        reasonLabel={t('ipd.beds.reason')}
        onConfirm={(reason) => cancel({ id: request.id, reason }).unwrap()}
      />
    </Card>
  );
}

/** Transfer or ICU step-up for a patient in a bed (from the bed board). */
function TransferPanel({ admissionId }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const stay = useAdmissionQuery(admissionId);
  const board = useBedBoardQuery();
  const [bedId, setBedId] = useState('');
  const [reason, setReason] = useState('');
  const [consent, setConsent] = useState(false);
  const [failure, setFailure] = useState(null);
  const [transfer, state] = useTransferMutation();
  const free = (board.data?.wards ?? []).flatMap((w) =>
    w.beds
      .filter((b) => b.status === 'AVAILABLE')
      .map((b) => ({
        value: b.id,
        label: `${b.code} · ${w.name} · ${t(`ipd.category.${w.category}`)}`,
      })),
  );
  return (
    <QueryView query={stay} rows={4}>
      {(a) => (
        <Card
          title={t('ipd.req.transferTitle', { name: a.patient.name, bed: a.bed.code })}
          description={t('ipd.req.transferHint')}
        >
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setFailure(null);
              try {
                const r = await transfer({
                  id: a.id,
                  bedId,
                  reason,
                  consentHigherCategory: consent || undefined,
                }).unwrap();
                toast({
                  tone: 'success',
                  title: t('ipd.req.transferred', { name: a.patient.name, bed: r.bed.code }),
                });
              } catch (err) {
                setFailure(err);
              }
            }}
          >
            {apiError(failure)?.code === 'ROOM_RENT_CONSENT' ? (
              <Banner tone="warning" title={t('ipd.admit.roomRent')}>
                <Checkbox
                  label={t('ipd.admit.consentHigher')}
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
              </Banner>
            ) : (
              <ApiErrorNotice error={failure} />
            )}
            <FormField label={t('ipd.req.toBed')} required>
              <Select
                value={bedId}
                onChange={(e) => setBedId(e.target.value)}
                placeholder={t('ipd.admit.pickBed')}
                options={free}
              />
            </FormField>
            <FormField label={t('ipd.beds.reason')} required>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
            <div>
              <Button
                type="submit"
                loading={state.isLoading}
                disabled={!bedId || reason.trim().length < 3}
              >
                {t('ipd.req.transfer')}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </QueryView>
  );
}

/**
 * Bed requests (board IpdBedRequests, route /ipd/bed-requests): open requests, emergency first;
 * the selected one with its estimate, the beds that suit it (rule R4) and reservation (rule R3).
 * With ?transfer=<admission>, moves a patient to another bed.
 */
export default function BedRequestsPage() {
  useStrings(addDxkitStrings, addIpdStrings);
  const { t } = useTranslation();
  const [selected, setSelected] = useUrlState('id', '');
  const [transferId] = useUrlState('transfer', '');
  const requests = useAdmissionRequestsQuery({});
  const items = requests.data?.items ?? [];
  const current = items.find((r) => r.id === selected) ?? items[0] ?? null;
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('ipd.crumb') }, { label: t('ipd.req.title') }]}
        title={t('ipd.req.title')}
        description={t('ipd.req.description')}
      />
      {transferId && <TransferPanel admissionId={transferId} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
        <Card title={t('ipd.req.open')} description={t('ipd.req.order')}>
          <QueryView
            query={requests}
            empty={<EmptyState bordered={false} title={t('ipd.req.none')} />}
            isEmpty={(d) => !d.items.length}
          >
            {(d) => (
              <PickList
                label={t('ipd.req.open')}
                selectedId={current?.id}
                onPick={setSelected}
                items={d.items.map((r) => ({
                  id: r.id,
                  title: r.patient.name,
                  sub: `${t(`ipd.category.${r.wardCategory}`)} · ${t('ipd.req.waiting', { time: fmtMinutes(Math.round((Date.now() - new Date(r.createdAt)) / 60000), t) })}`,
                  badge: { tone: URGENCY_TONE[r.urgency], label: t(`ipd.urgency.${r.urgency}`) },
                }))}
              />
            )}
          </QueryView>
        </Card>
        {current ? (
          <RequestDetail key={current.id} request={current} />
        ) : (
          <EmptyState title={t('ipd.req.pick')} />
        )}
      </div>
    </Page>
  );
}
