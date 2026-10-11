import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/* Radiology (RIS): apps/api/src/modules/radiology. Lists are { items, total, page, limit }. */

const post = (url, body = {}) => ({ url, method: 'POST', body });
const WORK = ['RadStudies', 'RadStudy', 'RadCounts', 'RadSlots'];

export const radApi = baseApi
  .enhanceEndpoints({ addTagTypes: [...WORK, 'RadMaster', 'RadSettings', 'RadFormF'] })
  .injectEndpoints({
    endpoints: (b) => ({
      radStudies: b.query({
        query: (params = {}) => ({ url: '/rad/studies', params: cleanParams(params) }),
        providesTags: ['RadStudies'],
      }),
      radStudy: b.query({ query: (id) => `/rad/studies/${id}`, providesTags: ['RadStudy'] }),
      radCounts: b.query({ query: () => '/rad/studies/counts', providesTags: ['RadCounts'] }),
      radSlots: b.query({
        query: (params) => ({ url: '/rad/slots', params: cleanParams(params) }),
        providesTags: ['RadSlots'],
      }),
      createRadOrder: b.mutation({
        query: (body) => post('/rad/orders', body),
        invalidatesTags: WORK,
      }),
      radStep: b.mutation({
        query: ({ id, step, ...body }) =>
          step === 'report'
            ? { url: `/rad/studies/${id}/report`, method: 'PUT', body }
            : post(`/rad/studies/${id}/${step}`, body),
        invalidatesTags: [...WORK, 'RadFormF'],
      }),
      patientStudies: b.query({
        query: (patientId) => `/rad/patients/${patientId}/studies`,
        providesTags: ['RadStudies'],
      }),
      radMaster: b.query({
        query: (params = {}) => ({ url: '/rad/studies-master', params: cleanParams(params) }),
        providesTags: ['RadMaster'],
      }),
      saveRadDef: b.mutation({
        query: ({ id, ...body }) => ({ url: `/rad/studies-master/${id}`, method: 'PUT', body }),
        invalidatesTags: ['RadMaster'],
      }),
      radSettings: b.query({ query: () => '/rad/settings', providesTags: ['RadSettings'] }),
      saveRadSettings: b.mutation({
        query: (body) => ({ url: '/rad/settings', method: 'PUT', body }),
        invalidatesTags: ['RadSettings', 'RadSlots'],
      }),
      formFRegister: b.query({
        query: (params = {}) => ({ url: '/rad/form-f', params: cleanParams(params) }),
        providesTags: ['RadFormF'],
      }),
    }),
  });

export const {
  useRadStudiesQuery,
  useRadStudyQuery,
  useRadCountsQuery,
  useRadSlotsQuery,
  useCreateRadOrderMutation,
  useRadStepMutation,
  usePatientStudiesQuery,
  useRadMasterQuery,
  useSaveRadDefMutation,
  useRadSettingsQuery,
  useSaveRadSettingsMutation,
  useFormFRegisterQuery,
} = radApi;

export const RAD_TONE = {
  ORDERED: 'neutral',
  SCHEDULED: 'info',
  ARRIVED: 'accent',
  PERFORMED: 'warning',
  REPORTED: 'warning',
  SIGNED: 'success',
  CANCELLED: 'neutral',
};
export const MODALITIES = ['XRAY', 'USG', 'CT', 'MRI', 'MAMMO', 'ECHO'];
