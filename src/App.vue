<script lang="ts">
import { computed, defineComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ComponentInstance, ControlType, Geometry } from './types.ts';
import { clone, fitGeometry } from './engine/core.ts';
import * as runtime from './runtime.ts';
import InstanceCard from './components/InstanceCard.vue';
import Inspector from './components/Inspector.vue';
import ObjectDrawer from './components/ObjectDrawer.vue';
export default defineComponent({
  components: { InstanceCard, Inspector, ObjectDrawer },
  setup() {
    const { state } = runtime;
    const viewport = ref<HTMLElement | null>(null), dimensions = ref({ width: 1000, height: 700 }), search = ref('');
    const logical = computed(() => state.view === 'workshop' ? state.draft?.layout ?? { width: 608, height: 320 } : state.screen?.resolution ?? { width: 1920, height: 1080 });
    const scale = computed(() => {
      const pad = state.view === 'viewer' ? 0 : 64;
      const fit = Math.min((dimensions.value.width-pad)/logical.value.width, (dimensions.value.height-pad)/logical.value.height);
      return Math.max(.08, state.view === 'workshop' ? Math.min(1.25, fit) : state.view === 'viewer' || state.zoom === 'fit' ? fit : Number(state.zoom)/100);
    });
    const atoms = computed(() => state.templates.filter(t => t.category === '原子控件'));
    const assets = computed(() => state.templates.filter(t => t.category !== '原子控件' && t.name.includes(search.value)));
    const templateOf = (id: string) => state.templates.find(t => t.id === id)!;
    const labels: Record<string, string> = { text: '文本', number: '数值', time: '时间', light: '指示灯', table: '表格', line: '曲线', image: '图片' };
    const controlLabel = (type: string) => labels[type] ?? type;
    const icons: Record<string, string> = { text: 'T', number: '#', time: '◷', light: '◉', table: '▤', line: '⌁', image: '▧' };
    const controlIcon = (type: string) => icons[type] ?? '◇';
    const previewInstance = computed<ComponentInstance>(() => ({ instanceId: 'workshop_preview', templateId: state.draft?.id ?? '', position: { x: 0, y: 0, w: logical.value.width, h: logical.value.height }, slotBindings: Object.fromEntries((state.draft?.slots ?? []).map((slot, index) => [slot.id, state.store.list(slot.schemaType)[index]?.id ?? ''])), controlOverrides: {} }));
    let observer: ResizeObserver | undefined, cleanupDrag: (() => void) | undefined;
    async function observe() { await nextTick(); observer?.disconnect(); if (viewport.value) { observer = new ResizeObserver(([entry]) => { dimensions.value = { width: viewport.value?.clientWidth ?? entry.contentRect.width, height: viewport.value?.clientHeight ?? entry.contentRect.height }; }); observer.observe(viewport.value); } }
    watch(() => [state.view, state.loading, state.error], observe);
    function libraryDrag(event: DragEvent, id: string) { event.dataTransfer?.setData('application/litecode-template', id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'; }
    function drop(event: DragEvent) {
      if (state.view !== 'editor') return; event.preventDefault();
      const id = event.dataTransfer?.getData('application/litecode-template'); if (!id) return;
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); runtime.addTemplate(id, (event.clientX-rect.left)/scale.value, (event.clientY-rect.top)/scale.value);
    }
    function drag(payload: { event: PointerEvent; instanceId: string; controlId: string; resize: boolean }) {
      cleanupDrag?.();
      const workshop = state.view === 'workshop';
      const target = workshop ? state.draft?.controls.find(c => c.id === payload.controlId)?.style : state.screen?.components.find(i => i.instanceId === payload.instanceId)?.position;
      if (!target || (!workshop && state.view !== 'editor')) return;
      if (!workshop) runtime.checkpoint();
      const original = clone(target), start = { x: payload.event.clientX, y: payload.event.clientY }, ratio = scale.value;
      const move = (event: PointerEvent) => {
        if (event.pointerId !== payload.event.pointerId) return;
        const dx = Math.round((event.clientX-start.x)/ratio/4)*4, dy = Math.round((event.clientY-start.y)/ratio/4)*4;
        const geometry: Geometry = payload.resize ? { ...original, w: original.w+dx, h: original.h+dy } : { ...original, x: original.x+dx, y: original.y+dy };
        Object.assign(target, fitGeometry(geometry, logical.value.width, logical.value.height));
      };
      const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); document.body.classList.remove('dragging'); cleanupDrag = undefined; };
      document.body.classList.add('dragging'); window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end); cleanupDrag = end;
    }
    function removeControl() { if (!state.draft || !state.selectedControl) return; state.draft.controls = state.draft.controls.filter(c => c.id !== state.selectedControl); state.selectedControl = ''; }
    function keyboard(event: KeyboardEvent) {
      if (state.help) {if(event.key==='Escape')state.help=false;return;}
      if (state.drawer) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); (event.target as HTMLElement)?.blur?.(); void nextTick().then(()=>state.view === 'workshop' ? runtime.saveTemplate() : runtime.saveScreen()); return; }
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key === 'Escape') { if (state.view === 'viewer') runtime.setView('editor'); else runtime.clearSelection(); }
      if (state.view === 'editor' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? runtime.redo() : runtime.undo(); }
      if (event.key === 'Delete' && state.view === 'workshop') removeControl();
      if (event.key === 'Delete' && state.view === 'editor' && !state.selectedControl) runtime.removeInstance();
    }
    onMounted(async () => { window.addEventListener('keydown', keyboard); await runtime.initialize(); await observe(); });
    onUnmounted(() => { observer?.disconnect(); cleanupDrag?.(); runtime.dispose(); window.removeEventListener('keydown', keyboard); });
    return { ...runtime, viewport, dimensions, logical, scale, search, atoms, assets, templateOf, controlLabel, controlIcon, previewInstance, libraryDrag, drop, drag, removeControl, valueOf: (e: Event) => (e.target as HTMLInputElement).value };
  }
});
</script>
<template>
  <div class="application" :class="{'mode-viewer':state.view==='viewer'}"><div class="application-content" :inert="state.drawer || state.help || undefined">
    <header v-if="state.view!=='viewer'" class="top-hub"><div class="brand"><span class="brand-symbol">◇</span><div><strong>LiteCodeTool</strong><small>轻量化低代码大屏平台</small></div></div><nav><button :class="{active:state.view==='editor'}" @click="setView('editor')">大屏画布</button><button :class="{active:state.view==='workshop'}" @click="setView('workshop')">组件工坊</button><button :class="{active:state.view==='data'}" @click="setView('data')">数据状态</button></nav><div class="top-status"><button class="button help-button" @click="state.help=true">使用说明</button><span class="source-tag" :class="{demo:state.sourceMode==='demo'}">{{ state.sourceMode==='demo'?'演示数据 · 非生产':state.sourceMode==='live'?'真实数据模式':'等待数据连接' }}</span><span class="transport-status" :class="{connected:state.connected}"><i></i>{{ state.connected?'推流已连接':'推流未连接' }}</span></div></header>
    <main v-if="state.loading || state.error" class="startup"><span class="startup-emblem">◇</span><h1>{{ state.error?'暂时无法打开大屏':'正在载入大屏配置' }}</h1><p>{{ state.error || '读取组件模板、初始底账与默认对象指派' }}</p><button v-if="state.error" class="button primary" @click="initialize">重新载入</button></main>
    <template v-else-if="state.view==='data'"><section class="data-page"><div class="data-intro"><div><span class="eyebrow">DATA CONNECTION</span><h1>数据连接与初始底账</h1><p>连接状态不等于业务正常。未接入、缺字段、过期与演示数据分别标注。</p></div><div v-if="state.sourceMode==='demo'" class="toolbar-actions"><button class="button" @click="demoAction('toggle')">{{ state.paused?'恢复演示推流':'暂停演示推流' }}</button><button class="button primary" @click="demoAction('discover')">模拟发现新船</button></div></div><div class="data-cards"><article class="tech-panel"><h2>连接状态</h2><dl><dt>数据来源</dt><dd>{{ state.sourceMode==='demo'?'独立演示目录':'真实数据目录' }}</dd><dt>WebSocket</dt><dd>{{ state.connected?'已连接':'已断开，将自动重连' }}</dd><dt>最新收到增量</dt><dd>{{ state.lastUpdate?new Date(state.lastUpdate).toLocaleString('zh-CN'):'尚未接收到增量' }}</dd><dt>已发现实体</dt><dd>{{ state.store.list('vessel').length }}</dd></dl><p class="field-help">真实接入使用带凭据的增量接口；凭据只配置在服务端环境变量，不进入前端。</p></article><article class="tech-panel"><h2>数据模式</h2><pre>{{ JSON.stringify(state.schemas,null,2) }}</pre></article><article class="tech-panel"><h2>实体池最新值</h2><pre>{{ JSON.stringify(state.store.list('vessel').map(i=>({id:i.id,data:i.record.data})),null,2) }}</pre></article></div></section></template>
    <template v-else>
      <div v-if="state.view!=='viewer'" class="workspace-toolbar"><div class="toolbar-title"><button class="icon-button" @click="state.leftOpen=!state.leftOpen" aria-label="展开或收起组件库">☷</button><template v-if="state.view==='editor'"><select :value="state.screen?.id" class="screen-picker" aria-label="当前大屏" @change="loadScreen(valueOf($event))"><option v-for="screen in state.screens" :key="screen.id" :value="screen.id">{{ screen.name }}</option></select><span class="save-indicator" :class="{dirty}">{{ dirty?'● 未保存':'已保存' }}</span></template><template v-else><strong>{{ state.draft?.name || '组件模板' }}</strong><span class="save-indicator" :class="{dirty:draftDirty}">{{ draftDirty?'● 未保存':'模板编辑' }}</span></template></div><div class="toolbar-actions"><template v-if="state.view==='editor'"><button class="icon-button" :disabled="!state.undo.length" @click="undo" title="撤销 Ctrl+Z">↶</button><button class="icon-button" :disabled="!state.redo.length" @click="redo" title="重做 Ctrl+Shift+Z">↷</button><span class="toolbar-separator"></span><select v-model="state.zoom" aria-label="画布缩放"><option value="fit">适应画布</option><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option></select><span class="zoom-label">{{ Math.round(scale*100) }}%</span><button class="button" @click="newScreen">新建</button><button class="button" @click="exportScreen">导出</button><label class="button import-button" :class="{disabled:state.importing}">{{state.importing?'导入中…':'导入'}}<input type="file" accept=".json" :disabled="state.importing" @change="importConfiguration"></label><button class="button" :disabled="state.saving||!dirty" @click="saveScreen">{{ state.saving?'保存中…':'保存' }}</button><button class="button primary" @click="setView('viewer')">▸ 显示态</button></template><template v-else><button class="button" @click="editTemplate()">新建模板</button><button class="button" :disabled="state.draftSaving" @click="saveTemplate(true)">另存为新模板</button><button class="button primary" :disabled="state.draftSaving" @click="saveTemplate()">{{ state.draftSaving?'保存中…':'保存入库' }}</button></template><button class="icon-button" @click="state.rightOpen=!state.rightOpen" aria-label="展开或收起属性面板">▥</button></div></div>
      <div class="workspace">
        <aside v-if="state.view!=='viewer'&&state.leftOpen" class="asset-library"><div class="aside-title"><span>{{ state.view==='workshop'?'原子控件库':'组件资产库' }}</span><span class="asset-count">{{ state.view==='workshop'?7:assets.length }}</span></div><div class="library-scroll"><input v-if="state.view==='editor'" v-model="search" class="library-search" placeholder="搜索组件模板…"><h4 class="library-section-title">基础原子控件</h4><div class="atom-grid"><button v-for="atom in atoms" :key="atom.id" :draggable="state.view==='editor'" @dragstart="libraryDrag($event,atom.id)" @click="state.view==='workshop'?addControl(atom.controls[0].type):addTemplate(atom.id)"><span>{{ controlIcon(atom.controls[0].type) }}</span><small>{{ controlLabel(atom.controls[0].type) }}</small></button></div>
          <template v-if="state.view==='editor'"><h4 class="library-section-title">可复用业务组件</h4><div v-for="asset in assets" :key="asset.id" class="asset-tile" draggable="true" @dragstart="libraryDrag($event,asset.id)"><button class="asset-add" @click="addTemplate(asset.id)"><span class="asset-preview" :class="'preview-'+asset.controls[0]?.type"><i></i><i></i><i></i><i></i></span><strong>{{ asset.name }}</strong><small>{{ asset.controls.length }} 个控件 · {{ asset.slots.length }} 个对象槽位</small></button><button class="asset-edit" @click="editTemplate(asset)" title="在组件工坊编辑">编辑模板 ↗</button></div></template>
          <template v-else><h4 class="library-section-title">控件树 <span>{{ state.draft?.controls.length }}</span></h4><button v-for="c in state.draft?.controls" :key="c.id" class="tree-item" :class="{active:state.selectedControl===c.id}" @click="state.selectedControl=c.id"><span>{{ controlIcon(c.type) }}</span><div><strong>{{ controlLabel(c.type) }}</strong><small>{{ c.id }}</small></div></button><p v-if="!state.draft?.controls.length" class="empty-note">点击上方原子控件，开始制作组件模板。</p><button v-if="state.selectedControl" class="button danger full" @click="removeControl">移除选中控件</button></template>
        </div></aside>
        <div class="canvas-area"><div v-if="state.view==='workshop'" class="workshop-note"><span>组件模板画布</span>实体数据仅用于预览；具体对象不会保存进模板。</div><div ref="viewport" class="canvas-viewport" :class="{'viewer-viewport':state.view==='viewer'}" @click="clearSelection">
          <div class="scaled-stage" :style="{width:logical.width*scale+'px',height:logical.height*scale+'px'}"><div class="screen-canvas" :class="{'workshop-canvas':state.view==='workshop'}" :style="{width:logical.width+'px',height:logical.height+'px',transform:'scale('+scale+')',backgroundColor:state.screen?.background}" @dragover.prevent @drop="drop">
            <template v-if="state.view==='workshop'&&state.draft"><InstanceCard :instance="previewInstance" :template="state.draft" workshop @drag="drag"/></template>
            <template v-else><template v-for="instance in state.screen?.components" :key="instance.instanceId"><InstanceCard v-if="templateOf(instance.templateId)" :instance="instance" :template="templateOf(instance.templateId)" @drag="drag"/><div v-else class="missing-template" :style="{left:instance.position.x+'px',top:instance.position.y+'px'}">组件模板 {{ instance.templateId }} 不存在</div></template><div v-if="!state.screen?.components.length" class="empty-canvas"><span>＋</span><h2>从左侧拖入组件模板</h2><p>或直接添加原子控件，自动生成单控件组件实例</p></div></template>
          </div></div>
        </div><div v-if="state.view!=='viewer'" class="canvas-bottom"><span>{{ logical.width }} × {{ logical.height }}<i>·</i>{{ state.view==='workshop'?'组件模板':'大屏画布' }}</span><span v-if="state.view==='editor'&&selectedInstance" class="selection-actions"><button @click="duplicateInstance">复制实例</button><button @click="removeInstance">删除实例</button></span><span>{{ state.view==='workshop'?'拖动控件调整位置 · 右下角调整尺寸':'点击内部控件配置字段 · 选中时临时前置，投屏保持层级' }}</span></div></div>
        <Inspector v-if="state.view!=='viewer'&&state.rightOpen"/>
      </div>
    </template>
    <div v-if="state.view==='viewer'&&!state.loading&&!state.error" class="viewer-status"><span :class="state.sourceMode==='demo'?'demo-text':''">{{ state.sourceMode==='demo'?'演示数据 · 不用于生产决策':'真实数据模式' }}</span><i></i><span>{{ state.connected?'WebSocket 已连接':'WebSocket 已断开' }}</span><span v-if="state.lastUpdate">· {{ Math.max(0,Math.floor((state.now-state.lastUpdate)/1000)) }} 秒前收到增量</span><span v-else>· 尚未收到增量</span></div>
    <div v-if="state.view==='viewer'" class="viewer-hud"><span v-if="dirty" class="dirty-state">● 未保存</span><span class="layout-locked">排版已锁定</span><button class="button" @click="fullscreen">⛶ 全屏</button><button class="button primary" @click="openDrawer()">⇄ 监控对象</button><button class="button subtle" @click="setView('editor')">返回编辑</button></div>
  </div><ObjectDrawer/>
  <div v-if="state.help" class="help-layer" @click.self="state.help=false"><section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><header><div><span class="eyebrow">QUICK START</span><h2 id="help-title">从一张卡片，到你的监控大屏</h2></div><button class="icon-button" @click="state.help=false" aria-label="关闭使用说明">×</button></header><div class="help-steps"><article><b>01</b><h3>编排大屏</h3><p>点击或拖入左侧组件。拖动卡片左上角移动，右下角调整大小。点击内部文字或数值，右侧可修改具体控件。</p></article><article><b>02</b><h3>绑定对象与字段</h3><p>先选整张卡片指派船舶，再选子控件设置字段。单张卡片的修改不会污染源模板。</p></article><article><b>03</b><h3>制作组件模板</h3><p>进入组件工坊，新建模板、添加控件、声明对象槽位。保存入库后，即可在任意大屏复用。</p></article><article><b>04</b><h3>投屏与保存</h3><p>显示态锁定布局。通过“监控对象”搜索换船；临时切换即时生效，保存为默认后重启仍保留。</p></article></div><div class="help-foot"><p><kbd>Ctrl+S</kbd> 保存　<kbd>Ctrl+Z</kbd> 撤销　<kbd>Esc</kbd> 关闭抽屉 / 返回编辑</p><p>“导出”包含大屏及引用模板；“导入”创建独立副本。曲线只显示本次打开后实际采集的样本，缺失历史不补造。</p><p class="demo-text">演示模式与真实模式的数据目录相互隔离。真实接入接收符合数据模式的 JSON，不包含原始 AIS 报文解码。</p></div></section></div><div v-if="state.notice" class="toast" :class="{'toast-error':state.noticeError}" role="status">{{ state.notice }}</div></div>
</template>
