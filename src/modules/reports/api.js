import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/* Reports centre and the management dashboard (apps/api/src/core/reports). */

const TAGS = ['RepCatalogue', 'RepRun', 'RepExports', 'RepSchedules', 'RepDashboard'];

export const reportsApi = baseApi.enhanceEndpoints({ addTagTypes: TAGS }).injectEndpoints({
  endpoints: (b) => ({
    reportCatalogue: b.query({ query: () => '/reports', providesTags: ['RepCatalogue'] }),
    runReport: b.query({
      query: ({ code, ...params }) => ({ url: `/reports/${code}`, params: cleanParams(params) }),
      providesTags: ['RepRun'],
    }),
    exportReport: b.mutation({
      query: ({ code, ...body }) => ({ url: `/reports/${code}/export`, method: 'POST', body }),
      invalidatesTags: ['RepExports'],
    }),
    reportExports: b.query({
      query: (params = {}) => ({ url: '/reports/exports', params: cleanParams(params) }),
      providesTags: ['RepExports'],
    }),
    exportDownload: b.query({ query: (id) => `/reports/exports/${id}/download` }),
    reportSchedules: b.query({ query: () => '/reports/schedules', providesTags: ['RepSchedules'] }),
    createReportSchedule: b.mutation({
      query: (body) => ({ url: '/reports/schedules', method: 'POST', body }),
      invalidatesTags: ['RepSchedules'],
    }),
    setReportSchedule: b.mutation({
      query: ({ id, active }) => ({
        url: `/reports/schedules/${id}`,
        method: 'PUT',
        body: { active },
      }),
      invalidatesTags: ['RepSchedules'],
    }),
    deleteReportSchedule: b.mutation({
      query: (id) => ({ url: `/reports/schedules/${id}`, method: 'DELETE' }),
      invalidatesTags: ['RepSchedules'],
    }),
    dashboard: b.query({ query: () => '/reports/dashboard', providesTags: ['RepDashboard'] }),
  }),
});

export const {
  useReportCatalogueQuery,
  useRunReportQuery,
  useExportReportMutation,
  useReportExportsQuery,
  useLazyExportDownloadQuery,
  useReportSchedulesQuery,
  useCreateReportScheduleMutation,
  useSetReportScheduleMutation,
  useDeleteReportScheduleMutation,
  useDashboardQuery,
} = reportsApi;
