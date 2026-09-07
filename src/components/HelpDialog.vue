<script setup lang="ts">
import { uiState } from '../stores/application.ts';
</script>
<template>
  <div
    v-if="uiState.help"
    class="help-layer"
    @click.self="uiState.help = false"
  >
    <section
      class="help-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <header>
        <div>
          <span class="eyebrow">QUICK START</span>
          <h2 id="help-title">从一张卡片，到你的监控大屏</h2>
        </div>
        <button
          class="icon-button"
          @click="uiState.help = false"
          aria-label="关闭使用说明"
        >
          ×
        </button>
      </header>
      <div class="help-steps">
        <article>
          <b>01</b>
          <h3>编排大屏</h3>
          <p>
            点击或拖入左侧组件。拖动卡片左上角移动，右下角调整大小。点击内部文字或数值，右侧可修改具体控件。
          </p>
        </article>
        <article>
          <b>02</b>
          <h3>绑定对象与字段</h3>
          <p>先选整张卡片指派船舶，再选子控件设置字段。单张卡片的修改不会污染源模板。</p>
        </article>
        <article>
          <b>03</b>
          <h3>制作组件模板</h3>
          <p>进入组件工坊，新建模板、添加控件、声明对象槽位。保存入库后，即可在任意大屏复用。</p>
        </article>
        <article>
          <b>04</b>
          <h3>投屏与保存</h3>
          <p>显示态锁定布局。通过“监控对象”搜索换船；临时切换即时生效，保存为默认后重启仍保留。</p>
        </article>
      </div>
      <div class="help-foot">
        <p><kbd>Ctrl+S</kbd> 保存　<kbd>Ctrl+Z</kbd> 撤销　<kbd>Esc</kbd> 关闭抽屉 / 返回编辑</p>
        <p>
          “导出”包含大屏及引用模板；“导入”创建独立副本。曲线只显示本次打开后实际采集的样本，缺失历史不补造。
        </p>
        <p class="demo-text">
          演示模式与真实模式的数据目录相互隔离。真实接入接收符合数据模式的 JSON，不包含原始 AIS
          报文解码。
        </p>
      </div>
    </section>
  </div>
</template>
