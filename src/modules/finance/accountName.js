import { useTranslation } from 'react-i18next';

/**
 * A ledger's name in the reader's language. The built-in chart of accounts is stored in English;
 * a built-in account keeps its translation while the hospital has not renamed it, and a ledger
 * the hospital added shows as it was typed.
 */
export function useAccountName() {
  const { t } = useTranslation();
  return (code, name) => {
    const key = `fin.chart.names.${code}`;
    const english = t(key, { lng: 'en', defaultValue: '' });
    return english && english === name ? t(key, { defaultValue: name }) : name;
  };
}
