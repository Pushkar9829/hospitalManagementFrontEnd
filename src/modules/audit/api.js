import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/** Audit log (append-only): newest first, filterable by record, user, action and date. */
export const auditApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    auditLog: b.query({
      query: (params) => ({ url: '/audit', params: cleanParams(params) }),
      providesTags: ['Audit'],
    }),
    auditExceptions: b.query({
      query: (date) => ({ url: '/audit/exceptions', params: { date } }),
      providesTags: ['Audit'],
    }),
    /** Staff names for the user filter; needs settings:user:read (auditors type an id instead). */
    auditUsers: b.query({
      query: () => ({ url: '/users', params: { limit: 100 } }),
      providesTags: ['Users'],
    }),
  }),
});

export const { useAuditLogQuery, useAuditUsersQuery, useAuditExceptionsQuery } = auditApi;
