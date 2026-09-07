import { createRouter, createWebHistory } from 'vue-router';
import { installGuards } from './guards.ts';
import WorkspaceLayout from '../layouts/WorkspaceLayout.vue';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: WorkspaceLayout,
      children: [
        { path: '', component: () => import('../views/ScreenEditorView.vue') },
        {
          path: 'screens/:screenId/edit',
          name: 'screen-edit',
          component: () => import('../views/ScreenEditorView.vue'),
          meta: { mode: 'editor' },
        },
        {
          path: 'workshop',
          component: () => import('../views/WorkshopView.vue'),
          meta: { mode: 'workshop' },
        },
        {
          path: 'workshop/new',
          name: 'template-new',
          component: () => import('../views/WorkshopView.vue'),
          meta: { mode: 'workshop' },
        },
        {
          path: 'workshop/:templateId',
          name: 'template-edit',
          component: () => import('../views/WorkshopView.vue'),
          meta: { mode: 'workshop' },
        },
        {
          path: 'data',
          name: 'data',
          component: () => import('../views/DataStatusView.vue'),
          meta: { mode: 'data' },
        },
      ],
    },
    {
      path: '/viewer',
      component: () => import('../views/ScreenViewerView.vue'),
      meta: { mode: 'viewer' },
    },
    {
      path: '/screens/:screenId/view',
      name: 'screen-view',
      component: () => import('../views/ScreenViewerView.vue'),
      meta: { mode: 'viewer' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
});
installGuards(router);
