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
        {
          path: 'screens',
          name: 'screen-manager',
          component: () => import('../views/ScreenManagerView.vue'),
          meta: { mode: 'manager' },
        },
        {
          path: '',
          /**
           * 延迟加载根入口的大屏编辑页面，最终资源地址由守卫标准化。
           * @returns 兑现为大屏编辑页模块的 Promise。
           */
          component: () => import('../views/ScreenEditorView.vue'),
        },
        {
          path: 'screens/:screenId/edit',
          name: 'screen-edit',
          /**
           * 首次访问指定大屏编辑页时加载页面代码。
           * @returns 兑现为大屏编辑页模块的 Promise。
           */
          component: () => import('../views/ScreenEditorView.vue'),
          meta: { mode: 'editor' },
        },
        {
          path: 'workshop',
          /**
           * 延迟加载工坊入口，由守卫恢复当前模板草稿地址。
           * @returns 兑现为工坊页面模块的 Promise。
           */
          component: () => import('../views/WorkshopView.vue'),
          meta: { mode: 'workshop' },
        },
        {
          path: 'workshop/new',
          name: 'template-new',
          /**
           * 为新建模板入口加载工坊页面。
           * @returns 兑现为工坊页面模块的 Promise。
           */
          component: () => import('../views/WorkshopView.vue'),
          meta: { mode: 'workshop' },
        },
        {
          path: 'workshop/:templateId',
          name: 'template-edit',
          /**
           * 为指定模板编辑地址加载工坊页面。
           * @returns 兑现为工坊页面模块的 Promise。
           */
          component: () => import('../views/WorkshopView.vue'),
          meta: { mode: 'workshop' },
        },
        {
          path: 'data',
          name: 'data',
          /**
           * 按需加载数据模式、连接和实体状态页面。
           * @returns 兑现为数据状态页模块的 Promise。
           */
          component: () => import('../views/DataStatusView.vue'),
          meta: { mode: 'data' },
        },
      ],
    },
    {
      path: '/viewer',
      /**
       * 延迟加载兼容显示入口，具体大屏由守卫解析。
       * @returns 兑现为大屏显示页模块的 Promise。
       */
      component: () => import('../views/ScreenViewerView.vue'),
      meta: { mode: 'viewer' },
    },
    {
      path: '/screens/:screenId/view',
      name: 'screen-view',
      /**
       * 按需加载指定大屏的显示页面。
       * @returns 兑现为大屏显示页模块的 Promise。
       */
      component: () => import('../views/ScreenViewerView.vue'),
      meta: { mode: 'viewer' },
    },
    {
      path: '/screens/:screenId/embed',
      name: 'screen-embed',
      component: () => import('../views/ScreenViewerView.vue'),
      meta: { mode: 'viewer', embedded: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      /**
       * 为无法匹配的路径加载错误页面。
       * @returns 兑现为未找到页面模块的 Promise。
       */
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
});
installGuards(router);
