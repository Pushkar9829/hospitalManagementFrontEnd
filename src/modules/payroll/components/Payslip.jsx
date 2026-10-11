import { useTranslation } from 'react-i18next';
import { cn } from '@hms/ui';
import { inr } from '../../../lib/money.js';

function Lines({ title, lines, total }) {
  return (
    <div className="min-w-48 flex-1">
      <h4 className="mb-1 text-xs font-semibold text-muted uppercase">{title}</h4>
      <ul className="flex flex-col gap-0.5">
        {lines.map((l) => (
          <li key={l.code} className="flex justify-between gap-3">
            <span>{l.name}</span>
            <span className="tabular">{inr(l.amount)}</span>
          </li>
        ))}
      </ul>
      {total != null && (
        <p className="mt-1 flex justify-between gap-3 border-t border-line pt-1 font-semibold">
          <span />
          <span className="tabular">{inr(total)}</span>
        </p>
      )}
    </div>
  );
}

/** A payslip's earnings, deductions, employer contributions and net pay. */
export function Payslip({ slip: p, className }) {
  const { t } = useTranslation();
  return (
    <div className={cn('rounded-control border border-line p-3 text-sm', className)}>
      <p className="mb-2 text-muted">
        {t('pay.slip.days', { payable: p.payableDays, days: p.days, lop: p.lop })}
        {p.bank && ` · ${t('pay.slip.bank', { bank: p.bank.name, account: p.bank.accountNo })}`}
      </p>
      <div className="flex flex-wrap gap-6">
        <Lines title={t('pay.slip.earnings')} lines={p.earnings} total={p.gross} />
        <Lines title={t('pay.slip.deductions')} lines={p.deductions} total={p.totalDeductions} />
        {p.employer?.length > 0 && <Lines title={t('pay.slip.employer')} lines={p.employer} />}
      </div>
      <p className="mt-3 flex justify-between rounded-control bg-surface-2 px-3 py-2 font-semibold">
        <span>{t('pay.slip.net')}</span>
        <span className="tabular">{inr(p.net)}</span>
      </p>
    </div>
  );
}
