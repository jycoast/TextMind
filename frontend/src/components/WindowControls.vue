<script setup lang="ts">
import { useWindowControls } from "@/composables/useWindowControls";

const { isMaximised, minimise, toggleMaximise, close } = useWindowControls();
</script>

<template>
  <div class="tm-window-controls wails-no-drag" role="group" aria-label="窗口控件">
    <button
      type="button"
      class="tm-wc-btn"
      title="最小化"
      aria-label="最小化"
      @click="minimise"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <rect x="1" y="4.5" width="8" height="1" fill="currentColor" />
      </svg>
    </button>

    <button
      type="button"
      class="tm-wc-btn"
      :title="isMaximised ? '还原' : '最大化'"
      :aria-label="isMaximised ? '还原' : '最大化'"
      @click="toggleMaximise"
    >
      <svg
        v-if="!isMaximised"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        <rect
          x="1"
          y="1"
          width="8"
          height="8"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
        />
      </svg>
      <svg
        v-else
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        <rect
          x="2.5"
          y="1"
          width="6.5"
          height="6.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
        />
        <rect
          x="1"
          y="2.5"
          width="6.5"
          height="6.5"
          fill="var(--bg)"
          stroke="currentColor"
          stroke-width="1"
        />
      </svg>
    </button>

    <button
      type="button"
      class="tm-wc-btn tm-wc-close"
      title="关闭"
      aria-label="关闭"
      @click="close"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path
          d="M1 1 L9 9 M9 1 L1 9"
          stroke="currentColor"
          stroke-width="1"
          fill="none"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.tm-window-controls {
  display: flex;
  align-items: stretch;
  height: 100%;
  margin-left: 4px;
}

.tm-wc-btn {
  width: 46px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  color: var(--text);
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
  -webkit-app-region: no-drag;
}

.tm-wc-btn:hover {
  background: var(--hover-bg);
}

.tm-wc-btn:focus {
  outline: none;
}

.tm-wc-btn:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: -2px;
}

.tm-wc-close:hover {
  background: #e81123;
  color: #ffffff;
}

.tm-wc-close:active {
  background: #c50f1f;
  color: #ffffff;
}
</style>
