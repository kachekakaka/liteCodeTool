<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import {
  screenState,
  dirty,
  refreshScreens,
  renameScreen,
  copyScreen,
  deleteScreen,
  newScreen,
} from '../stores/screens.ts';
import { uiState, notify } from '../stores/application.ts';

const search = ref('');
const error = ref('');
const loading = ref(false);
const integration = ref<{ id: string; name: string } | null>(null);
const router = useRouter();
/** 管理表单的一次操作，不与编辑器草稿混用。 */
type Operation = 'new' | 'rename' | 'copy' | 'delete';
const form = ref<{ operation: Operation; id: string; name: string } | null>(null);
const nameDraft = ref('');
const discard = ref(false);
const formError = ref('');
const formPanel = ref<HTMLElement | null>(null);
const labels = { new: '新建大屏', rename: '重命名大屏', copy: '复制大屏', delete: '删除大屏' };
const needsDiscard = computed(
  () =>
    dirty.value && (form.value?.operation === 'new' || screenState.screen?.id === form.value?.id),
);
const rows = computed(() =>
  screenState.screens.filter((row) =>
    row.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()),
  ),
);
const viewUrl = computed(() =>
  integration.value ? new URL(`/screens/${integration.value.id}/view`, location.origin).href : '',
);
const embedUrl = computed(() =>
  integration.value ? new URL(`/screens/${integration.value.id}/embed`, location.origin).href : '',
);
const embedCode = computed(
  () =>
    `<iframe src="${embedUrl.value}" title="${escapeAttribute(integration.value?.name ?? '')}" style="width: 100%; height: 100%; border: 0" allowfullscreen></iframe>`,
);

/**
 * 转义复制到 HTML 属性中的大屏名称。
 * @param value - 原始名称。
 * @returns 可安全放入双引号属性中的文字。
 */
function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * 从服务器刷新列表，请求失败保留已有列表并提供重试。
 * @returns 完成处理的 Promise。
 */
async function refresh(): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    await refreshScreens();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

/**
 * 打开管理操作表单，显示资源名称及未保存修改提示。
 * @param operation - 新建、重命名、复制或删除。
 * @param row - 已存在的大屏；新建时省略。
 * @returns 无返回值。
 */
function openForm(operation: Operation, row = { id: '', name: '' }): void {
  form.value = { operation, ...row };
  nameDraft.value =
    operation === 'new' ? '新建监控大屏' : operation === 'copy' ? `${row.name} 副本` : row.name;
  discard.value = false;
  formError.value = '';
  void nextTick(() => {
    formPanel.value?.scrollIntoView({ block: 'nearest' });
    formPanel.value?.querySelector<HTMLInputElement>('input')?.focus();
  });
}

/**
 * 在明确确认后提交管理操作，成功才关闭表单；失败保留输入与原草稿。
 * @returns 操作结束的 Promise，创建成功时进入新大屏编辑页。
 */
async function submit(): Promise<void> {
  const row = form.value;
  if (!row) return;
  const operation = row.operation;
  if (uiState.creating || screenState.saving) return;
  if (operation !== 'delete' && !nameDraft.value.trim()) {
    formError.value = '大屏名称不能为空';
    return;
  }
  if (needsDiscard.value && !discard.value) {
    formError.value = '请先确认如何处理未保存修改，或取消返回编辑器保存';
    return;
  }
  uiState.creating = true;
  let createdId: string | undefined;
  try {
    if (operation === 'new') {
      createdId = await newScreen(nameDraft.value, discard.value);
      if (!createdId) return;
    } else if (operation === 'rename') await renameScreen(row.id, nameDraft.value);
    else if (operation === 'copy') await copyScreen(row.id, nameDraft.value);
    else await deleteScreen(row.id);
    integration.value = null;
    form.value = null;
    notify(
      operation === 'new'
        ? '大屏已创建'
        : operation === 'rename'
          ? '大屏已重命名，访问地址保持不变'
          : operation === 'copy'
            ? '副本已创建，可在列表中打开编辑'
            : '大屏已删除',
    );
  } catch (e) {
    formError.value = (e as Error).message;
  } finally {
    uiState.creating = false;
  }
  if (createdId) await router.push(`/screens/${createdId}/edit`);
}

/**
 * 复制集成内容；浏览器不支持剪贴板时保留可选择的文本。
 * @param value - 要复制的地址或 iframe 代码。
 * @returns 复制完成的 Promise，失败时显示手动复制提示。
 */
async function copy(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    notify('已复制');
  } catch {
    notify('浏览器未允许直接复制，请选中下方文本手动复制');
  }
}
onMounted(refresh);
</script>

<template>
  <main class="screen-manager">
    <header class="manager-heading">
      <div>
        <span class="eyebrow">大屏资源</span>
        <h1>大屏管理</h1>
        <p>为不同监控场景创建大屏，通过独立地址展示或嵌入其他系统。</p>
      </div>
      <button
        class="button primary"
        @click="openForm('new')"
      >
        ＋ 新建大屏
      </button>
    </header>
    <div class="manager-tools">
      <input
        v-model="search"
        aria-label="搜索大屏"
        placeholder="按名称搜索大屏…"
      />
      <span>{{ screenState.screens.length }} 份大屏</span>
      <button
        class="button"
        :disabled="loading"
        @click="refresh"
      >
        {{ loading ? '刷新中…' : '刷新列表' }}
      </button>
    </div>
    <p
      v-if="error"
      role="alert"
    >
      列表读取失败：{{ error }}，请刷新重试。
    </p>
    <div class="manager-list">
      <article
        v-for="row in rows"
        :key="row.id"
        class="screen-row"
      >
        <div class="screen-identity">
          <h2>{{ row.name }}</h2>
          <code>{{ row.id }}</code>
        </div>
        <div class="row-actions">
          <RouterLink
            class="button primary"
            :to="`/screens/${row.id}/edit`"
            >编辑</RouterLink
          >
          <RouterLink
            class="button"
            :to="`/screens/${row.id}/view`"
            >预览</RouterLink
          >
          <button
            class="button"
            @click="integration = row"
          >
            地址与嵌入
          </button>
          <button
            class="button"
            @click="openForm('rename', row)"
          >
            重命名
          </button>
          <button
            class="button"
            @click="openForm('copy', row)"
          >
            复制
          </button>
          <button
            class="button danger"
            @click="openForm('delete', row)"
          >
            删除
          </button>
        </div>
      </article>
      <p
        v-if="!loading && !rows.length"
        class="manager-empty"
      >
        {{
          screenState.screens.length
            ? '没有匹配的大屏，请调整搜索内容。'
            : '还没有大屏，点击“新建大屏”开始配置。'
        }}
      </p>
    </div>
    <section
      v-if="integration"
      class="integration-panel"
      aria-label="大屏集成地址"
    >
      <header class="manager-heading">
        <h2>{{ integration.name }} · 集成地址</h2>
        <button
          class="button"
          @click="integration = null"
        >
          关闭
        </button>
      </header>
      <label
        >独立展示地址<input
          readonly
          :value="viewUrl" /></label
      ><button
        class="button"
        @click="copy(viewUrl)"
      >
        复制展示地址
      </button>
      <label
        >嵌入地址<input
          readonly
          :value="embedUrl" /></label
      ><button
        class="button"
        @click="copy(embedUrl)"
      >
        复制嵌入地址
      </button>
      <label
        >iframe 代码<textarea
          readonly
          rows="3"
          :value="embedCode"
        ></textarea></label
      ><button
        class="button"
        @click="copy(embedCode)"
      >
        复制 iframe 代码
      </button>
      <p>
        嵌入页支持切换监控目标和来源，只在当前页面生效，刷新恢复已保存配置。请给父容器设置明确高度，并从集成电脑可访问的服务地址打开本管理页后复制链接。
      </p>
    </section>
    <section
      v-if="form"
      class="integration-panel"
      aria-label="大屏操作表单"
      ref="formPanel"
    >
      <form @submit.prevent="submit">
        <h2>{{ labels[form.operation] }}</h2>
        <p v-if="form.operation === 'delete'">
          确定删除“{{ form.name }}”（{{ form.id }}）？只删除这份大屏，共享模板和监控数据会保留。
        </p>
        <label v-else
          >大屏名称<input
            v-model="nameDraft"
            required
        /></label>
        <label
          v-if="needsDiscard"
          class="discard-choice"
          ><input
            v-model="discard"
            type="checkbox"
          />我确认放弃当前大屏未保存的修改，使用服务器已保存配置继续操作</label
        >
        <p
          v-if="formError"
          role="alert"
        >
          {{ formError }}
        </p>
        <button
          class="button primary"
          type="submit"
          :disabled="uiState.creating || (needsDiscard && !discard)"
        >
          {{ form.operation === 'delete' ? '确认删除' : '确认' }}
        </button>
        <button
          class="button"
          type="button"
          @click="form = null"
        >
          取消
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.screen-manager {
  padding: 28px clamp(16px, 4vw, 64px);
  overflow: auto;
  flex: 1;
}
.manager-heading,
.manager-tools,
.screen-row,
.row-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.manager-heading,
.screen-row {
  justify-content: space-between;
}
h1 {
  margin: 8px 0;
  font-size: 28px;
}
h2 {
  margin: 0 0 8px;
  font-size: 17px;
}
p,
code {
  color: var(--text-muted, #91a5bc);
  line-height: 1.7;
}
code {
  font-size: 12px;
  overflow-wrap: anywhere;
}
.manager-tools {
  margin: 24px 0;
}
.manager-tools input {
  width: min(360px, 100%);
}
input,
textarea {
  background: #091526;
  color: #e4eefc;
  border: 1px solid #30455f;
  padding: 10px 12px;
  border-radius: 6px;
}
.screen-row {
  padding: 22px;
  border: 1px solid #263b54;
  background: #101d2e;
  border-radius: 10px;
  margin-bottom: 12px;
}
.screen-identity {
  min-width: 180px;
  flex: 1;
  overflow-wrap: anywhere;
}
.danger {
  color: #ffaaaa;
}
.manager-empty {
  padding: 56px 0;
  text-align: center;
}
.integration-panel {
  padding: 24px;
  border: 1px solid #42668d;
  border-radius: 10px;
  margin: 24px 0;
}
.integration-panel label {
  display: grid;
  gap: 8px;
  margin: 16px 0 8px;
}
.integration-panel textarea {
  resize: vertical;
}
.integration-panel .discard-choice {
  display: flex;
  align-items: center;
}
</style>
