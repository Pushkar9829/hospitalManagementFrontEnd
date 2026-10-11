import { baseApi } from '../../app/baseApi.js';

/* Role home pages (apps/api/src/core/home): the widgets of one panel for the signed-in user. */

export const homeApi = baseApi.enhanceEndpoints({ addTagTypes: ['RoleHome'] }).injectEndpoints({
  endpoints: (b) => ({
    roleHome: b.query({
      query: (panel) => ({ url: '/home', params: { panel } }),
      providesTags: ['RoleHome'],
    }),
  }),
});

export const { useRoleHomeQuery } = homeApi;
