import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/*
 * Laboratory (docs/modules/LAB.md): apps/api/src/modules/lab.
 * Lists are { items, total, page, limit }; ISO dates. Every write refetches the lab lists.
 */

const post = (url, body = {}) => ({ url, method: 'POST', body });
const WORK = ['LabItems', 'LabItem', 'LabCollection', 'LabSamples', 'LabCalls', 'LabCounts'];

export const labApi = baseApi
  .enhanceEndpoints({
    addTagTypes: [
      ...WORK,
      'LabQc',
      'LabTests',
      'LabSettings',
      'LabReports',
      'LabMicro',
      'LabHisto',
      'LabHomeVisits',
      'LabRegisters',
    ],
  })
  .injectEndpoints({
    endpoints: (b) => ({
      // Registers (QC lots, EQAS, maintenance, partners, media, send-outs, storage, histology)
      labRegister: b.query({
        query: ({ path, params }) => ({ url: `/lab/${path}`, params: cleanParams(params ?? {}) }),
        providesTags: ['LabRegisters'],
      }),
      labRegisterWrite: b.mutation({
        query: ({ method = 'POST', path, body }) => ({ url: `/lab/${path}`, method, body }),
        invalidatesTags: ['LabRegisters', 'LabSettings', ...WORK],
      }),
      // Home collection visits
      homeVisits: b.query({
        query: (params = {}) => ({ url: '/lab/home-visits', params: cleanParams(params) }),
        providesTags: ['LabHomeVisits'],
      }),
      homeVisitStaff: b.query({ query: () => '/lab/home-visits/staff' }),
      bookHomeVisit: b.mutation({
        query: (body) => post('/lab/home-visits', body),
        invalidatesTags: ['LabHomeVisits', ...WORK],
      }),
      homeVisitAction: b.mutation({
        query: ({ id, action, ...body }) => post(`/lab/home-visits/${id}/${action}`, body),
        invalidatesTags: ['LabHomeVisits', ...WORK],
      }),
      // Orders and worklists
      labItems: b.query({
        query: (params = {}) => ({ url: '/lab/items', params: cleanParams(params) }),
        providesTags: ['LabItems'],
      }),
      labItem: b.query({
        query: (id) => `/lab/items/${id}`,
        providesTags: (r, e, id) => [{ type: 'LabItem', id }],
      }),
      labCounts: b.query({ query: () => '/lab/items/counts', providesTags: ['LabCounts'] }),
      createLabOrder: b.mutation({
        query: (body) => post('/lab/orders', body),
        invalidatesTags: WORK,
      }),
      cancelLabItem: b.mutation({
        query: ({ id, ...body }) => post(`/lab/items/${id}/cancel`, body),
        invalidatesTags: WORK,
      }),
      // Collection and receipt
      collectionList: b.query({
        query: (params = {}) => ({ url: '/lab/collection', params: cleanParams(params) }),
        providesTags: ['LabCollection'],
      }),
      collect: b.mutation({ query: (body) => post('/lab/collect', body), invalidatesTags: WORK }),
      labSamples: b.query({
        query: (params = {}) => ({ url: '/lab/samples', params: cleanParams(params) }),
        providesTags: ['LabSamples'],
      }),
      receiveSample: b.mutation({
        query: (sampleNo) => post(`/lab/samples/${encodeURIComponent(sampleNo)}/receive`),
        invalidatesTags: WORK,
      }),
      rejectSample: b.mutation({
        query: ({ sampleNo, ...body }) =>
          post(`/lab/samples/${encodeURIComponent(sampleNo)}/reject`, body),
        invalidatesTags: WORK,
      }),
      // Results
      enterResults: b.mutation({
        query: ({ id, ...body }) => ({ url: `/lab/items/${id}/results`, method: 'PUT', body }),
        invalidatesTags: WORK,
      }),
      verifyResult: b.mutation({
        query: (id) => post(`/lab/items/${id}/verify`),
        invalidatesTags: WORK,
      }),
      releaseResult: b.mutation({
        query: ({ id, ...body }) => post(`/lab/items/${id}/release`, body),
        invalidatesTags: WORK,
      }),
      amendResult: b.mutation({
        query: ({ id, ...body }) => post(`/lab/items/${id}/amend`, body),
        invalidatesTags: WORK,
      }),
      acknowledgeResult: b.mutation({
        query: (id) => post(`/lab/items/${id}/acknowledge`),
        invalidatesTags: WORK,
      }),
      labReport: b.query({
        query: (orderNo) => `/lab/reports/${encodeURIComponent(orderNo)}`,
        providesTags: ['LabItems'],
      }),
      patientLabResults: b.query({
        query: (patientId) => `/lab/patients/${patientId}/results`,
        providesTags: ['LabItems'],
      }),
      // Critical calls
      criticalCalls: b.query({
        query: (params = {}) => ({ url: '/lab/critical-calls', params: cleanParams(params) }),
        providesTags: ['LabCalls'],
      }),
      logCall: b.mutation({
        query: ({ id, ...body }) => post(`/lab/critical-calls/${id}/log`, body),
        invalidatesTags: WORK,
      }),
      // QC
      qcControls: b.query({ query: () => '/lab/qc/controls', providesTags: ['LabQc'] }),
      qcStatus: b.query({ query: () => '/lab/qc/status', providesTags: ['LabQc'] }),
      leveyJennings: b.query({
        query: (control) => ({ url: '/lab/qc/levey-jennings', params: { control } }),
        providesTags: ['LabQc'],
      }),
      recordQcRun: b.mutation({
        query: (body) => post('/lab/qc/runs', body),
        invalidatesTags: ['LabQc', ...WORK],
      }),
      createQcControl: b.mutation({
        query: (body) => post('/lab/qc/controls', body),
        invalidatesTags: ['LabQc'],
      }),
      // Settings and test master
      labTests: b.query({
        query: (params = {}) => ({ url: '/lab/tests', params: cleanParams(params) }),
        providesTags: ['LabTests'],
      }),
      labTest: b.query({ query: (id) => `/lab/tests/${id}`, providesTags: ['LabTests'] }),
      saveLabTest: b.mutation({
        query: ({ id, ...body }) => ({ url: `/lab/tests/${id}`, method: 'PUT', body }),
        invalidatesTags: ['LabTests'],
      }),
      labSettings: b.query({ query: () => '/lab/settings', providesTags: ['LabSettings'] }),
      saveLabSettings: b.mutation({
        query: (body) => ({ url: '/lab/settings', method: 'PUT', body }),
        invalidatesTags: ['LabSettings'],
      }),
      // Microbiology
      cultures: b.query({
        query: (params = {}) => ({ url: '/lab/cultures', params: cleanParams(params) }),
        providesTags: ['LabMicro'],
      }),
      culture: b.query({ query: (id) => `/lab/cultures/${id}`, providesTags: ['LabMicro'] }),
      antibiogram: b.query({
        query: (params = {}) => ({ url: '/lab/cultures/antibiogram', params: cleanParams(params) }),
        providesTags: ['LabMicro'],
      }),
      cultureStep: b.mutation({
        query: ({ id, step, ...body }) =>
          step === 'final'
            ? post(`/lab/cultures/${id}/final`)
            : post(`/lab/cultures/${id}/${step}`, body),
        invalidatesTags: ['LabMicro', ...WORK],
      }),
      // Histopathology
      histoCases: b.query({
        query: (params = {}) => ({ url: '/lab/histo/cases', params: cleanParams(params) }),
        providesTags: ['LabHisto'],
      }),
      histoCase: b.query({ query: (id) => `/lab/histo/cases/${id}`, providesTags: ['LabHisto'] }),
      saveHistoCase: b.mutation({
        query: ({ id, ...body }) => ({ url: `/lab/histo/cases/${id}`, method: 'PUT', body }),
        invalidatesTags: ['LabHisto'],
      }),
      reportHistoCase: b.mutation({
        query: (id) => post(`/lab/histo/cases/${id}/report`),
        invalidatesTags: ['LabHisto', ...WORK],
      }),
      // Analytics
      labTat: b.query({
        query: (params = {}) => ({ url: '/reports/lab-tat', params: cleanParams(params) }),
        providesTags: ['LabReports', 'LabItems'],
      }),
      labIndicators: b.query({
        query: (params = {}) => ({ url: '/reports/lab-indicators', params: cleanParams(params) }),
        providesTags: ['LabReports', 'LabItems'],
      }),
    }),
  });

export const {
  useLabItemsQuery,
  useLabItemQuery,
  useLabCountsQuery,
  useCreateLabOrderMutation,
  useCancelLabItemMutation,
  useCollectionListQuery,
  useCollectMutation,
  useLabSamplesQuery,
  useReceiveSampleMutation,
  useRejectSampleMutation,
  useEnterResultsMutation,
  useVerifyResultMutation,
  useReleaseResultMutation,
  useAmendResultMutation,
  useAcknowledgeResultMutation,
  useLabReportQuery,
  usePatientLabResultsQuery,
  useCriticalCallsQuery,
  useLogCallMutation,
  useQcControlsQuery,
  useQcStatusQuery,
  useLeveyJenningsQuery,
  useRecordQcRunMutation,
  useCreateQcControlMutation,
  useLabTestsQuery,
  useLabTestQuery,
  useSaveLabTestMutation,
  useLabSettingsQuery,
  useSaveLabSettingsMutation,
  useLabTatQuery,
  useLabIndicatorsQuery,
  useCulturesQuery,
  useCultureQuery,
  useAntibiogramQuery,
  useCultureStepMutation,
  useHistoCasesQuery,
  useHistoCaseQuery,
  useSaveHistoCaseMutation,
  useReportHistoCaseMutation,
  useLabRegisterQuery,
  useLabRegisterWriteMutation,
  useHomeVisitsQuery,
  useHomeVisitStaffQuery,
  useBookHomeVisitMutation,
  useHomeVisitActionMutation,
} = labApi;
