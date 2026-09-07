<script lang="ts">
import { computed, defineComponent, nextTick, ref, watch } from 'vue';
import { state, dirty, retarget, saveScreen, restoreBindings, checkpoint } from '../runtime.ts';
export default defineComponent({
  setup() {
    const tab = ref<'objects' | 'text'>('objects');
    const input = ref<HTMLInputElement | null>(null), dialog = ref<HTMLElement | null>(null);
    const target = ref({ instanceId: '', slotId: '', schemaType: '' }); let previousFocus: HTMLElement | null = null;
    const groups = computed(() => (state.screen?.components ?? []).map(instance => ({ instance, template: state.templates.find(t => t.id === instance.templateId) })).filter(group => !!group.template?.slots.length && (!state.drawerInstance || group.instance.instanceId === state.drawerInstance)));
    const candidates = computed(() => state.store.list(target.value.schemaType).filter(({ id, record }) => `${id} ${record.data.vessel_name ?? ''}`.toLocaleLowerCase().includes(state.search.trim().toLocaleLowerCase())));
    const current = computed(() => state.screen?.components.find(i => i.instanceId === target.value.instanceId)?.slotBindings[target.value.slotId]);
    const templateOf = (id: string) => state.templates.find(t => t.id === id);
    function name(type: string, id?: string): string { return id ? String(state.store.get(type, id)?.data.vessel_name ?? id) : '未绑定对象'; }
    function renameScreen(event: Event) { if (state.screen) { checkpoint(); state.screen.name = (event.target as HTMLInputElement).value; } }
    function updateInstanceTitle(instanceId: string, event: Event) { const inst = state.screen?.components.find(i => i.instanceId === instanceId); if (inst) { checkpoint(); inst.title = (event.target as HTMLInputElement).value; } }
    watch(() => state.drawer, async open => {
      if (open) { previousFocus = document.activeElement as HTMLElement; const group = groups.value[0], slot = group?.template?.slots[0]; target.value = { instanceId: group?.instance.instanceId ?? '', slotId: slot?.id ?? '', schemaType: slot?.schemaType ?? '' }; await nextTick(); input.value?.focus(); }
      else previousFocus?.focus();
    });
    function trap(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); state.drawer = false; return; }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,[tabindex="0"]') ?? []);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    const choose = (id: string) => retarget(target.value.instanceId, target.value.slotId, id);
    return { tab, templateOf, renameScreen, updateInstanceTitle, state, dirty, input, dialog, target, groups, candidates, current, name, choose, saveScreen, restoreBindings, trap };
  }
});
</script>
<template>
  <div v-if="state.drawer" class="drawer-layer"><div class="drawer-mask" @click="state.drawer=false"></div><section ref="dialog" class="object-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" @keydown="trap">
    <header><div><span class="eyebrow">MONITOR OBJECTS</span><h2 id="drawer-title">{{ tab==='objects'?'监控对象调度':'大屏文本管理' }}</h2></div><button class="icon-button" @click="state.drawer=false" aria-label="关闭抽屉">×</button></header>
    <div class="drawer-tabs"><button :class="{ active: tab === 'objects' }" @click="tab = 'objects'">🎯 监控对象调度</button><button :class="{ active: tab === 'text' }" @click="tab = 'text'">📝 大屏文本管理</button></div>
    <div v-if="tab==='objects'" class="drawer-scroll"><p class="drawer-hint">先选择对象槽位，再搜索目标。临时换船即时生效，不改变控件的字段绑定。</p><button v-if="state.drawerInstance" class="link-button" @click="state.drawerInstance=''">← 查看大屏全部组件</button>
      <div class="slot-groups"><section v-for="group in groups" :key="group.instance.instanceId" class="slot-group"><h3>{{ group.instance.title || group.template?.name }}</h3><button v-for="slot in group.template?.slots" :key="slot.id" class="slot-choice" :class="{ active:target.instanceId===group.instance.instanceId&&target.slotId===slot.id }" @click="target={instanceId:group.instance.instanceId,slotId:slot.id,schemaType:slot.schemaType}"><span>{{ slot.label }}</span><strong>{{ name(slot.schemaType,group.instance.slotBindings[slot.id]) }}</strong><span>›</span></button></section><p v-if="!groups.length" class="empty-note">当前大屏没有需要指派的对象槽位</p></div>
      <div class="search-heading">搜索船名 / MMSI</div><input ref="input" v-model="state.search" class="object-search" placeholder="输入船名或编号…" aria-label="搜索监控对象"><div class="candidate-meta"><span>{{ candidates.length }} 个候选对象</span><button v-if="current" class="link-button" @click="choose('')">清空当前槽位</button></div>
      <button v-for="item in candidates" :key="item.id" class="object-candidate" :class="{ chosen:current===item.id }" :disabled="!target.slotId" @click="choose(item.id)"><span class="candidate-icon">◇</span><div><strong>{{ item.record.data.vessel_name || item.id }}</strong><small>{{ item.id }} · {{ item.record.data.vessel_type || '类型未知' }}</small></div><span class="candidate-state">{{ current===item.id ? '已绑定' : item.record.data.status || '状态未知' }}</span></button><p v-if="!candidates.length" class="empty-note">没有匹配对象。未上报实体不会被虚构生成。</p>
    </div>
    <div v-else class="drawer-scroll"><p class="drawer-hint">在此修改大屏总名称与各卡片标题。修改后点击底部“保存为大屏默认”即可持久化生效。</p>
      <div class="drawer-text-list">
        <div class="text-item-box"><label><span>大屏总标题</span><small>Screen Name</small></label><input :value="state.screen?.name" @change="renameScreen($event)" placeholder="输入大屏标题..."></div>
        <div v-for="inst in state.screen?.components" :key="inst.instanceId" class="text-item-box">
          <label><span>{{ templateOf(inst.templateId)?.name || '组件' }}</span><small>#{{ inst.instanceId.slice(0, 8) }}</small></label>
          <input :value="inst.title || ''" :placeholder="templateOf(inst.templateId)?.name || '自定义卡片标题...'" @change="updateInstanceTitle(inst.instanceId, $event)">
        </div>
      </div>
    </div>
    <footer><span :class="dirty?'dirty-state':'muted'">{{ dirty ? '● 当前大屏有未保存修改' : '已与默认配置一致' }}</span><div><button class="button" @click="restoreBindings">恢复默认配置</button><button class="button primary" :disabled="state.saving||!dirty" @click="saveScreen">{{ state.saving?'保存中…':'保存为大屏默认' }}</button></div></footer>
  </section></div>
</template>
