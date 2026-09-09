<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { PropType } from 'vue';
import type { ComponentInstance, ComponentTemplate, Control } from '../../types.ts';
import { dataState } from '../../stores/entities.ts';

/**
 * 实时数据流单条消息实体接口定义。
 */
export interface StreamMessage {
  /** 消息唯一标识 */
  id: string;
  /** 消息生成毫秒时间戳 */
  timestamp: number;
  /** 格式化时间文本（HH:mm:ss） */
  timeStr: string;
  /** 消息级别：info (信息), warn (警告), alarm (告警), error (错误) */
  level: 'info' | 'warn' | 'alarm' | 'error' | string;
  /** 消息源名称（如 雷达1、综合调度 等） */
  source?: string;
  /** 消息详细内容 */
  content: string;
}

const props = defineProps({
  control: { type: Object as PropType<Control>, required: true },
  template: { type: Object as PropType<ComponentTemplate>, required: true },
  instance: { type: Object as PropType<ComponentInstance>, required: true },
});

const maxItems = computed(() => props.control.props.streamMaxItems ?? 50);
const autoScroll = computed(() => props.control.props.streamAutoScroll !== false);
const targetSchemaType = computed(() => props.control.props.schemaType || 'event_log');

const isHovered = ref(false);
const scrollContainer = ref<HTMLElement | null>(null);

/**
 * 消息流缓冲区，初始保持为空，杜绝硬编码假数据。
 */
const messages = ref<StreamMessage[]>([]);
let lastProcessedTime = 0;
let lastProcessedContent = '';

watch(maxItems, (limit) => {
  messages.value = messages.value.slice(-limit);
});
watch(
  targetSchemaType,
  () => {
    messages.value = [];
    lastProcessedTime = 0;
    lastProcessedContent = '';
  },
  { flush: 'sync' },
);
watch([autoScroll, isHovered], ([enabled, hovered]) => {
  if (enabled && !hovered) nextTick(() => scrollToBottom(false));
});

/**
 * 将消息流滚动容器滚动到底部最新消息处。
 *
 * @param smooth - 是否启用平滑平移滚动动画，默认为 true。
 * @returns 无返回值（undefined）；通过副作用平移滚动条。
 */
function scrollToBottom(smooth = true) {
  if (!scrollContainer.value) return;
  scrollContainer.value.scrollTo({
    top: scrollContainer.value.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  });
}

// 监听实时数据存储中的目标日志更新
watch(
  () => {
    const record = dataState.store.get(targetSchemaType.value, '_global');
    return record
      ? `${record.timestamps.content ?? record.timestamps.time}_${record.data.content}`
      : '';
  },
  () => {
    const record = dataState.store.get(targetSchemaType.value, '_global');
    if (!record || !record.data.content) return;
    const t = record.timestamps.content || record.timestamps.time || Date.now();
    const content = String(record.data.content);

    if (t === lastProcessedTime && content === lastProcessedContent) return;
    lastProcessedTime = t;
    lastProcessedContent = content;

    const newMsg: StreamMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: t,
      timeStr: new Date(t).toLocaleTimeString('zh-CN', { hour12: false }),
      level: String(record.data.level || 'info').toLowerCase(),
      source: record.data.source ? String(record.data.source) : undefined,
      content,
    };

    messages.value.push(newMsg);
    if (messages.value.length > maxItems.value) {
      messages.value.splice(0, messages.value.length - maxItems.value);
    }

    if (autoScroll.value && !isHovered.value) {
      nextTick(() => scrollToBottom(true));
    }
  },
  { immediate: true },
);

onMounted(() => {
  nextTick(() => scrollToBottom(false));
});
</script>

<template>
  <div
    class="stream-control"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div class="stream-header">
      <div class="stream-title">
        <span class="stream-dot"></span>
        <strong>实时消息流</strong>
        <span class="stream-count">{{ messages.length }} 条</span>
        <span
          v-if="isHovered"
          class="stream-pause-hint"
          >悬停中 · 滚动已暂停</span
        >
      </div>
    </div>

    <div
      ref="scrollContainer"
      class="stream-body"
    >
      <div
        v-if="!messages.length"
        class="stream-empty"
      >
        暂无实时消息
      </div>
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="stream-item"
        :class="'level-' + msg.level"
      >
        <span class="msg-time">{{ msg.timeStr }}</span>
        <span
          class="msg-badge"
          :class="'badge-' + msg.level"
        >
          <span
            class="stream-level-dot"
            :class="'dot-' + msg.level"
          ></span>
          <span class="stream-level-text">{{ msg.level.toUpperCase() }}</span>
        </span>
        <span
          v-if="msg.source"
          class="msg-source"
          >{{ msg.source }}</span
        >
        <span class="msg-content">{{ msg.content }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stream-control {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--stream-bg, rgba(5, 17, 33, 0.75));
  border: 1px solid var(--stream-border, #1c4568);
  border-radius: 4px;
  overflow: hidden;
  box-sizing: border-box;
  color: #c9e4f7;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.stream-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--stream-header-bg, #09233f);
  border-bottom: 1px solid var(--stream-border-subtle, #19466b);
  font-size: 12px;
  flex-shrink: 0;
}

.stream-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stream-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00f2fe;
  box-shadow: 0 0 6px #00f2fe;
  animation: streamPulse 2s infinite;
}

@keyframes streamPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.85);
  }
}

.stream-count {
  font-size: 11px;
  color: #6593b8;
  background: #05192e;
  padding: 1px 6px;
  border-radius: 3px;
}

.stream-pause-hint {
  font-size: 11px;
  color: #f59e0b;
  margin-left: 4px;
}

.stream-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 0;
}

.stream-body::-webkit-scrollbar {
  width: 5px;
}

.stream-body::-webkit-scrollbar-track {
  background: var(--stream-track-bg, #061527);
}

.stream-body::-webkit-scrollbar-thumb {
  background: var(--stream-thumb-bg, #1c4568);
  border-radius: 3px;
}

.stream-body::-webkit-scrollbar-thumb:hover {
  background: var(--stream-thumb-hover, #2a6190);
}

.stream-empty {
  color: #487294;
  font-size: 12px;
  text-align: center;
  margin-top: 24px;
}

.stream-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  padding: 3px 6px;
  border-radius: 3px;
  background: var(--stream-item-bg, rgba(10, 31, 56, 0.4));
  border-left: 2px solid transparent;
  transition: background 0.15s;
}

.stream-item:hover {
  background: var(--stream-item-hover, rgba(18, 50, 88, 0.6));
}

.stream-item.level-info {
  border-left-color: #38bdf8;
}

.stream-item.level-warn {
  border-left-color: #f59e0b;
  background: rgba(245, 158, 11, 0.06);
}

.stream-item.level-alarm,
.stream-item.level-error {
  border-left-color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.msg-time {
  color: #6593b8;
  font-size: 11px;
  flex-shrink: 0;
}

.msg-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: bold;
  flex-shrink: 0;
}

.stream-level-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  display: inline-block;
}

.stream-level-text {
  letter-spacing: 0.5px;
}

.badge-info {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.35);
}

.dot-info {
  background: #38bdf8;
  box-shadow: 0 0 4px #38bdf8;
}

.badge-warn {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.dot-warn {
  background: #fbbf24;
  box-shadow: 0 0 4px #fbbf24;
}

.badge-alarm,
.badge-error {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.4);
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.25);
}

.dot-alarm,
.dot-error {
  background: #ef4444;
  box-shadow: 0 0 5px #ef4444;
}

.msg-source {
  color: #a5d0f5;
  background: #113454;
  padding: 0 5px;
  border-radius: 2px;
  font-size: 11px;
  flex-shrink: 0;
}

.msg-content {
  color: #e2f1fc;
  word-break: break-all;
  flex: 1;
}
</style>
