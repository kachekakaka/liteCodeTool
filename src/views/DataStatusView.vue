<script setup lang="ts">
import { dataState } from '../stores/entities.ts';
import { demoAction } from '../services/demo.ts';
</script>
<template>
  <section class="data-page">
    <div class="data-intro">
      <div>
        <span class="eyebrow">DATA CONNECTION</span>
        <h1>数据连接与初始底账</h1>
        <p>连接状态不等于业务正常。未接入、缺字段、过期与演示数据分别标注。</p>
      </div>
      <div
        v-if="dataState.sourceMode === 'demo'"
        class="toolbar-actions"
      >
        <button
          class="button"
          @click="demoAction('toggle')"
        >
          {{ dataState.paused ? '恢复演示推流' : '暂停演示推流' }}</button
        ><button
          class="button primary"
          @click="demoAction('discover')"
        >
          模拟发现新船
        </button>
      </div>
    </div>
    <div class="data-cards">
      <article class="tech-panel">
        <h2>连接状态</h2>
        <dl>
          <dt>数据来源</dt>
          <dd>{{ dataState.sourceMode === 'demo' ? '独立演示目录' : '真实数据目录' }}</dd>
          <dt>WebSocket</dt>
          <dd>{{ dataState.connected ? '已连接' : '已断开，将自动重连' }}</dd>
          <dt>最新收到增量</dt>
          <dd>
            {{
              dataState.lastUpdate
                ? new Date(dataState.lastUpdate).toLocaleString('zh-CN')
                : '尚未接收到增量'
            }}
          </dd>
          <dt>已发现实体</dt>
          <dd>{{ dataState.store.list('vessel').length }}</dd>
        </dl>
        <p class="field-help">
          真实接入使用带凭据的增量接口；凭据只配置在服务端环境变量，不进入前端。
        </p>
      </article>
      <article class="tech-panel">
        <h2>数据模式</h2>
        <pre>{{ JSON.stringify(dataState.schemas, null, 2) }}</pre>
      </article>
      <article class="tech-panel">
        <h2>实体池最新值</h2>
        <pre>{{
          JSON.stringify(
            dataState.store.list('vessel').map((i) => ({ id: i.id, data: i.record.data })),
            null,
            2,
          )
        }}</pre>
      </article>
    </div>
  </section>
</template>
