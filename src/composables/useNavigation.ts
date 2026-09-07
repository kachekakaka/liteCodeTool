import { useRouter } from 'vue-router';
import {
  screenState,
  newScreen as createScreen,
  importConfiguration as importScreen,
} from '../stores/screens.ts';
import {
  templateState,
  draftDirty,
  prepareTemplate,
  saveTemplate as persistTemplate,
} from '../stores/templates.ts';
import { uiState, notify } from '../stores/application.ts';
import type { ComponentTemplate } from '../types.ts';

/**
 * 封装资源操作与对应 URL 的同步，供导航栏、工具栏和快捷键共用。
 *
 * @returns 页面切换、大屏加载及新建、导入、模板打开与保存的导航方法。
 */
export function useNavigation() {
  const router = useRouter();
  /**
   * 切换功能页面；大屏编辑和显示使用当前资源 ID，工坊由守卫恢复草稿地址。
   *
   * @param mode - 目标页面模式，常用 editor、viewer、workshop、data。
   * @returns 路由导航的 Promise；完成时为 undefined 或 Vue Router 的导航失败对象。
   */
  function setView(mode: string) {
    const id = screenState.screen?.id;
    return router.push(
      mode === 'workshop'
        ? '/workshop'
        : mode === 'data'
          ? '/data'
          : id
            ? `/screens/${id}/${mode === 'viewer' ? 'view' : 'edit'}`
            : mode === 'viewer'
              ? '/viewer'
              : '/',
    );
  }
  /**
   * 导航到指定大屏编辑页，由路由守卫负责加载和草稿确认。
   *
   * @param id - 目标大屏 ID。
   * @returns 路由导航的 Promise；完成时为 undefined 或 Vue Router 的导航失败对象。
   */
  function loadScreen(id: string) {
    return router.push(`/screens/${id}/edit`);
  }
  /**
   * 串行创建大屏，在创建锁释放后跳转到成功生成的资源地址。
   *
   * @returns 完成处理的 Promise，不携带业务返回值。
   */
  async function newScreen() {
    if (screenState.saving || uiState.importing || uiState.creating) return;
    uiState.creating = true;
    let id: string | undefined;
    try {
      id = await createScreen();
    } finally {
      uiState.creating = false;
    }
    if (id) await loadScreen(id);
  }
  /**
   * 导入配置包并跳转到导入的大屏；保存或新建期间不启动导入。
   *
   * @param event - 文件 input 的选择事件，将传递给配置导入方法。
   * @returns 完成处理的 Promise，不携带业务返回值。
   */
  async function importConfiguration(event: Event) {
    if (screenState.saving || uiState.creating) return;
    const id = await importScreen(event);
    if (id) await loadScreen(id);
  }
  /**
   * 打开指定模板，或确认放弃当前模板修改后准备新建草稿。
   *
   * @param template - 需要编辑的模板；省略表示新建。
   * @returns Promise；发生导航时兑现为 Vue Router 导航结果，取消或被保存状态阻止时为 undefined。
   */
  async function editTemplate(template?: ComponentTemplate) {
    if (template) return router.push(`/workshop/${template.id}`);
    if (templateState.draftSaving) return notify('请等待模板保存结束');
    if (draftDirty.value && !confirm('当前组件模板有未保存修改，是否放弃并新建？')) return;
    prepareTemplate();
    return router.push('/workshop/new');
  }
  /**
   * 保存模板后将当前工坊地址替换为资源 ID；期间已离开原页面则不抢回导航。
   *
   * @param asNew - 是否另存为新模板，默认 false。
   * @returns 完成处理的 Promise，不携带业务返回值。
   */
  async function saveTemplate(asNew = false) {
    const origin = router.currentRoute.value.fullPath;
    const id = await persistTemplate(asNew);
    if (id && router.currentRoute.value.fullPath === origin)
      await router.replace(`/workshop/${id}`);
  }
  return { setView, loadScreen, newScreen, importConfiguration, editTemplate, saveTemplate };
}
