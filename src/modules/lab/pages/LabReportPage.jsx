import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import { addLabStrings } from '@hms/i18n/lab';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import { Button, Card, Page, PageHeader, PatientBanner, StatusBadge } from '@hms/ui';
import { useStrings } from '../../../lib/useStrings.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDate, fmtDateTime, localeOf } from '../../dx-kit/format.js';
import { useLabReportQuery } from '../api.js';
import { STATUS_TONE } from '../lab.js';
import { ResultsTable } from '../components/ResultsTable.jsx';

/**
 * Lab report for one order (route /lab/report/:orderNo): released tests only, with range, flag,
 * the previous values, method, NABL mark and who released it; tests still in progress are listed
 * without values. Prints from the browser.
 */
export default function LabReportPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addLabStrings);
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { orderNo } = useParams();
  const q = useLabReportQuery(orderNo);
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('lab.crumb') }, { label: t('lab.report.title') }]}
        title={t('lab.report.title')}
        description={orderNo}
        actions={
          <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
            <Printer size={16} aria-hidden="true" />
            {t('lab.report.print')}
          </Button>
        }
      />
      <QueryView query={q} rows={8}>
        {(r) => (
          <div className="flex flex-col gap-4">
            <Card>
              <PatientBanner
                name={r.patient.name}
                age={r.patient.age}
                sex={r.patient.gender}
                uhid={r.patient.uhid}
                bed={r.location ?? undefined}
                consultant={r.doctor ?? undefined}
              />
              <p className="mt-2 text-sm text-muted">
                {t('lab.report.ordered', { time: fmtDateTime(r.orderedAt, locale) })}
              </p>
            </Card>
            {r.tests.map((x) => (
              <Card key={x.id}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink">{x.name}</h2>
                  {x.nabl && <StatusBadge tone="info" label={t('lab.report.nabl')} />}
                  {x.reportVersion > 1 && (
                    <StatusBadge
                      tone="warning"
                      label={t('lab.report.amended', { v: x.reportVersion })}
                    />
                  )}
                  <span className="text-sm text-muted">
                    {[x.method, x.sampleNo && t('lab.sampleNo', { no: x.sampleNo })]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <ResultsTable results={x.results} caption={x.name} />
                {x.trend.length > 0 && (
                  <p className="mt-2 text-sm text-muted">
                    {t('lab.report.trend')}{' '}
                    {x.trend
                      .map(
                        (p) =>
                          `${fmtDate(p.at, locale)}: ${Object.entries(p.values)
                            .slice(0, 3)
                            .map(([k, v]) => `${k} ${v}`)
                            .join(', ')}`,
                      )
                      .join(' · ')}
                  </p>
                )}
                {x.comment && <p className="mt-2 text-sm whitespace-pre-line">{x.comment}</p>}
                <p className="mt-2 text-sm text-muted">
                  {t('lab.report.releasedBy', {
                    by: x.releasedBy,
                    time: fmtDateTime(x.releasedAt, locale),
                  })}
                </p>
              </Card>
            ))}
            {r.pending.length > 0 && (
              <Card title={t('lab.report.pending')}>
                <ul className="flex flex-wrap gap-2">
                  {r.pending.map((p) => (
                    <li key={p.code}>
                      <StatusBadge
                        tone={STATUS_TONE[p.status]}
                        label={`${p.name} · ${t(`lab.status.${p.status}`)}`}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <p className="text-sm text-muted">{t('lab.report.footer')}</p>
          </div>
        )}
      </QueryView>
    </Page>
  );
}
