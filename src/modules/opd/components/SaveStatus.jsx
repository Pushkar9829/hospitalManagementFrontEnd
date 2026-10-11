import { useTranslation } from 'react-i18next';
import { fmtTime, localeOf } from '../../dx-kit/format.js';

/** Auto-save status: saving, saved at, or kept on the device after a failure. */
export function SaveStatus({ state, savedAt }) {
  const { t, i18n } = useTranslation();
  if (state === 'saving')
    return <span className="text-sm text-muted">{t('opd.consult.saving')}</span>;
  if (state === 'failed')
    return (
      <span role="alert" className="text-sm text-critical">
        {t('opd.consult.saveFailed')}
      </span>
    );
  if (!savedAt) return null;
  return (
    <span className="text-sm text-muted">
      {t('opd.consult.savedAt', { time: fmtTime(savedAt, localeOf(i18n)) })}
    </span>
  );
}
