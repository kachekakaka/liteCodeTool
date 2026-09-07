<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
import type { Binding, ControlProps, Geometry } from '../types.ts';
import { clone, fitGeometry, resolveValue, sourceType, DEFAULT_CHART_COLORS, DEFAULT_GLOBAL_CHART_FIELD, DEFAULT_SLOT_CHART_FIELD } from '../engine/core.ts';
import { state, selectedInstance, selectedTemplate, selectedControl, displayControl, checkpoint, patchControl, retarget, addSlot, removeSlot, createSlot, renameSlot, notify, alignInstance, moveLayer } from '../runtime.ts';
export default defineComponent({
  setup() {
    const tab = ref('data');
    const geometryKeys: (keyof Geometry)[] = ['x', 'y', 'w', 'h'];
    const v = (e: Event) => (e.target as HTMLInputElement).value;
    const checked = (e: Event) => (e.target as HTMLInputElement).checked;
    const schema = computed(() => state.schemas.find(s => s.type === sourceType(displayControl.value?.binding, selectedTemplate.value!)));
    const fields = computed(() => schema.value?.fields.filter(f => displayControl.value?.type === 'number' ? f.type === 'number' : displayControl.value?.type === 'time' ? f.type === 'datetime' : true) ?? []);
    const scalar = computed(() => !!displayControl.value && !['table','line'].includes(displayControl.value.type));
    const resolved = computed(() => selectedControl.value && selectedTemplate.value && selectedInstance.value && state.view !== 'workshop' ? resolveValue(selectedControl.value, selectedTemplate.value, selectedInstance.value, state.store, state.schemas, state.now) : null);
    const isLineGlobal = computed(() => displayControl.value?.binding?.target === 'global' || displayControl.value?.props.series?.some(s => s.target === 'global') || (displayControl.value?.props.xAxisSchemaType && state.schemas.find(s => s.type === displayControl.value?.props.xAxisSchemaType && !s.isEntity)));
    function props(patch: Partial<ControlProps>) { patchControl({ props: patch }); }
    function mode(mode: 'static' | 'dynamic') { props({ sourceMode: mode }); if (mode === 'dynamic' && !displayControl.value?.binding) bindTarget('slot'); }
    function bindTarget(target: 'slot' | 'global', key = '') {
      const t = selectedTemplate.value; if (!t) return;
      const slot = t.slots.find(s => s.id === key) ?? t.slots[0];
      const s = target === 'global' ? state.schemas.find(s => !s.isEntity && (!key || s.type === key)) : state.schemas.find(s => s.type === slot?.schemaType);
      if (!s) return notify('请先在组件工坊声明对象槽位，或切换为全局数据', true);
      const field = s.fields.find(f => displayControl.value?.type === 'number' ? f.type === 'number' : displayControl.value?.type === 'time' ? f.type === 'datetime' : f.key === 'vessel_name') ?? s.fields[0];
      patchControl({ binding: target === 'global' ? { target, schemaType: s.type, field: field.key } : { target, slotId: slot.id, field: field.key }, props: { sourceMode: 'dynamic', labelMode: 'auto', unitMode: 'auto', precision: null } });
    }
    function changeField(event: Event) { if (!displayControl.value?.binding) return; patchControl({ binding: { ...displayControl.value.binding, field: v(event) }, props: { labelMode: 'auto', unitMode: 'auto', precision: null } }); }
    function position(key: keyof Geometry, event: Event) {
      const n = Number(v(event)); if (!Number.isFinite(n)) return;
      if (displayControl.value && selectedTemplate.value) patchControl({ style: fitGeometry({ ...displayControl.value.style, [key]: n }, selectedTemplate.value.layout.width, selectedTemplate.value.layout.height) });
      else if (selectedInstance.value && state.screen) { checkpoint(); Object.assign(selectedInstance.value.position, fitGeometry({ ...selectedInstance.value.position, [key]: n }, state.screen.resolution.width, state.screen.resolution.height)); }
    }
    function dimension(key: 'width' | 'height', event: Event) { if (!state.draft) return; const n = Number(v(event)); if (!Number.isFinite(n) || n < (key==='width'?80:60) || n > (key==='width'?3840:2160)) return; state.draft.layout[key] = n; for (const c of state.draft.controls) Object.assign(c.style, fitGeometry(c.style, state.draft.layout.width, state.draft.layout.height)); }
    function resetOverride() { if (!selectedInstance.value || !selectedControl.value) return; checkpoint(); delete selectedInstance.value.controlOverrides[selectedControl.value.id]; }
    function staticValue(event: Event) { const text = v(event); props({ staticValue: displayControl.value?.type === 'number' ? text === '' ? null : Number(text) : text }); }
    function numberProp(key: 'lookbackMinutes' | 'gapSeconds' | 'pageSize' | 'staleSeconds' | 'autoPageSeconds', event: Event) { const n = Number(v(event)); if (Number.isFinite(n)) props({ [key]: n }); }
    function custom(event: Event) { const enabled = checked(event); props({ labelMode: enabled ? 'custom' : 'auto', unitMode: enabled ? 'custom' : 'auto', label: resolved.value?.label ?? displayControl.value?.props.label ?? '', unit: resolved.value?.unit ?? displayControl.value?.props.unit ?? '' }); }
    
    // 折线图数据模式（Schema-First）与槽位就地管理
    const lineSchemaType = computed(() => {
      const c = displayControl.value;
      if (!c) return 'vessel';
      if (c.props.xAxisSchemaType) return c.props.xAxisSchemaType;
      const first = c.props.series?.[0];
      if (first?.target === 'global') return first?.schemaType || 'port_stats';
      const slot = selectedTemplate.value?.slots.find(s => s.id === first?.slotId);
      return slot?.schemaType || selectedTemplate.value?.slots[0]?.schemaType || 'vessel';
    });
    const currentLineSchema = computed(() => state.schemas.find(s => s.type === lineSchemaType.value));
    const currentLineNumericFields = computed(() => currentLineSchema.value?.fields.filter(f => f.type === 'number') ?? []);

    function changeLineSchema(event: Event) {
      const nextType = v(event);
      const targetSchema = state.schemas.find(s => s.type === nextType);
      if (!targetSchema) return;
      const numField = targetSchema.fields.find(f => f.type === 'number')?.key || (targetSchema.isEntity ? DEFAULT_SLOT_CHART_FIELD : DEFAULT_GLOBAL_CHART_FIELD);
      if (targetSchema.isEntity) {
        let slot = selectedTemplate.value?.slots.find(s => s.schemaType === nextType);
        if (!slot) slot = createSlot('对象1', nextType) ?? undefined;
        const existing = displayControl.value?.props.series ?? [];
        const newSeries = existing.length > 0
          ? existing.map(s => ({
              target: 'slot' as const,
              slotId: slot?.id || '',
              field: targetSchema.fields.some(f => f.key === s.field && f.type === 'number') ? s.field : numField,
              color: s.color || DEFAULT_CHART_COLORS[0]
            }))
          : [{ target: 'slot' as const, slotId: slot?.id || '', field: numField, color: DEFAULT_CHART_COLORS[0] }];
        props({
          sourceMode: 'dynamic',
          xAxisSchemaType: nextType,
          xAxisField: displayControl.value?.props.xAxisField && targetSchema.fields.some(f => f.key === displayControl.value?.props.xAxisField) ? displayControl.value.props.xAxisField : undefined,
          series: newSeries
        });
      } else {
        const existing = displayControl.value?.props.series ?? [];
        const newSeries = existing.length > 0
          ? existing.map(s => ({
              target: 'global' as const,
              schemaType: nextType,
              field: targetSchema.fields.some(f => f.key === s.field && f.type === 'number') ? s.field : numField,
              color: s.color || DEFAULT_CHART_COLORS[0]
            }))
          : [{ target: 'global' as const, schemaType: nextType, field: numField, color: DEFAULT_CHART_COLORS[0] }];
        props({
          sourceMode: 'dynamic',
          xAxisSchemaType: nextType,
          xAxisMode: 'time',
          series: newSeries
        });
      }
    }

    function setXAxisMode(mode: 'time' | 'field') {
      props({
        xAxisMode: mode,
        xAxisField: mode === 'field' ? (displayControl.value?.props.xAxisField || currentLineNumericFields.value[0]?.key || 'lon') : undefined
      });
    }

    function changeXAxisField(event: Event) {
      props({ xAxisField: v(event) });
    }

    const creatingSlotForSeries = ref<number | null>(null);
    const newSlotDraft = ref('');
    const renamingSlotId = ref<string | null>(null);
    const renameSlotDraft = ref('');

    function onSlotSelectChange(index: number, event: Event) {
      const val = (event.target as HTMLSelectElement).value;
      if (val === '__new__') {
        creatingSlotForSeries.value = index;
        newSlotDraft.value = `对象${(selectedTemplate.value?.slots.length ?? 0) + 1}`;
      } else {
        seriesChange(index, 'slotId', event);
      }
    }

    function commitNewSlot(index: number) {
      if (creatingSlotForSeries.value !== index) return;
      const label = newSlotDraft.value.trim() || `对象${(selectedTemplate.value?.slots.length ?? 0) + 1}`;
      const slot = createSlot(label, lineSchemaType.value);
      creatingSlotForSeries.value = null;
      newSlotDraft.value = '';
      if (slot) {
        const series = clone(displayControl.value?.props.series ?? []);
        if (series[index]) {
          series[index].slotId = slot.id;
          props({ series });
        }
      }
    }

    function cancelNewSlot() {
      creatingSlotForSeries.value = null;
      newSlotDraft.value = '';
    }

    function startRenameSlot(slotId: string) {
      renamingSlotId.value = slotId;
      const slot = selectedTemplate.value?.slots.find(s => s.id === slotId);
      renameSlotDraft.value = slot?.label ?? '';
    }

    function commitRenameSlot() {
      if (!renamingSlotId.value) return;
      renameSlot(renamingSlotId.value, renameSlotDraft.value);
      renamingSlotId.value = null;
      renameSlotDraft.value = '';
    }

    function cancelRenameSlot() {
      renamingSlotId.value = null;
      renameSlotDraft.value = '';
    }

    function setLineSourceMode(mode: 'dynamic' | 'global' | 'slot') {
      props({ sourceMode: 'dynamic' });
      if (mode === 'global') {
        const globalSchema = state.schemas.find(s => !s.isEntity);
        const field = globalSchema?.fields.find(f => f.type === 'number');
        const existingSeries = displayControl.value?.props.series ?? [];
        const newSeries = existingSeries.length > 0
          ? existingSeries.map(s => ({
              target: 'global' as const,
              schemaType: globalSchema?.type || 'port_stats',
              field: globalSchema?.fields.some(f => f.key === s.field && f.type === 'number') ? s.field : (field?.key || DEFAULT_GLOBAL_CHART_FIELD),
              color: s.color || DEFAULT_CHART_COLORS[0]
            }))
          : [{ target: 'global' as const, schemaType: globalSchema?.type || 'port_stats', field: field?.key || DEFAULT_GLOBAL_CHART_FIELD, color: DEFAULT_CHART_COLORS[0] }];
        props({ series: newSeries });
      } else {
        const slot = selectedTemplate.value?.slots[0];
        const field = state.schemas.find(s => s.type === slot?.schemaType)?.fields.find(f => f.type === 'number');
        const existingSeries = displayControl.value?.props.series ?? [];
        const newSeries = slot && field
          ? (existingSeries.length > 0
              ? existingSeries.map(s => ({
                  target: 'slot' as const,
                  slotId: slot.id,
                  field: field.key,
                  color: s.color || DEFAULT_CHART_COLORS[0]
                }))
              : [{ target: 'slot' as const, slotId: slot.id, field: field.key, color: DEFAULT_CHART_COLORS[0] }])
          : [];
        props({ series: newSeries });
      }
    }
    function seriesChange(index: number, key: 'target' | 'slotId' | 'schemaType' | 'field' | 'color', event: Event) {
      const series = clone(displayControl.value?.props.series ?? []);
      const val = v(event);
      if (key === 'target') {
        if (val === 'global') {
          const globalSchema = state.schemas.find(s => !s.isEntity);
          const field = globalSchema?.fields.find(f => f.type === 'number');
          series[index] = { target: 'global', schemaType: globalSchema?.type || 'port_stats', field: field?.key || DEFAULT_GLOBAL_CHART_FIELD, color: series[index].color || DEFAULT_CHART_COLORS[0] };
        } else {
          const slot = selectedTemplate.value?.slots[0];
          const field = state.schemas.find(s => s.type === slot?.schemaType)?.fields.find(f => f.type === 'number');
          series[index] = { target: 'slot', slotId: slot?.id || '', field: field?.key || DEFAULT_SLOT_CHART_FIELD, color: series[index].color || DEFAULT_CHART_COLORS[0] };
        }
      } else {
        series[index][key] = val;
      }
      props({ series });
    }
    function seriesAdd() {
      const isGlobal = isLineGlobal.value || !currentLineSchema.value?.isEntity;
      if (isGlobal) {
        const numField = currentLineNumericFields.value[0]?.key || DEFAULT_GLOBAL_CHART_FIELD;
        props({
          series: [
            ...(displayControl.value?.props.series ?? []),
            {
              target: 'global',
              schemaType: lineSchemaType.value,
              field: numField,
              color: DEFAULT_CHART_COLORS[(displayControl.value?.props.series?.length ?? 0) % DEFAULT_CHART_COLORS.length]
            }
          ]
        });
        return;
      }
      let slot = selectedTemplate.value?.slots[0];
      if (!slot) {
        slot = createSlot('对象1', lineSchemaType.value) ?? undefined;
      }
      const numField = currentLineNumericFields.value[0]?.key || DEFAULT_SLOT_CHART_FIELD;
      props({
        series: [
          ...(displayControl.value?.props.series ?? []),
          {
            target: 'slot',
            slotId: slot?.id || '',
            field: numField,
            color: DEFAULT_CHART_COLORS[(displayControl.value?.props.series?.length ?? 0) % DEFAULT_CHART_COLORS.length]
          }
        ]
      });
    }
    function seriesRemove(index: number) { props({ series: (displayControl.value?.props.series ?? []).filter((_, i) => i !== index) }); }
    const numericFields = (slotId?: string) => slotId ? (state.schemas.find(s => s.type === selectedTemplate.value?.slots.find(x => x.id === slotId)?.schemaType)?.fields.filter(f => f.type === 'number') ?? []) : [];
    const globalNumericFields = (schemaType: string) => state.schemas.find(s => s.type === schemaType)?.fields.filter(f => f.type === 'number') ?? [];
    const tableSchema = computed(() => state.schemas.find(s => s.type === displayControl.value?.props.schemaType));
    function filterValue(event: Event) { const f = tableSchema.value?.fields.find(f => f.key === displayControl.value?.props.filterField); const value = v(event); props({ filterValue: f?.type === 'number' ? value === '' ? null : Number(value) : value }); }
    function column(key: string, event: Event) { const list = displayControl.value?.props.columns ?? []; props({ columns: checked(event) ? [...list, key] : list.filter(k => k !== key) }); }
    async function imageUpload(event: Event) { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; if (!['image/png','image/jpeg','image/gif','image/webp','image/svg+xml'].includes(file.type) || file.size > 1_000_000) return notify('请选择 1 MB 以内的 PNG/JPG/GIF/WebP/SVG 图片', true); const reader = new FileReader(); reader.onload = () => props({ imageType: 'image', imageUrl: String(reader.result) }); reader.onerror = () => notify('图片读取失败', true); reader.readAsDataURL(file); }
    async function kpiEmblemUpload(event: Event) { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; if (!['image/png','image/jpeg','image/gif','image/webp','image/svg+xml'].includes(file.type) || file.size > 1_000_000) return notify('请选择 1 MB 以内的 PNG/JPG/GIF/WebP/SVG 图片', true); const reader = new FileReader(); reader.onload = () => props({ variant: 'kpi', imageUrl: String(reader.result), iconType: 'vessel' }); reader.onerror = () => notify('图片读取失败', true); reader.readAsDataURL(file); }
    function renameScreen(event: Event) { if (state.screen) { checkpoint(); state.screen.name = v(event); } }
    function header(event: Event) { if (state.view === 'workshop' && state.draft) state.draft.showHeader = checked(event); else if (selectedInstance.value) { checkpoint(); selectedInstance.value.showHeader = checked(event); } }
    function layer(event: Event) { if (selectedInstance.value) { checkpoint(); selectedInstance.value.position.zIndex = Math.max(0, Math.min(999, Number(v(event)) || 1)); } }
    function lightRule(index: number, key: 'value' | 'color', event: Event) {const rules=clone(displayControl.value?.props.colorRules??[]);if(rules[index])rules[index][key]=v(event);props({colorRules:rules});}
    function addLightRule() { props({colorRules:[...(displayControl.value?.props.colorRules??[]),{value:'新状态',color:'#22D3EE'}]}); }
    function removeLightRule(index: number) { props({colorRules:(displayControl.value?.props.colorRules??[]).filter((_,i)=>i!==index)}); }
    const targets = (type: string) => state.store.list(type);
    const assign = (slot: string, event: Event) => selectedInstance.value && retarget(selectedInstance.value.instanceId, slot, v(event));
    function changeKpiIcon(event: Event) {
      const val = v(event);
      props({
        iconType: val === 'custom' ? 'vessel' : (val as 'vessel' | 'cargo' | 'fishing' | 'alert' | 'none'),
        imageUrl: val === 'custom' ? displayControl.value?.props.imageUrl : ''
      });
    }
    const headerChecked = computed(() => {
      if (state.view === 'workshop') return state.draft?.showHeader ?? true;
      return selectedInstance.value?.showHeader ?? selectedTemplate.value?.showHeader ?? true;
    });
    const instanceTitle = computed(() => {
      if (state.view === 'workshop') return state.draft?.name ?? '';
      return selectedInstance.value?.title ?? '';
    });
    const instanceSubTitle = computed(() => {
      if (state.view === 'workshop') return state.draft?.subTitle ?? '';
      return selectedInstance.value?.subTitle ?? '';
    });
    const defaultSubTitlePlaceholder = computed(() => {
      const slotsCount = selectedTemplate.value?.slots.length ?? 0;
      return `默认：${slotsCount ? '目标监控' : '数据总览'}（清空则隐藏）`;
    });
    const showResetSubTitle = computed(() => {
      if (state.view === 'workshop') return state.draft?.subTitle !== undefined;
      return selectedInstance.value?.subTitle !== undefined;
    });
    function resetSubTitle() {
      if (state.view === 'workshop' && state.draft) {
        delete state.draft.subTitle;
      } else if (selectedInstance.value) {
        checkpoint();
        delete selectedInstance.value.subTitle;
      }
    }
    function changeInstanceTitle(event: Event) {
      const val = v(event);
      if (state.view === 'workshop' && state.draft) {
        state.draft.name = val.trim() || '未命名模板';
      } else if (selectedInstance.value) {
        checkpoint();
        selectedInstance.value.title = val.trim();
      }
    }
    function changeInstanceSubTitle(event: Event) {
      const val = v(event);
      if (state.view === 'workshop' && state.draft) {
        state.draft.subTitle = val.trim();
      } else if (selectedInstance.value) {
        checkpoint();
        selectedInstance.value.subTitle = val.trim();
      }
    }
    return { lineSchemaType, currentLineSchema, currentLineNumericFields, changeLineSchema, creatingSlotForSeries, newSlotDraft, renamingSlotId, renameSlotDraft, onSlotSelectChange, commitNewSlot, cancelNewSlot, startRenameSlot, commitRenameSlot, cancelRenameSlot, setXAxisMode, changeXAxisField, headerChecked, instanceTitle, instanceSubTitle, defaultSubTitlePlaceholder, showResetSubTitle, resetSubTitle, changeInstanceTitle, changeInstanceSubTitle, changeKpiIcon, kpiEmblemUpload, alignInstance, moveLayer, lightRule, addLightRule, removeLightRule, state, tab, geometryKeys, filterValue, selectedInstance, selectedTemplate, selectedControl, displayControl, isLineGlobal, v, checked, schema, fields, scalar, resolved, props, mode, setLineSourceMode, globalNumericFields, bindTarget, changeField, position, dimension, resetOverride, staticValue, numberProp, custom, seriesChange, seriesAdd, seriesRemove, numericFields, tableSchema, column, imageUpload, renameScreen, header, layer, targets, assign, addSlot, removeSlot, checkpoint, patchControl };
  }
});
</script>
<template>
  <aside class="inspector"><div class="aside-title"><span>属性检查器</span><span class="eyebrow">INSPECTOR</span></div><div class="inspector-scroll">
    <template v-if="!selectedTemplate"><div class="inspector-context"><small>当前选中</small><h3>大屏画布</h3></div><section v-if="state.screen" class="property-section"><h4>画布配置</h4><label>大屏名称<input :value="state.screen.name" maxlength="120" @change="renameScreen"></label><label>基准分辨率<input value="1920 × 1080（标准基准）" disabled></label><p class="field-help">固定 1920×1080 标准基准；投屏自动等比适配视口，非 16:9 屏幕保留必要留白，不裁切业务内容。</p></section><div class="inspector-tip">点击组件选择实例，点击内部数值或文本选择具体控件。</div></template>
    <template v-else><div class="inspector-context"><small>{{ state.view==='workshop'?'组件模板（源资产）':'组件实例（私有配置）' }}</small><h3>{{ selectedTemplate.name }}</h3><select aria-label="选中控件" v-model="state.selectedControl"><option value="">整个组件{{ state.view==='workshop'?'模板':'实例' }}</option><option v-for="c in selectedTemplate.controls" :key="c.id" :value="c.id">{{ c.id }} · {{ c.type }}</option></select><p v-if="displayControl" class="selected-path">{{ selectedTemplate.name }} <b>›</b> {{ displayControl.id }} <button class="link-button" style="margin-left:6px;" @click="state.selectedControl=''">[选整个组件]</button></p></div>
      <section class="property-section card-header-pinned">
        <h4>组件卡头设置</h4>
        <label class="checkbox-row"><input type="checkbox" :checked="headerChecked" @change="header">显示组件卡头</label>
        <template v-if="headerChecked">
          <label>主标题<input :value="instanceTitle" :placeholder="selectedTemplate.name" maxlength="120" @change="changeInstanceTitle"></label>
          <label>副标题<input :value="instanceSubTitle" :placeholder="defaultSubTitlePlaceholder" maxlength="120" @change="changeInstanceSubTitle"></label>
          <button v-if="showResetSubTitle" class="link-button" @click="resetSubTitle">恢复默认副标题</button>
        </template>
      </section>
      <template v-if="displayControl"><div class="property-tabs"><button :class="{active:tab==='data'}" @click="tab='data'">数据绑定</button><button :class="{active:tab==='style'}" @click="tab='style'">外观布局</button></div>
        <div v-if="tab==='data'">
          <section v-if="scalar" class="property-section"><h4>数据源模式</h4><div class="segmented"><button :class="{active:displayControl.props.sourceMode!=='dynamic'}" @click="mode('static')">固定内容</button><button :class="{active:displayControl.props.sourceMode==='dynamic'}" @click="mode('dynamic')">动态绑定</button></div>
            <template v-if="displayControl.props.sourceMode!=='dynamic'"><label v-if="displayControl.type==='time'" class="checkbox-row"><input type="checkbox" :checked="displayControl.props.clock" @change="props({clock:!displayControl.props.clock})">显示当前时间</label><label v-if="displayControl.type!=='image'&&!displayControl.props.clock">固定内容<input :type="displayControl.type==='number'?'number':'text'" :value="displayControl.props.staticValue" @change="staticValue"></label><p class="field-help">静态内容不会被实时推流改写。</p></template>
            <template v-else><label>绑定范围<select aria-label="绑定范围" :value="displayControl.binding?.target || 'slot'" @change="bindTarget(v($event)==='global'?'global':'slot')"><option value="slot">对象槽位</option><option value="global">全局数据</option></select></label><label v-if="displayControl.binding?.target==='global'">全局数据模式<select aria-label="全局数据模式" :value="displayControl.binding.schemaType" @change="bindTarget('global',v($event))"><option v-for="s in state.schemas.filter(s=>!s.isEntity)" :key="s.type" :value="s.type">{{ s.name }}</option></select></label><label v-else>归属对象槽位<select aria-label="归属对象槽位" :value="displayControl.binding?.slotId" @change="bindTarget('slot',v($event))"><option v-for="slot in selectedTemplate.slots" :key="slot.id" :value="slot.id">{{ slot.label }}</option></select></label><label>映射字段<select aria-label="映射字段" :value="displayControl.binding?.field" @change="changeField"><option v-for="field in fields" :key="field.key" :value="field.key">{{ field.name }}{{ field.unit?' / '+field.unit:'' }}</option></select></label><p class="field-help">切换字段会同步标签、单位与默认精度。</p><label class="checkbox-row"><input type="checkbox" :checked="displayControl.props.labelMode==='custom'" @change="custom">自定义标签与单位</label><template v-if="displayControl.props.labelMode==='custom'"><label>标签<input :value="displayControl.props.label" @change="props({label:v($event)})"></label><label>单位<input :value="displayControl.props.unit" @change="props({unit:v($event)})"></label></template><label v-if="displayControl.type==='number'">小数位数<select :value="displayControl.props.precision ?? ''" @change="props({precision:v($event)===''?null:Number(v($event))})"><option value="">遵循数据模式</option><option v-for="n in 7" :key="n" :value="n-1">{{ n-1 }} 位</option></select></label><label>字段过期阈值（秒）<input type="number" min="10" max="86400" :value="displayControl.props.staleSeconds ?? 120" @change="numberProp('staleSeconds',$event)"></label></template>
          </section>
          <section v-if="displayControl.type==='light'" class="property-section"><h4>状态颜色规则</h4><div v-for="(rule,index) in displayControl.props.colorRules" :key="index" class="light-rule"><input :value="rule.value" aria-label="状态值" @change="lightRule(index,'value',$event)"><input type="color" :value="rule.color" aria-label="状态颜色" @change="lightRule(index,'color',$event)"><button class="link-button" @click="removeLightRule(index)" aria-label="移除颜色规则">×</button></div><button class="button full" @click="addLightRule">＋ 添加状态颜色</button><p class="field-help">未命中的状态使用中性色，缺值保持“状态未知”，不推断为正常。</p></section><section v-if="displayControl.type==='image'" class="property-section"><h4>图片与装饰动效</h4><label>显示内容<select aria-label="显示内容" :value="displayControl.props.imageType || 'image'" @change="props({imageType:v($event)==='radar'?'radar':v($event)==='sonar'?'sonar':'image'})"><option value="radar">雷达扫描（装饰）</option><option value="sonar">声纳波纹（装饰）</option><option value="image">自定义图片</option></select></label><label v-if="displayControl.props.sourceMode!=='dynamic'">图片地址<input :value="displayControl.props.imageUrl" placeholder="https://…" @change="props({imageUrl:v($event),imageType:'image'})"></label><label>或上传图片<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" @change="imageUpload"></label><p class="field-help">仅作为图片显示，不执行上传的 SVG 脚本。动效不代表业务测量。</p></section>
          <section v-if="displayControl.type==='line'" class="property-section">
            <h4>数据类型 (Schema)</h4>
            <select aria-label="折线图数据类型" :value="lineSchemaType" @change="changeLineSchema">
              <optgroup label="实体数据类型（支持多对象对比与航迹）">
                <option v-for="s in state.schemas.filter(s=>s.isEntity)" :key="s.type" :value="s.type">{{ s.name }}</option>
              </optgroup>
              <optgroup label="全局统计指标（无需槽位）">
                <option v-for="s in state.schemas.filter(s=>!s.isEntity)" :key="s.type" :value="s.type">{{ s.name }}</option>
              </optgroup>
            </select>

            <h4>X 轴坐标基准</h4>
            <div class="segmented">
              <button :class="{active: (displayControl.props.xAxisMode ?? 'time') === 'time'}" @click="setXAxisMode('time')">滑动时间轴</button>
              <button :disabled="!currentLineSchema?.isEntity" :class="{active: displayControl.props.xAxisMode === 'field'}" @click="setXAxisMode('field')">实体数值字段 (自由双轴)</button>
            </div>

            <template v-if="(displayControl.props.xAxisMode ?? 'time') === 'time'">
              <label>时间跨度<select aria-label="时间跨度" :value="displayControl.props.lookbackMinutes ?? 20" @change="numberProp('lookbackMinutes',$event)"><option v-for="n in [1,15,20,30,60]" :key="n" :value="n">{{ n }} 分钟{{ n===1?'（短窗口调试）':'' }}</option></select></label>
              <label>断线间隔（秒）<input type="number" min="1" :value="displayControl.props.gapSeconds ?? 120" @change="numberProp('gapSeconds',$event)"></label>
            </template>
            <template v-else>
              <label>X 轴数值字段
                <select aria-label="X 轴数值字段" :value="displayControl.props.xAxisField || currentLineNumericFields[0]?.key" @change="changeXAxisField">
                  <option v-for="field in currentLineNumericFields" :key="field.key" :value="field.key">{{ field.name }}{{ field.unit ? ' / ' + field.unit : '' }}</option>
                </select>
              </label>
              <p class="field-help">X 与 Y 轴按采样时间先后顺序顺次连线，实时呈现航迹线；末端发光高亮最新位置。</p>
            </template>

            <h4>曲线配置 (Y 轴度量)</h4>
            <div v-for="(series,index) in displayControl.props.series" :key="index" class="series-config">
              <div><strong>曲线 {{ index+1 }}</strong><button class="link-button" @click="seriesRemove(index)">移除</button></div>
              <template v-if="series.target === 'global' || !currentLineSchema?.isEntity">
                <select aria-label="统计指标字段" :value="series.field" @change="seriesChange(index,'field',$event)">
                  <option v-for="field in currentLineNumericFields" :key="field.key" :value="field.key">{{ field.name }}{{ field.unit ? ' / ' + field.unit : '' }}</option>
                </select>
              </template>
              <template v-else>
                <div v-if="creatingSlotForSeries === index" class="inline-slot-creator" style="display:flex;gap:6px;align-items:center;">
                  <input v-model="newSlotDraft" placeholder="输入占位符名称，如：领航船" autofocus @keydown.enter.stop="commitNewSlot(index)" @keydown.esc.stop="cancelNewSlot" style="flex:1;font-size:11px;padding:4px 6px;">
                  <button class="button" style="height:26px;padding:0 8px;font-size:11px;" @click="commitNewSlot(index)">确定</button>
                  <button class="link-button" style="font-size:11px;" @click="cancelNewSlot">取消</button>
                </div>
                <div v-else-if="renamingSlotId === series.slotId" class="inline-slot-creator" style="display:flex;gap:6px;align-items:center;">
                  <input v-model="renameSlotDraft" placeholder="修改占位符名称" autofocus @keydown.enter.stop="commitRenameSlot" @keydown.esc.stop="cancelRenameSlot" style="flex:1;font-size:11px;padding:4px 6px;">
                  <button class="button" style="height:26px;padding:0 8px;font-size:11px;" @click="commitRenameSlot">保存</button>
                  <button class="link-button" style="font-size:11px;" @click="cancelRenameSlot">取消</button>
                </div>
                <div v-else style="display:flex;gap:6px;align-items:center;">
                  <select aria-label="归属对象槽位" :value="series.slotId" @change="onSlotSelectChange(index,$event)" style="flex:1;">
                    <option v-for="slot in selectedTemplate.slots" :key="slot.id" :value="slot.id">{{ slot.label }}</option>
                    <option value="__new__">＋ 新建对象占位符...</option>
                  </select>
                  <button v-if="series.slotId" class="link-button" title="就地重命名该占位符" @click="startRenameSlot(series.slotId)">✎ 改名</button>
                </div>
                <label style="font-size:11px;color:#739dbb;margin:2px 0 0;">Y 轴度量字段
                  <select aria-label="监控指标字段" :value="series.field" @change="seriesChange(index,'field',$event)">
                    <option v-for="field in currentLineNumericFields" :key="field.key" :value="field.key">{{ field.name }}{{ field.unit ? ' / ' + field.unit : '' }}</option>
                  </select>
                </label>
              </template>
              <label style="font-size:11px;color:#739dbb;margin:2px 0 0;">曲线颜色
                <input type="color" :value="series.color || '#22D3EE'" aria-label="曲线颜色" @change="seriesChange(index,'color',$event)">
              </label>
            </div>
            <button class="button full" @click="seriesAdd">＋ 添加曲线</button>
            <p class="field-help">{{ !currentLineSchema?.isEntity ? '全局模式免槽位声明，直接绑定港口宏观指标。' : '支持多对象对比；占位符可在模板各控件间共享，大屏运行时指派具体船舶。' }}</p>
          </section>
          <section v-if="displayControl.type==='table'" class="property-section">
            <h4>动态对象集合</h4>
            <label class="checkbox-row">
              <input type="checkbox" :checked="displayControl.props.staleEnabled !== false" @change="props({staleEnabled: checked($event)})">
              启用停更时效弱化置灰
            </label>
            <label v-if="displayControl.props.staleEnabled !== false">
              超时门槛秒数
              <input type="number" min="0" max="3600" :value="displayControl.props.staleSeconds ?? 120" @change="numberProp('staleSeconds',$event)">
            </label>
            <p class="field-help">超期未上报增量的船只将自动置灰弱化并标注[停更]，置 0 或关闭则常态高亮。</p>
            <label>自动翻页（显示态）<select aria-label="自动翻页（显示态）" :value="displayControl.props.autoPageSeconds ?? 0" @change="numberProp('autoPageSeconds',$event)"><option :value="0">关闭</option><option v-for="n in [5,8,10,15,30]" :key="n" :value="n">每 {{n}} 秒</option></select></label>
            <label>数据模式<select aria-label="数据模式" :value="displayControl.props.schemaType" @change="props({schemaType:v($event),columns:[],filterField:'',filterValue:''})"><option v-for="s in state.schemas.filter(s=>s.isEntity)" :key="s.type" :value="s.type">{{ s.name }}</option></select></label>
            <label v-for="field in tableSchema?.fields" :key="field.key" class="checkbox-row"><input type="checkbox" :checked="displayControl.props.columns?.includes(field.key)" @change="column(field.key,$event)">{{ field.name }}</label>
            <label>过滤字段<select aria-label="过滤字段" :value="displayControl.props.filterField || ''" @change="props({filterField:v($event),filterValue:''})"><option value="">不过滤</option><option v-for="field in tableSchema?.fields" :key="field.key" :value="field.key">{{ field.name }}</option></select></label>
            <label v-if="displayControl.props.filterField">等于<input :value="displayControl.props.filterValue" @change="filterValue"></label>
            <label>每页行数<input type="number" min="1" max="20" :value="displayControl.props.pageSize ?? 4" @change="numberProp('pageSize',$event)"></label>
          </section>
          <section v-if="resolved" class="resolved-preview"><small>解析预览</small><strong>{{ resolved.value }} <span>{{ resolved.unit }}</span></strong><p>{{ resolved.label }} · {{ resolved.empty?'暂无数据':resolved.stale?'已过期':'已有数据' }}</p></section>
        </div>
        <div v-else>
          <section class="property-section"><h4>控件几何位置</h4><div class="property-grid"><label v-for="key in geometryKeys" :key="key">{{ key.toUpperCase() }}<input type="number" :value="displayControl.style[key]" @change="position(key,$event)"></label></div><label>字号<input type="number" min="10" max="96" :value="displayControl.style.fontSize ?? 24" @change="patchControl({style:{fontSize:Math.min(96,Math.max(10,Number(v($event))||24))}})"></label><label>文字 / 指标颜色<input type="color" :value="displayControl.style.color || '#DBF4FF'" @change="patchControl({style:{color:v($event)}})"></label></section>
          <section v-if="displayControl.type==='number'" class="property-section">
            <h4>KPI 样式与右侧徽标</h4>
            <label class="checkbox-row"><input type="checkbox" :checked="displayControl.props.variant==='kpi'" @change="props({variant:checked($event)?'kpi':'standard'})">启用 KPI 科技指标卡片风格</label>
            <template v-if="displayControl.props.variant==='kpi'">
              <label>预设徽标图标<select :value="displayControl.props.imageUrl?'custom':(displayControl.props.iconType||'vessel')" @change="changeKpiIcon"><option value="vessel">商船（默认）</option><option value="cargo">货船</option><option value="fishing">渔船</option><option value="alert">告警三角</option><option value="none">无徽标（关闭隐藏）</option><option v-if="displayControl.props.imageUrl" value="custom">★ 已上传自定义图片</option></select></label>
              <label>或上传图片替换徽标<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" @change="kpiEmblemUpload"></label>
              <button v-if="displayControl.props.imageUrl" class="link-button" @click="props({imageUrl:''})">清除自定义图片，使用预设图标</button>
            </template>
          </section>
        </div>
        <button v-if="state.view!=='workshop'" class="button full" @click="resetOverride">恢复该控件的模板默认值</button>
      </template>
      <template v-else>
        <section v-if="state.view==='workshop'&&state.draft" class="property-section"><h4>组件模板尺寸与槽位</h4><div class="property-grid"><label>宽度<input type="number" :value="state.draft.layout.width" @change="dimension('width',$event)"></label><label>高度<input type="number" :value="state.draft.layout.height" @change="dimension('height',$event)"></label></div><h4>对象槽位声明</h4><div v-for="slot in state.draft.slots" :key="slot.id" class="slot-declaration"><input v-model="slot.label" aria-label="槽位名称"><select v-model="slot.schemaType" aria-label="槽位数据模式"><option v-for="s in state.schemas.filter(s=>s.isEntity)" :key="s.type" :value="s.type">{{ s.name }}</option></select><button class="link-button" @click="removeSlot(slot)">删除槽位</button></div><button class="button full" @click="addSlot">＋ 声明对象槽位</button><p class="field-help">只声明抽象槽位，不保存具体船舶。预览数据不会写入模板。</p></section>
        <section v-else-if="selectedInstance" class="property-section"><h4>实例布局与对齐</h4><div class="alignment-tools"><button @click="alignInstance('left')" title="对齐画布左侧">左</button><button @click="alignInstance('center')" title="水平居中">中</button><button @click="alignInstance('right')" title="对齐画布右侧">右</button><button @click="alignInstance('top')" title="对齐画布顶部">上</button><button @click="alignInstance('middle')" title="垂直居中">中</button><button @click="alignInstance('bottom')" title="对齐画布底部">下</button></div><div class="layer-actions"><button class="button" @click="moveLayer('front')">置于顶层</button><button class="button" @click="moveLayer('back')">置于底层</button></div><div class="property-grid"><label v-for="key in geometryKeys" :key="key">{{ key.toUpperCase() }}<input type="number" :value="selectedInstance.position[key]" @change="position(key,$event)"></label></div><label>层级<input type="number" min="0" max="999" :value="selectedInstance.position.zIndex ?? 1" @change="layer"></label><h4>对象槽位指派</h4><label v-for="slot in selectedTemplate.slots" :key="slot.id">{{ slot.label }}<select :value="selectedInstance.slotBindings[slot.id] || ''" @change="assign(slot.id,$event)"><option value="">未绑定对象</option><option v-for="item in targets(slot.schemaType)" :key="item.id" :value="item.id">{{ item.record.data.vessel_name || item.id }} · {{ item.id }}</option></select></label><p v-if="!selectedTemplate.slots.length" class="field-help">该组件不依赖实体对象槽位。</p><p class="field-help">点击组件内的具体控件，可独立修改字段；改动只保存在当前实例。</p></section>
      </template>
    </template>
  </div></aside>
</template>
