import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addLabStrings } from '@hms/i18n/lab';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Page,
  PageHeader,
  PatientBanner,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { PickList } from '../../dx-kit/PickList.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { fmtDateTime, localeOf } from '../../dx-kit/format.js';
import {
  useHistoCaseQuery,
  useHistoCasesQuery,
  useReportHistoCaseMutation,
  useSaveHistoCaseMutation,
} from '../api.js';
import { ArchiveTab, StainsTab, TurnaroundTab } from '../components/Registers.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';

const STEPS = ['RECEIVED', 'GROSSED', 'PROCESSED', 'SLIDES', 'REPORTED'];
const CASE_TONE = {
  RECEIVED: 'neutral',
  GROSSED: 'info',
  PROCESSED: 'info',
  SLIDES: 'warning',
  REPORTED: 'success',
};

function CaseEditor({ c, canWork }) {
  const { t, i18n } = useTranslation();
  const locale = localeOf(i18n);
  const { toast } = useToast();
  const [v, setV] = useState(() => ({
    specimen: c.specimen ?? '',
    fixative: c.fixative ?? '',
    gross: c.gross ?? '',
    blocks: c.blocks ?? '',
    slides: c.slides ?? '',
    microscopy: c.microscopy ?? '',
    diagnosis: c.diagnosis ?? '',
    icdO: c.icdO ?? '',
    archive: c.archive ?? '',
  }));
  const [failure, setFailure] = useState(null);
  const [save, saving] = useSaveHistoCaseMutation();
  const [report, reporting] = useReportHistoCaseMutation();
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const body = (advance) => ({
    id: c.id,
    advance,
    ...Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== '')
        .map(([k, x]) => [k, k === 'blocks' || k === 'slides' ? Number(x) : x]),
    ),
  });
  const act = async (fn, title) => {
    setFailure(null);
    try {
      await fn();
      toast({ tone: 'success', title });
    } catch (err) {
      setFailure(err);
    }
  };
  const done = c.status === 'REPORTED';
  const nextStep = STEPS[STEPS.indexOf(c.status) + 1];
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <PatientBanner
          name={c.patient.name}
          age={c.patient.age}
          sex={c.patient.gender}
          uhid={c.patient.uhid}
          bed={c.location ?? undefined}
        />
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{c.caseNo}</h2>
          <StatusBadge tone={CASE_TONE[c.status]} label={t(`lab.histo.status.${c.status}`)} />
          <span className="text-sm text-muted">
            {c.test} · {t('lab.histo.days', { count: c.workingDays })}
          </span>
        </div>
        <ol className="flex flex-wrap gap-2 text-sm" aria-label={t('lab.histo.stepsLabel')}>
          {STEPS.map((s) => {
            const at = c.history.find((h) => h.status === s);
            return (
              <li
                key={s}
                className={`rounded-control border px-2 py-1 ${at ? 'border-success bg-success-bg' : 'border-line text-muted'}`}
              >
                {t(`lab.histo.status.${s}`)}
                {at && <span className="text-muted"> · {fmtDateTime(at.at, locale)}</span>}
              </li>
            );
          })}
        </ol>
        {c.clinicalNotes && <p className="text-sm">{c.clinicalNotes}</p>}
        <ApiErrorNotice error={failure} />
        <fieldset disabled={!canWork || done} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField label={t('lab.histo.f.specimen')}>
              <Input value={v.specimen} onChange={set('specimen')} />
            </FormField>
            <FormField label={t('lab.histo.f.fixative')}>
              <Input value={v.fixative} onChange={set('fixative')} />
            </FormField>
          </div>
          <FormField label={t('lab.histo.f.gross')} required={c.status === 'RECEIVED'}>
            <Textarea rows={3} value={v.gross} onChange={set('gross')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <FormField label={t('lab.histo.f.blocks')}>
              <Input type="number" value={v.blocks} onChange={set('blocks')} />
            </FormField>
            <FormField label={t('lab.histo.f.slides')}>
              <Input type="number" value={v.slides} onChange={set('slides')} />
            </FormField>
            <FormField label={t('lab.histo.f.archive')}>
              <Input value={v.archive} onChange={set('archive')} />
            </FormField>
          </div>
          <FormField label={t('lab.histo.f.microscopy')}>
            <Textarea rows={4} value={v.microscopy} onChange={set('microscopy')} />
          </FormField>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_10rem]">
            <FormField label={t('lab.histo.f.diagnosis')} required={c.status === 'SLIDES'}>
              <Textarea rows={2} value={v.diagnosis} onChange={set('diagnosis')} />
            </FormField>
            <FormField label={t('lab.histo.f.icdO')} optional>
              <Input mono value={v.icdO} onChange={set('icdO')} />
            </FormField>
          </div>
        </fieldset>
        {canWork && !done && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={saving.isLoading}
              onClick={() => act(() => save(body(false)).unwrap(), t('lab.histo.saved'))}
            >
              {t('lab.histo.save')}
            </Button>
            {nextStep && nextStep !== 'REPORTED' && (
              <Button
                loading={saving.isLoading}
                onClick={() =>
                  act(
                    () => save(body(true)).unwrap(),
                    t('lab.histo.moved', { step: t(`lab.histo.status.${nextStep}`) }),
                  )
                }
              >
                {t('lab.histo.advance', { step: t(`lab.histo.status.${nextStep}`) })}
              </Button>
            )}
            {c.status === 'SLIDES' && (
              <Button
                loading={reporting.isLoading}
                disabled={!v.diagnosis.trim()}
                onClick={() =>
                  act(async () => {
                    await save(body(false)).unwrap();
                    await report(c.id).unwrap();
                  }, t('lab.histo.reported'))
                }
              >
                {t('lab.histo.report')}
              </Button>
            )}
          </div>
        )}
        {done && (
          <p className="text-sm text-muted">
            {t('lab.histo.reportedBy', {
              by: c.reportedBy,
              time: fmtDateTime(c.reportedAt, locale),
            })}
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * Histopathology (board LabHisto, route /lab/histo): cases from receipt in formalin through
 * grossing, processing and slides to the signed-out diagnosis, which then goes for release
 * (two-step rule). Target: 3 working days.
 */
function CasesTab() {
  const { t } = useTranslation();
  const can = useCan();
  const [id, setId] = useUrlState('id', '');
  const [show, setShow] = useUrlState('show', 'open');
  const list = useHistoCasesQuery({ open: show === 'open' });
  const items = list.data?.items ?? [];
  const current = items.some((c) => c.id === id) ? id : (items[0]?.id ?? '');
  const one = useHistoCaseQuery(current, { skip: !current });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
      <Card title={t('lab.histo.cases', { count: items.length })}>
        <Select
          aria-label={t('lab.micro.show')}
          className="mb-3"
          value={show}
          onChange={(e) => setShow(e.target.value)}
          options={[
            { value: 'open', label: t('lab.histo.showOpen') },
            { value: 'all', label: t('lab.histo.showAll') },
          ]}
        />
        <QueryView
          query={list}
          empty={<EmptyState bordered={false} title={t('lab.histo.none')} />}
          isEmpty={(d) => !d.items.length}
        >
          {(d) => (
            <PickList
              label={t('lab.histo.title')}
              selectedId={current}
              onPick={(v) => setId(v)}
              items={d.items.map((c) => ({
                id: c.id,
                lead: c.caseNo,
                title: c.patient.name,
                sub: [c.test, c.location].filter(Boolean).join(' · '),
                badge:
                  c.workingDays > 3 && c.status !== 'REPORTED'
                    ? { tone: 'critical', label: t('lab.histo.late') }
                    : { tone: CASE_TONE[c.status], label: t(`lab.histo.status.${c.status}`) },
              }))}
            />
          )}
        </QueryView>
      </Card>
      {current ? (
        <QueryView query={one} rows={8}>
          {(c) => (
            <CaseEditor key={`${c.id}-${c.status}`} c={c} canWork={can('lab:histo:update')} />
          )}
        </QueryView>
      ) : (
        <EmptyState title={t('lab.histo.pick')} />
      )}
    </div>
  );
}

/** Histopathology: cases, special stains, the blocks and slides archive, and turnaround. */
export default function LabHistoPage() {
  useStrings(addPatientsStrings, addDxkitStrings, addLabStrings);
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('lab.crumb') }, { label: t('lab.histo.title') }]}
        title={t('lab.histo.title')}
        description={t('lab.histo.description')}
      />
      <UrlTabs
        param="tab"
        label={t('lab.histo.title')}
        reset={['id', 'show']}
        tabs={[
          { id: 'cases', label: t('lab.reg.tabs.cases'), body: <CasesTab /> },
          { id: 'stains', label: t('lab.reg.tabs.stains'), body: <StainsTab /> },
          { id: 'archive', label: t('lab.reg.tabs.archive'), body: <ArchiveTab /> },
          { id: 'turnaround', label: t('lab.reg.tabs.turnaround'), body: <TurnaroundTab /> },
        ]}
      />
    </Page>
  );
}
