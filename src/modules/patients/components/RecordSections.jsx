import { useTranslation } from 'react-i18next';
import { Card, DataTable, StatusBadge } from '@hms/ui';
import { inr } from '../../../lib/money.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { KpiRow } from '../../dx-kit/KpiRow.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, fmtDateTime, localeOf } from '../../dx-kit/format.js';
import { usePatientSectionQuery, usePatientSummaryQuery } from '../api.js';

const FLAG_TONE = {
  NORMAL: 'success',
  LOW: 'warning',
  HIGH: 'warning',
  ABNORMAL: 'warning',
  CRITICAL: 'critical',
};
const STAY_TONE = { DISCHARGED: 'neutral' };

/** Clinical and money summary of the patient, from the modules that hold it. */
export function RecordSummary({ patientId }) {
  const { t } = useTranslation();
  const q = usePatientSummaryQuery(patientId);
  const s = q.data;
  if (!s) return null;
  return (
    <div className="flex flex-col gap-2">
      <KpiRow
        items={[
          { label: t('patients.rec.opdVisits'), value: String(s.opdVisits) },
          {
            label: t('patients.rec.ipdStays'),
            value: String(s.ipdStays),
            sub: s.admission
              ? t('patients.rec.inBed', { ipNo: s.admission.ipNo, bed: s.admission.bed ?? '' })
              : undefined,
          },
          { label: t('patients.rec.activeMedicines'), value: String(s.activeMedicines) },
          {
            label: t('patients.rec.outstanding'),
            value: inr(s.outstanding),
            tone: s.outstanding > 0 ? 'warning' : undefined,
            sub: s.membership
              ? t('patients.rec.wallet', { plan: s.membership, amount: inr(s.wallet) })
              : undefined,
          },
        ]}
      />
      {s.conditions.length > 0 && (
        <p className="text-sm text-muted">
          {t('patients.rec.conditions', { list: s.conditions.join(', ') })}
        </p>
      )}
    </div>
  );
}

/** One of the record's lists (visits, admissions, reports, prescriptions), paged. */
function Section({ patientId, section, caption, empty, columns }) {
  const [page, setPage] = useUrlState('p', '1');
  const q = usePatientSectionQuery({ id: patientId, section, page: Number(page) || 1, limit: 25 });
  return (
    <QueryView query={q} rows={4}>
      {(d) => (
        <Card padding={false}>
          <DataTable
            caption={caption}
            data={d.items}
            empty={empty}
            columns={columns}
            total={d.total}
            page={d.page}
            limit={d.limit}
            onPageChange={(n) => setPage(String(n))}
          />
        </Card>
      )}
    </QueryView>
  );
}

export function VisitsTab({ patientId }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  return (
    <Section
      patientId={patientId}
      section="visits"
      caption={t('patients.rec.visits')}
      empty={t('patients.rec.noVisits')}
      columns={[
        {
          id: 'date',
          header: t('patients.rec.date'),
          cell: ({ row }) => fmtDate(row.original.date, locale),
        },
        {
          id: 'doctor',
          header: t('patients.rec.doctor'),
          cell: ({ row }) => row.original.doctor ?? '',
        },
        {
          id: 'dept',
          header: t('patients.rec.department'),
          cell: ({ row }) => row.original.department ?? '',
        },
        {
          id: 'type',
          header: t('patients.rec.type'),
          cell: ({ row }) =>
            row.original.type
              ? t(`patients.rec.visitType.${row.original.type}`, {
                  defaultValue: row.original.type,
                })
              : '',
        },
        {
          id: 'dx',
          header: t('patients.rec.diagnosis'),
          cell: ({ row }) => row.original.diagnosis ?? '',
        },
      ]}
    />
  );
}

export function AdmissionsTab({ patientId }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  return (
    <Section
      patientId={patientId}
      section="admissions"
      caption={t('patients.rec.admissions')}
      empty={t('patients.rec.noAdmissions')}
      columns={[
        {
          id: 'ip',
          header: t('patients.rec.ipNo'),
          cell: ({ row }) => <span className="font-mono">{row.original.ipNo}</span>,
        },
        {
          id: 'in',
          header: t('patients.rec.admitted'),
          cell: ({ row }) => fmtDateTime(row.original.admittedAt, locale),
        },
        {
          id: 'out',
          header: t('patients.rec.discharged'),
          cell: ({ row }) =>
            row.original.dischargedAt ? fmtDateTime(row.original.dischargedAt, locale) : '',
        },
        {
          id: 'bed',
          header: t('patients.rec.bed'),
          cell: ({ row }) => [row.original.ward, row.original.bed].filter(Boolean).join(' · '),
        },
        {
          id: 'cons',
          header: t('patients.rec.consultant'),
          cell: ({ row }) => row.original.consultant ?? '',
        },
        {
          id: 'status',
          header: t('patients.rec.status'),
          cell: ({ row }) => (
            <StatusBadge
              tone={STAY_TONE[row.original.status] ?? 'info'}
              label={t(`patients.rec.stay.${row.original.status}`, {
                defaultValue: row.original.status,
              })}
            />
          ),
        },
      ]}
    />
  );
}

export function ReportsTab({ patientId }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  return (
    <Section
      patientId={patientId}
      section="reports"
      caption={t('patients.rec.reports')}
      empty={t('patients.rec.noReports')}
      columns={[
        {
          id: 'date',
          header: t('patients.rec.date'),
          cell: ({ row }) => fmtDate(row.original.date, locale),
        },
        { id: 'name', header: t('patients.rec.test'), cell: ({ row }) => row.original.name },
        {
          id: 'kind',
          header: t('patients.rec.kindLabel'),
          cell: ({ row }) => t(`patients.rec.kind.${row.original.kind}`),
        },
        {
          id: 'status',
          header: t('patients.rec.status'),
          cell: ({ row }) =>
            row.original.status === 'RELEASED' ? (
              t('patients.rec.ready')
            ) : (
              <span className="text-muted">{t('patients.rec.inProgress')}</span>
            ),
        },
        {
          id: 'flag',
          header: t('patients.rec.result'),
          cell: ({ row }) =>
            row.original.flag ? (
              <StatusBadge
                tone={FLAG_TONE[row.original.flag]}
                label={[t(`patients.rec.flag.${row.original.flag}`), row.original.flagText]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ) : (
              ''
            ),
        },
      ]}
    />
  );
}

export function MedicinesTab({ patientId }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  return (
    <Section
      patientId={patientId}
      section="prescriptions"
      caption={t('patients.rec.medicines')}
      empty={t('patients.rec.noMedicines')}
      columns={[
        { id: 'med', header: t('patients.rec.medicine'), cell: ({ row }) => row.original.medicine },
        { id: 'dose', header: t('patients.rec.dose'), cell: ({ row }) => row.original.dose ?? '' },
        {
          id: 'since',
          header: t('patients.rec.since'),
          cell: ({ row }) => fmtDate(row.original.since, locale),
        },
        {
          id: 'until',
          header: t('patients.rec.until'),
          cell: ({ row }) => (row.original.until ? fmtDate(row.original.until, locale) : ''),
        },
        { id: 'by', header: t('patients.rec.by'), cell: ({ row }) => row.original.by ?? '' },
      ]}
    />
  );
}
