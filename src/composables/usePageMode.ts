import { reactive } from 'vue';
import { useRoute } from 'vue-router';
/**
 * 从当前路由元信息派生响应式页面模式，供跨页面共用组件读取。
 *
 * @returns 包含响应式 mode getter 的对象，缺少路由模式时采用 editor。
 */
export function usePageMode() {
  const route = useRoute();
  return reactive({
    /**
     * 读取当前路由声明的页面模式。
     *
     * @returns 模式字符串；路由未声明时返回 editor。
     */
    get mode() {
      return String(route.meta.mode || 'editor');
    },
  });
}
