import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  EmptyState,
  FormField,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { fmtDateTime, localeOf } from '../../dx-kit/format.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import {
  useAcknowledgeResultMutation,
  useCreateLabOrderMutation,
  useLabTestsQuery,
  usePatientLabResultsQuery,
} from '../api.js';
import { PRIORITY_TONE, STATUS_TONE } from '../lab.js';
import { ResultsTable } from './ResultsTable.jsx';

/** Order lab tests for an in-patient: they land on the ward collection list and the IP bill. */
function OrderForm({ admissionId }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const tests = useLabTestsQuery();
  const [picked, setPicked] = useState([]);
  const [priority, setPriority] = useState('ROUTINE');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState(null);
  const [order, state] = useCreateLabOrderMutation();
  const duplicate = failure?.data?.error?.code === 'DUPLICATE_ORDER';
  return (
    <form
      noValidate
      className="flex flex-col gap-3 rounded-control border border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setFailure(null);
        try {
          const r = await order({
            admissionId,
            tests: picked,
            priority,
            clinicalNotes: notes.trim() || undefined,
            duplicateReason: reason.trim() || undefined,
          }).unwrap();
          toast({
            tone: 'success',
            title: t('lab.panel.ordered', { count: r.items.length, no: r.orderNo }),
          });
          setPicked([]);
          setNotes('');
          setReason('');
        } catch (err) {
          setFailure(err);
        }
      }}
    >
      <h3 className="font-semibold text-ink">{t('lab.panel.order')}</h3>
      <QueryView query={tests} rows={3}>
        {(d) => (
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
            {d.items
              .filter((x) => x.isActive)
              .map((x) => (
                <Checkbox
                  key={x.serviceId}
                  checked={picked.includes(x.serviceId)}
                  onChange={(e) =>
                    setPicked((p) =>
                      e.target.checked ? [...p, x.serviceId] : p.filter((v) => v !== x.serviceId),
                    )
                  }
                  label={x.name}
                />
              ))}
          </div>
        )}
      </QueryView>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
        <FormField label={t('lab.filter.priority')}>
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            options={['ROUTINE', 'URGENT', 'STAT'].map((p) => ({
              value: p,
              label: t(`lab.priority.${p}`),
            }))}
          />
        </FormField>
        <FormField label={t('lab.panel.notes')} optional>
          <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
      </div>
      <ApiErrorNotice error={failure} />
      {duplicate && (
        <FormField label={t('lab.panel.repeatReason')} required>
          <Textarea rows={1} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      )}
      <div>
        <Button
          type="submit"
          loading={state.isLoading}
          disabled={!picked.length || (duplicate && !reason.trim())}
        >
          {t('lab.panel.send', { count: picked.length })}
        </Button>
      </div>
    </form>
  );
}

/**
 * A patient's lab work for the doctor: each test's progress, and the values once the pathologist
 * has released them (never before), with acknowledgement. In-patient stays can order from here.
 */
export function PatientLabPanel({ patientId, admissionId, canOrder, canAcknowledge }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const list = usePatientLabResultsQuery(patientId);
  const [ack] = useAcknowledgeResultMutation();
  return (
    <div className="flex flex-col gap-4">
      {canOrder && admissionId && <OrderForm admissionId={admissionId} />}
      <QueryView
        query={list}
        empty={<EmptyState bordered={false} title={t('lab.panel.none')} />}
        isEmpty={(d) => !d.items.length}
      >
        {(d) => (
          <ul className="flex flex-col gap-3">
            {d.items.map((i) => (
              <li key={i.id} className="rounded-control border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-ink">{i.name}</strong>
                  <StatusBadge tone={STATUS_TONE[i.status]} label={t(`lab.status.${i.status}`)} />
                  {i.priority !== 'ROUTINE' && (
                    <StatusBadge
                      tone={PRIORITY_TONE[i.priority]}
                      label={t(`lab.priority.${i.priority}`)}
                    />
                  )}
                  {i.results.some((r) => r.critical) && (
                    <StatusBadge tone="critical" label={t('lab.panel.critical')} />
                  )}
                  <span className="text-sm text-muted">
                    {i.orderNo} · {fmtDateTime(i.releasedAt ?? i.orderedAt, locale)}
                  </span>
                  {i.status === 'RELEASED' && (
                    <span className="ml-auto flex items-center gap-2">
                      <Link
                        className="text-sm font-semibold text-primary underline"
                        to={`/lab/report/${encodeURIComponent(i.orderNo)}`}
                      >
                        {t('lab.rel.report')}
                      </Link>
                      {i.acknowledgedAt ? (
                        <span className="text-sm text-muted">
                          {t('lab.panel.acked', { by: i.acknowledgedBy })}
                        </span>
                      ) : (
                        canAcknowledge && (
                          <Button size="sm" variant="secondary" onClick={() => ack(i.id)}>
                            {t('lab.panel.ack')}
                          </Button>
                        )
                      )}
                    </span>
                  )}
                </div>
                {i.status === 'RELEASED' && (
                  <div className="mt-2">
                    <ResultsTable results={i.results} caption={i.name} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}
