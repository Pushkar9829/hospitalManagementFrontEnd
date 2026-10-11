import { useTranslation } from 'react-i18next';
import { addAdminStrings } from '@hms/i18n/admin';
import { addOpdStrings } from '@hms/i18n/opd';
import { addPatientsStrings } from '@hms/i18n/patients';
import { addDxkitStrings } from '@hms/i18n/dxkit';
import { Card, EmptyState, Page, PageHeader } from '@hms/ui';
import { useCan } from '../../../lib/useCan.js';
import { useStrings } from '../../../lib/useStrings.js';
import { useUrlState } from '../../../lib/useUrlState.js';
import { PickList } from '../../dx-kit/PickList.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { UrlTabs } from '../../dx-kit/UrlTabs.jsx';
import { useOpdScheduleQuery, useOpdSchedulesQuery, useOpdSettingsQuery } from '../api.js';
import { BookingRulesForm, CancellationForm } from '../components/RuleForms.jsx';
import { ScheduleEditor } from '../components/ScheduleEditor.jsx';
import { DisplayKeysTab } from '../components/DisplayKeysTab.jsx';
import {
  MessagesTab,
  TemplatesTab,
  TokenSeriesTab,
  VisitTypesTab,
} from '../components/SettingsLists.jsx';

/** Doctor schedules: the doctors on the left, the picked doctor's week and fees on the right. */
function SchedulesTab({ canEdit }) {
  const { t } = useTranslation();
  const [doctorId, setDoctorId] = useUrlState('id', '');
  const list = useOpdSchedulesQuery();
  const items = list.data?.items ?? [];
  const current = doctorId || items[0]?.doctorId || '';
  const schedule = useOpdScheduleQuery(current, { skip: !current });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr]">
      <Card title={t('opd.cfg.sched.doctors')}>
        <QueryView query={list} empty={t('opd.sched.empty')} isEmpty={(d) => !d.items.length}>
          {(data) => (
            <PickList
              label={t('opd.cfg.sched.doctors')}
              selectedId={current}
              onPick={setDoctorId}
              items={data.items.map((s) => ({
                id: s.doctorId,
                title: s.doctor.name,
                sub: t('opd.cfg.sched.perWeek', {
                  department: s.doctor.department,
                  count: s.sessionsPerWeek,
                }),
              }))}
            />
          )}
        </QueryView>
      </Card>
      {current ? (
        <QueryView query={schedule} rows={8}>
          {(s) => <ScheduleEditor key={s.doctorId} schedule={s} canEdit={canEdit} />}
        </QueryView>
      ) : (
        <EmptyState title={t('opd.cfg.sched.pick')} />
      )}
    </div>
  );
}

/** The two rule forms read GET /opd/settings once; each saves its own section. */
function RulesTab({ section, canEdit }) {
  const settings = useOpdSettingsQuery();
  return (
    <QueryView query={settings} rows={6}>
      {(s) =>
        section === 'booking' ? (
          <BookingRulesForm settings={s} canEdit={canEdit} />
        ) : (
          <CancellationForm settings={s} canEdit={canEdit} />
        )
      }
    </QueryView>
  );
}

/**
 * OPD settings (board OpdConfig, route /settings/opd): doctor schedules and fees
 * (CRUD /opd/schedules), booking rules, token series and TV displays, cancellation and no-show
 * (saved for approval), patient messages, visit types and consultation templates
 * (PUT /opd/settings and the OPD masters).
 */
export default function OpdSettingsPage() {
  useStrings(addAdminStrings, addPatientsStrings, addDxkitStrings, addOpdStrings);
  const { t } = useTranslation();
  const can = useCan();
  const canSchedule = can('opd:schedule:update');
  const canSettings = can('opd:settings:update');
  return (
    <Page>
      <PageHeader
        breadcrumb={[{ label: t('opd.cfg.crumb') }, { label: t('opd.cfg.title') }]}
        title={t('opd.cfg.title')}
        description={t('opd.cfg.description')}
      />
      <UrlTabs
        label={t('opd.cfg.tabs.label')}
        tabs={[
          {
            id: 'schedules',
            label: t('opd.cfg.tabs.schedules'),
            body: <SchedulesTab canEdit={canSchedule} />,
          },
          {
            id: 'booking',
            label: t('opd.cfg.tabs.booking'),
            body: <RulesTab section="booking" canEdit={canSettings} />,
          },
          {
            id: 'tokens',
            label: t('opd.cfg.tabs.tokens'),
            body: <TokenSeriesTab canEdit={canSettings} />,
          },
          {
            id: 'cancellation',
            label: t('opd.cfg.tabs.cancellation'),
            body: <RulesTab section="cancellation" canEdit={canSettings} />,
          },
          {
            id: 'messages',
            label: t('opd.cfg.tabs.messages'),
            body: <MessagesTab canEdit={canSettings} />,
          },
          {
            id: 'visitTypes',
            label: t('opd.cfg.tabs.visitTypes'),
            body: <VisitTypesTab canEdit={canSettings} />,
          },
          {
            id: 'templates',
            label: t('opd.cfg.tabs.templates'),
            body: <TemplatesTab canEdit={canSettings} />,
          },
          (can('opd:settings:read') || canSettings) && {
            id: 'tvs',
            label: t('opd.cfg.tabs.tvs'),
            body: <DisplayKeysTab canEdit={canSettings} />,
          },
        ]}
      />
    </Page>
  );
}
