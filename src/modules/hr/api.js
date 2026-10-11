import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/* HR, rosters, My Space and payroll (apps/api/src/modules/hr, payroll). Money in paise. */

const post = (url, body = {}) => ({ url, method: 'POST', body });
const put = (url, body = {}) => ({ url, method: 'PUT', body });
const HR = ['HrEmployees', 'HrEmployee', 'HrLeave', 'HrAttendance', 'HrAlerts', 'HrBalances'];
const ROSTER = ['HrRoster', 'HrSwaps'];
const ME = ['MeTax', 'MeEmployee', 'MeLeave', 'MeAttendance', 'MePayslips'];
const PAY = [
  'PayDeclarations',
  'PayRuns',
  'PayRun',
  'PaySlips',
  'PayStructures',
  'PayLoans',
  'PaySettings',
  'PayGratuity',
  'PayBonus',
  'PayTds',
];

export const hrApi = baseApi
  .enhanceEndpoints({ addTagTypes: [...HR, ...ROSTER, ...ME, ...PAY, 'HrSettings', 'HrTalent'] })
  .injectEndpoints({
    endpoints: (b) => ({
      // Talent: recruitment, training, appraisal, exits (/hr/...) and my appraisal (/me/...).
      talent: b.query({
        query: ({ path, params }) => ({ url: path, params: cleanParams(params ?? {}) }),
        providesTags: ['HrTalent'],
      }),
      talentWrite: b.mutation({
        query: ({ method = 'POST', path, body }) => ({ url: path, method, body }),
        invalidatesTags: ['HrTalent', 'HrEmployees', 'HrEmployee'],
      }),
      hrSettings: b.query({ query: () => '/hr/settings', providesTags: ['HrSettings'] }),
      employees: b.query({
        query: (params = {}) => ({ url: '/hr/employees', params: cleanParams(params) }),
        providesTags: ['HrEmployees'],
      }),
      employee: b.query({ query: (id) => `/hr/employees/${id}`, providesTags: ['HrEmployee'] }),
      createEmployee: b.mutation({
        query: (body) => post('/hr/employees', body),
        invalidatesTags: ['HrEmployees', 'HrAttendance'],
      }),
      updateEmployee: b.mutation({
        query: ({ id, ...body }) => put(`/hr/employees/${id}`, body),
        invalidatesTags: ['HrEmployees', 'HrEmployee'],
      }),
      exitEmployee: b.mutation({
        query: ({ id, ...body }) => post(`/hr/employees/${id}/exit`, body),
        invalidatesTags: ['HrEmployees', 'HrEmployee'],
      }),
      credentialAlerts: b.query({
        query: () => '/hr/credential-alerts',
        providesTags: ['HrAlerts'],
      }),
      employeeBalances: b.query({
        query: (id) => `/hr/employees/${id}/leave-balances`,
        providesTags: ['HrBalances'],
      }),
      leaveRequests: b.query({
        query: (params = {}) => ({ url: '/hr/leave-requests', params: cleanParams(params) }),
        providesTags: ['HrLeave'],
      }),
      decideLeave: b.mutation({
        query: ({ id, ...body }) => post(`/hr/leave-requests/${id}/decision`, body),
        invalidatesTags: ['HrLeave', 'HrBalances', 'HrAttendance', 'HrRoster', 'MeLeave'],
      }),
      attendance: b.query({
        query: (params) => ({ url: '/hr/attendance', params: cleanParams(params) }),
        providesTags: ['HrAttendance'],
      }),
      importPunches: b.mutation({
        query: (body) => post('/hr/attendance/import', body),
        invalidatesTags: ['HrAttendance'],
      }),
      markAttendance: b.mutation({
        query: (body) => put('/hr/attendance', body),
        invalidatesTags: ['HrAttendance'],
      }),
      lockAttendance: b.mutation({
        query: (body) => post('/hr/attendance/lock', body),
        invalidatesTags: ['HrAttendance', 'PayRuns'],
      }),
      roster: b.query({
        query: (params) => ({ url: '/hr/rosters', params: cleanParams(params) }),
        providesTags: ['HrRoster'],
      }),
      saveRoster: b.mutation({
        query: (body) => put('/hr/rosters', body),
        invalidatesTags: ['HrRoster'],
      }),
      swaps: b.query({
        query: (params = {}) => ({ url: '/hr/swaps', params: cleanParams(params) }),
        providesTags: ['HrSwaps'],
      }),
      requestSwap: b.mutation({
        query: (body) => post('/hr/swaps', body),
        invalidatesTags: ['HrSwaps'],
      }),
      decideSwap: b.mutation({
        query: ({ id, approve }) => post(`/hr/swaps/${id}/decision`, { approve }),
        invalidatesTags: ['HrSwaps', 'HrRoster'],
      }),

      // My Space
      myEmployee: b.query({ query: () => '/me/employee', providesTags: ['MeEmployee'] }),
      myLeave: b.query({ query: () => '/me/leave', providesTags: ['MeLeave'] }),
      applyLeave: b.mutation({
        query: (body) => post('/me/leave', body),
        invalidatesTags: ['MeLeave', 'HrLeave'],
      }),
      cancelLeave: b.mutation({
        query: (id) => post(`/me/leave/${id}/cancel`),
        invalidatesTags: ['MeLeave', 'HrLeave'],
      }),
      myAttendance: b.query({
        query: (month) => ({ url: '/me/attendance', params: { month } }),
        providesTags: ['MeAttendance'],
      }),
      myPayslips: b.query({ query: () => '/payroll/payslips/me', providesTags: ['MePayslips'] }),
      myProfileChanges: b.query({
        query: () => '/me/profile-changes',
        providesTags: ['MeEmployee'],
      }),
      requestProfileChange: b.mutation({
        query: (body) => post('/me/profile-changes', body),
        invalidatesTags: ['MeEmployee'],
      }),
      myTaxDeclaration: b.query({ query: () => '/me/tax-declaration', providesTags: ['MeTax'] }),
      saveTaxDeclaration: b.mutation({
        query: (body) => ({ url: '/me/tax-declaration', method: 'PUT', body }),
        invalidatesTags: ['MeTax', 'PayDeclarations'],
      }),
      taxDeclarations: b.query({
        query: (params = {}) => ({ url: '/payroll/tax-declarations', params: cleanParams(params) }),
        providesTags: ['PayDeclarations'],
      }),
      reviewDeclaration: b.mutation({
        query: ({ id, ...body }) => post(`/payroll/tax-declarations/${id}/review`, body),
        invalidatesTags: ['PayDeclarations'],
      }),

      // Payroll
      structures: b.query({
        query: (id) => `/payroll/employees/${id}/structures`,
        providesTags: ['PayStructures'],
      }),
      proposeStructure: b.mutation({
        query: ({ id, ...body }) => post(`/payroll/employees/${id}/structures`, body),
        invalidatesTags: ['PayStructures'],
      }),
      loans: b.query({
        query: (id) => `/payroll/employees/${id}/loans`,
        providesTags: ['PayLoans'],
      }),
      createLoan: b.mutation({
        query: ({ id, ...body }) => post(`/payroll/employees/${id}/loans`, body),
        invalidatesTags: ['PayLoans'],
      }),
      payRuns: b.query({ query: () => '/payroll/runs', providesTags: ['PayRuns'] }),
      payRun: b.query({ query: (id) => `/payroll/runs/${id}`, providesTags: ['PayRun'] }),
      createRun: b.mutation({
        query: (body) => post('/payroll/runs', body),
        invalidatesTags: ['PayRuns'],
      }),
      setRunInputs: b.mutation({
        query: ({ id, inputs }) => put(`/payroll/runs/${id}/inputs`, { inputs }),
        invalidatesTags: ['PayRun', 'PayRuns'],
      }),
      calculateRun: b.mutation({
        query: (id) => post(`/payroll/runs/${id}/calculate`),
        invalidatesTags: ['PayRun', 'PayRuns', 'PaySlips'],
      }),
      submitRun: b.mutation({
        query: (id) => post(`/payroll/runs/${id}/submit`),
        invalidatesTags: ['PayRun', 'PayRuns'],
      }),
      runPayslips: b.query({
        query: (id) => `/payroll/runs/${id}/payslips`,
        providesTags: ['PaySlips'],
      }),
      bankFile: b.query({ query: (id) => `/payroll/runs/${id}/bank-file` }),
      pfEcr: b.query({ query: (id) => `/payroll/runs/${id}/pf-ecr` }),
      paySettings: b.query({ query: () => '/payroll/settings', providesTags: ['PaySettings'] }),
      savePaySettings: b.mutation({
        query: (body) => put('/payroll/settings', body),
        invalidatesTags: ['PaySettings', 'PayTds'],
      }),
      gratuity: b.query({
        query: (params = {}) => ({ url: '/payroll/gratuity', params: cleanParams(params) }),
        providesTags: ['PayGratuity'],
      }),
      bonusRuns: b.query({ query: () => '/payroll/bonus', providesTags: ['PayBonus'] }),
      draftBonus: b.mutation({
        query: (body) => post('/payroll/bonus', body),
        invalidatesTags: ['PayBonus'],
      }),
      tdsYear: b.query({
        query: (params) => ({ url: '/payroll/tds', params: cleanParams(params) }),
        providesTags: ['PayTds'],
      }),
      recordChallan: b.mutation({
        query: (body) => post('/payroll/tds/challans', body),
        invalidatesTags: ['PayTds'],
      }),
      return24Q: b.query({
        query: (params) => ({ url: '/payroll/tds/24q', params }),
        providesTags: ['PayTds'],
      }),
      form16List: b.query({
        query: (params) => ({ url: '/payroll/form16', params: cleanParams(params) }),
        providesTags: ['PayTds'],
      }),
      payBonus: b.mutation({
        query: ({ id, version }) => post(`/payroll/bonus/${id}/pay`, { version }),
        invalidatesTags: ['PayBonus'],
      }),
    }),
  });

export const {
  useTalentQuery,
  useTalentWriteMutation,
  useHrSettingsQuery,
  useEmployeesQuery,
  useEmployeeQuery,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useExitEmployeeMutation,
  useCredentialAlertsQuery,
  useEmployeeBalancesQuery,
  useLeaveRequestsQuery,
  useDecideLeaveMutation,
  useAttendanceQuery,
  useImportPunchesMutation,
  useMarkAttendanceMutation,
  useLockAttendanceMutation,
  useRosterQuery,
  useSaveRosterMutation,
  useSwapsQuery,
  useRequestSwapMutation,
  useDecideSwapMutation,
  useMyEmployeeQuery,
  useMyLeaveQuery,
  useApplyLeaveMutation,
  useCancelLeaveMutation,
  useMyAttendanceQuery,
  useMyPayslipsQuery,
  useMyProfileChangesQuery,
  useRequestProfileChangeMutation,
  useMyTaxDeclarationQuery,
  useSaveTaxDeclarationMutation,
  useTaxDeclarationsQuery,
  useReviewDeclarationMutation,
  useStructuresQuery,
  useProposeStructureMutation,
  useLoansQuery,
  useCreateLoanMutation,
  usePayRunsQuery,
  usePayRunQuery,
  useCreateRunMutation,
  useSetRunInputsMutation,
  useCalculateRunMutation,
  useSubmitRunMutation,
  useRunPayslipsQuery,
  useLazyBankFileQuery,
  usePfEcrQuery,
  usePaySettingsQuery,
  useSavePaySettingsMutation,
  useGratuityQuery,
  useBonusRunsQuery,
  useDraftBonusMutation,
  usePayBonusMutation,
  useTdsYearQuery,
  useRecordChallanMutation,
  useReturn24QQuery,
  useForm16ListQuery,
} = hrApi;

/** Badge tones by status. */
export const LEAVE_TONE = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'critical',
  CANCELLED: 'neutral',
};
export const RUN_TONE = {
  DRAFT: 'neutral',
  CALCULATED: 'info',
  SUBMITTED: 'warning',
  RETURNED: 'critical',
  LOCKED: 'success',
};
export const ATT_TONE = {
  PRESENT: 'success',
  HALF_DAY: 'warning',
  ABSENT: 'critical',
  LOP: 'critical',
  LEAVE: 'info',
  HOLIDAY: 'neutral',
  WEEK_OFF: 'neutral',
};
/** One-letter attendance codes for the month grid. */
export const ATT_CODE = {
  PRESENT: 'P',
  HALF_DAY: 'H',
  ABSENT: 'A',
  LOP: 'L',
  LEAVE: 'LV',
  HOLIDAY: 'HO',
  WEEK_OFF: 'W',
};

/** The current month and the one before it in IST, as YYYY-MM. */
export function monthsIST() {
  const now = new Date(Date.now() + 330 * 60_000);
  const cur = now.toISOString().slice(0, 7);
  now.setUTCDate(1);
  now.setUTCMonth(now.getUTCMonth() - 1);
  return { current: cur, previous: now.toISOString().slice(0, 7) };
}

/** Today in IST, YYYY-MM-DD. */
export const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** A date plus n days, YYYY-MM-DD. */
export function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week containing a date. */
export function mondayOf(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return addDays(ymd, -back);
}

/** Saves text as a file in the browser. */
export function downloadText(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
