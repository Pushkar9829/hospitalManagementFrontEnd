import { useTranslation } from 'react-i18next';
import { PatientBanner, StatusBadge } from '@hms/ui';
import { RISK_TONE, STAY_TONE } from '../ipd.js';

/** Who and where: the patient banner with the IP number, bed, day of stay and last NEWS2. */
export function StayHeader({ stay, news2 }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <PatientBanner
        name={stay.patient.name}
        age={stay.patient.age}
        sex={stay.patient.gender}
        uhid={stay.patient.uhid}
        ipNo={stay.ipNo}
        bed={stay.bed?.code}
        allergies={stay.patient.allergies}
        consultant={stay.consultant?.name}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge tone={STAY_TONE[stay.status]} label={t(`ipd.stay.${stay.status}`)} />
        <span className="text-muted">{t('ipd.beds.dayN', { n: stay.day })}</span>
        <span className="text-muted">· {stay.reason}</span>
        {stay.emergency && <StatusBadge tone="warning" label={t('ipd.urgency.EMERGENCY')} />}
        {stay.mlc && <StatusBadge tone="critical" label={t('ipd.stay.mlc')} />}
        {news2 && (
          <StatusBadge
            tone={RISK_TONE[news2.risk]}
            label={t('ipd.news2.badge', {
              score: news2.score,
              risk: t(`ipd.news2.risk.${news2.risk}`),
            })}
          />
        )}
      </div>
    </div>
  );
}
