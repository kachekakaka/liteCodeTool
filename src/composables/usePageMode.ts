import { reactive } from 'vue';
import { useRoute } from 'vue-router';
export function usePageMode() {
  const route = useRoute();
  return reactive({
    get mode() {
      return String(route.meta.mode || 'editor');
    },
  });
}
