import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/* Medical records (apps/api/src/modules/mrd). */

const post = (url, body = {}) => ({ url, method: 'POST', body });
const TAGS = [
  'MrdRecords',
  'MrdRecord',
  'MrdDeficiencies',
  'MrdReleases',
  'MrdRegisters',
  'MrdStats',
  'MrdRetention',
];

export const mrdApi = baseApi.enhanceEndpoints({ addTagTypes: TAGS }).injectEndpoints({
  endpoints: (b) => ({
    mrdRecords: b.query({
      query: (params = {}) => ({ url: '/mrd/records', params: cleanParams(params) }),
      providesTags: ['MrdRecords'],
    }),
    mrdRecord: b.query({ query: (id) => `/mrd/records/${id}`, providesTags: ['MrdRecord'] }),
    recheckRecord: b.mutation({
      query: (id) => post(`/mrd/records/${id}/recheck`),
      invalidatesTags: ['MrdRecords', 'MrdRecord', 'MrdDeficiencies'],
    }),
    resolveItem: b.mutation({
      query: ({ id, ...body }) => post(`/mrd/records/${id}/resolve`, body),
      invalidatesTags: ['MrdRecords', 'MrdRecord', 'MrdDeficiencies'],
    }),
    codeRecord: b.mutation({
      query: ({ id, ...body }) => post(`/mrd/records/${id}/coding`, body),
      invalidatesTags: ['MrdRecords', 'MrdRecord', 'MrdStats'],
    }),
    moveFile: b.mutation({
      query: ({ id, ...body }) => post(`/mrd/records/${id}/file`, body),
      invalidatesTags: ['MrdRecords', 'MrdRecord'],
    }),
    overdueFiles: b.query({ query: () => '/mrd/files/overdue', providesTags: ['MrdRecords'] }),
    deficiencies: b.query({ query: () => '/mrd/deficiencies', providesTags: ['MrdDeficiencies'] }),
    mrdIcd10: b.query({ query: (q) => ({ url: '/mrd/icd10', params: { q } }) }),
    mrdReleases: b.query({
      query: (params = {}) => ({ url: '/mrd/releases', params: cleanParams(params) }),
      providesTags: ['MrdReleases'],
    }),
    requestRelease: b.mutation({
      query: (body) => post('/mrd/releases', body),
      invalidatesTags: ['MrdReleases'],
    }),
    releaseCopy: b.mutation({
      query: (id) => post(`/mrd/releases/${id}/release`),
      invalidatesTags: ['MrdReleases'],
    }),
    births: b.query({ query: () => '/mrd/births', providesTags: ['MrdRegisters'] }),
    deaths: b.query({ query: () => '/mrd/deaths', providesTags: ['MrdRegisters'] }),
    mlcCases: b.query({ query: () => '/mrd/mlc', providesTags: ['MrdRegisters'] }),
    recordBirth: b.mutation({
      query: (body) => post('/mrd/births', body),
      invalidatesTags: ['MrdRegisters', 'MrdStats'],
    }),
    recordDeath: b.mutation({
      query: (body) => post('/mrd/deaths', body),
      invalidatesTags: ['MrdRegisters', 'MrdStats'],
    }),
    recordMlc: b.mutation({
      query: (body) => post('/mrd/mlc', body),
      invalidatesTags: ['MrdRegisters'],
    }),
    markReported: b.mutation({
      query: ({ kind, id, crsRefNo }) => post(`/mrd/${kind}/${id}/reported`, { crsRefNo }),
      invalidatesTags: ['MrdRegisters'],
    }),
    handoverBody: b.mutation({
      query: ({ id, ...body }) => post(`/mrd/deaths/${id}/handover`, body),
      invalidatesTags: ['MrdRegisters'],
    }),
    // Retention and destruction (Medical Superintendent, then Super Admin approve a batch).
    retentionDue: b.query({ query: () => '/mrd/retention-due', providesTags: ['MrdRetention'] }),
    destructions: b.query({ query: () => '/mrd/destructions', providesTags: ['MrdRetention'] }),
    proposeDestruction: b.mutation({
      query: (body) => post('/mrd/destructions', body),
      invalidatesTags: ['MrdRetention', 'Approvals', 'ApprovalCount'],
    }),
    recordDestroyed: b.mutation({
      query: ({ id, ...body }) => post(`/mrd/destructions/${id}/destroyed`, body),
      invalidatesTags: ['MrdRetention', 'MrdRecords'],
    }),
    legalHold: b.mutation({
      query: ({ id, ...body }) => ({ url: `/mrd/records/${id}/legal-hold`, method: 'PUT', body }),
      invalidatesTags: ['MrdRetention', 'MrdRecord'],
    }),
    mrdSettings: b.query({ query: () => '/mrd/settings', providesTags: ['MrdRetention'] }),
    saveMrdSettings: b.mutation({
      query: (body) => ({ url: '/mrd/settings', method: 'PUT', body }),
      invalidatesTags: ['MrdRetention', 'MrdRecords', 'MrdRecord'],
    }),
    mrdStatistics: b.query({
      query: (month) => ({ url: '/mrd/statistics', params: { month } }),
      providesTags: ['MrdStats'],
    }),
  }),
});

export const {
  useMrdRecordsQuery,
  useMrdRecordQuery,
  useRecheckRecordMutation,
  useResolveItemMutation,
  useCodeRecordMutation,
  useMoveFileMutation,
  useOverdueFilesQuery,
  useDeficienciesQuery,
  useMrdIcd10Query,
  useMrdReleasesQuery,
  useRequestReleaseMutation,
  useReleaseCopyMutation,
  useBirthsQuery,
  useDeathsQuery,
  useMlcCasesQuery,
  useRecordBirthMutation,
  useRecordDeathMutation,
  useRecordMlcMutation,
  useMarkReportedMutation,
  useHandoverBodyMutation,
  useMrdStatisticsQuery,
  useRetentionDueQuery,
  useDestructionsQuery,
  useProposeDestructionMutation,
  useRecordDestroyedMutation,
  useLegalHoldMutation,
  useMrdSettingsQuery,
  useSaveMrdSettingsMutation,
} = mrdApi;

export const RECORD_TONE = { DEFICIENT: 'warning', CODING: 'info', CLOSED: 'success' };
export const RELEASE_TONE = {
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  REJECTED: 'critical',
  RELEASED: 'success',
};
