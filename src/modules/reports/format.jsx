import { StatusBadge } from '@hms/ui';
import { inr } from '../../lib/money.js';
import { fmtDate } from '../dx-kit/format.js';

const dateTime = (v) =>
  new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(v));

/** A report value by its kind (money in paise; status as a badge). */
export function ReportValue({ kind, value, t }) {
  if (value == null || value === '') return <span className="text-muted">–</span>;
  switch (kind) {
    case 'money':
      return inr(value);
    case 'percent':
      return `${value}%`;
    case 'minutes':
      return t('rep.unit.minutes', { n: value });
    case 'days':
      return t('rep.unit.days', { n: value });
    case 'date':
      return fmtDate(value);
    case 'datetime':
      return dateTime(value);
    case 'count':
    case 'number':
      return Number(value).toLocaleString('en-IN');
    case 'status':
      return <StatusBadge tone={value.tone ?? 'neutral'} label={value.label} />;
    default:
      return String(value);
  }
}
