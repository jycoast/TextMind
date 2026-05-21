<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useShortcutsStore } from "@/stores/shortcuts";
import { commandRegistry } from "@/plugins/core";
import { comboFromEvent, stringifyCombo } from "@/composables/shortcutModel";

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const shortcuts = useShortcutsStore();

const recordingId = ref<string | null>(null);

interface PendingConflict {
  id: string;
  combo: string;
  occupiedBy: string;
}
const pendingConflict = ref<PendingConflict | null>(null);

const status = ref<{ kind: "info" | "ok" | "err"; text: string } | null>(null);

interface Row {
  id: string;
  label: string;
  category: string;
  binding: string;
  defaultBinding: string;
  isDefault: boolean;
}

function labelFor(id: string): string {
  const cmd = commandRegistry.get(id);
  return cmd?.title || id;
}

const rows = computed<Row[]>(() => {
  const defaults = shortcuts.defaults;
  return commandRegistry.listBindable().map((cmd) => {
    const binding = shortcuts.bindings[cmd.id] || "";
    const defaultBinding = defaults[cmd.id] || "";
    return {
      id: cmd.id,
      label: cmd.title,
      category: cmd.category || "",
      binding,
      defaultBinding,
      isDefault: binding === defaultBinding,
    };
  });
});

function close() {
  stopRecording();
  pendingConflict.value = null;
  status.value = null;
  emit("close");
}

function startRecording(id: string) {
  pendingConflict.value = null;
  status.value = {
    kind: "info",
    text: "按下目标按键组合（Esc 取消，Backspace 清空当前绑定）",
  };
  recordingId.value = id;
}

function stopRecording() {
  recordingId.value = null;
}

function commitBinding(id: string, combo: string) {
  const conflict = shortcuts.findConflict(combo, id);
  if (conflict) {
    pendingConflict.value = { id, combo, occupiedBy: conflict };
    status.value = {
      kind: "err",
      text: `该组合已绑定到「${labelFor(conflict)}」`,
    };
    return;
  }
  shortcuts.setBinding(id, combo);
  status.value = { kind: "ok", text: `已绑定：${combo}` };
}

function confirmReplace() {
  const pc = pendingConflict.value;
  if (!pc) return;
  shortcuts.clearBinding(pc.occupiedBy);
  shortcuts.setBinding(pc.id, pc.combo);
  status.value = {
    kind: "ok",
    text: `已替换：${labelFor(pc.id)} = ${pc.combo}`,
  };
  pendingConflict.value = null;
}

function cancelReplace() {
  pendingConflict.value = null;
  status.value = null;
}

function onClear(id: string) {
  shortcuts.clearBinding(id);
  status.value = { kind: "ok", text: `已清空「${labelFor(id)}」绑定` };
}

function onReset(id: string) {
  shortcuts.resetBinding(id);
  const next = shortcuts.bindings[id] || "（无绑定）";
  status.value = { kind: "ok", text: `已恢复默认：${next}` };
}

function onResetAll() {
  shortcuts.resetAll();
  pendingConflict.value = null;
  status.value = { kind: "ok", text: "已全部恢复默认" };
}

function onCaptureKeydown(ev: KeyboardEvent) {
  if (!recordingId.value) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    stopRecording();
    status.value = { kind: "info", text: "已取消录制" };
    return;
  }
  if (ev.key === "Backspace" && !ev.ctrlKey && !ev.altKey && !ev.shiftKey) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const id = recordingId.value;
    stopRecording();
    onClear(id);
    return;
  }
  const combo = comboFromEvent(ev);
  if (!combo) return;
  if (!combo.ctrl && !combo.alt && !combo.shift) {
    const isFn = /^F\d{1,2}$/.test(combo.key);
    if (!isFn) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      status.value = {
        kind: "err",
        text: "需要至少一个修饰键（Ctrl / Alt / Shift）或 F1-F12",
      };
      return;
    }
  }
  ev.preventDefault();
  ev.stopImmediatePropagation();
  const id = recordingId.value;
  stopRecording();
  commitBinding(id, stringifyCombo(combo));
}

watch(
  () => props.visible,
  (v) => {
    if (!v) {
      stopRecording();
      pendingConflict.value = null;
      status.value = null;
    }
  },
);

watch(recordingId, (cur, prev) => {
  if (cur && !prev) {
    document.addEventListener("keydown", onCaptureKeydown, true);
  } else if (!cur && prev) {
    document.removeEventListener("keydown", onCaptureKeydown, true);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onCaptureKeydown, true);
});
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-[1300]">
    <div
      class="absolute inset-0"
      :style="{ background: 'var(--overlay)' }"
      @click="close"
    ></div>
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-auto p-4 box-border rounded-md border"
      :style="{
        background: 'var(--panel-elevated)',
        borderColor: 'var(--hairline)',
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
        width: 'min(720px, calc(100% - 32px))',
        maxHeight: 'calc(100% - 48px)',
      }"
      role="dialog"
      aria-label="快捷键设置"
    >
      <div class="flex items-center justify-between mb-3">
        <div class="text-[15px]" :style="{ color: 'var(--text)' }">
          快捷键设置
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-7 px-2.5 text-[13px] rounded-sm cursor-pointer border"
            :style="{
              background: 'transparent',
              borderColor: 'var(--hairline)',
              color: 'var(--muted)',
            }"
            @click="onResetAll"
          >
            全部恢复默认
          </button>
          <button
            type="button"
            class="h-7 px-2.5 text-[13px] rounded-sm cursor-pointer border"
            :style="{
              background: 'transparent',
              borderColor: 'var(--hairline)',
              color: 'var(--muted)',
            }"
            @click="close"
          >
            关闭
          </button>
        </div>
      </div>

      <div
        class="text-xs mb-2 leading-relaxed"
        :style="{ color: 'var(--muted)' }"
      >
        点击「录制」后按下目标组合即可绑定。Esc 取消、Backspace 清空。Esc
        关闭弹窗的行为始终保留，不可改。
      </div>

      <div
        class="rounded-sm border overflow-hidden"
        :style="{ borderColor: 'var(--hairline)' }"
      >
        <div
          v-for="(row, i) in rows"
          :key="row.id"
          class="flex items-center gap-3 px-3 py-2"
          :style="{
            background:
              i % 2 === 0 ? 'var(--panel)' : 'var(--panel-elevated)',
            borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
          }"
        >
          <div
            class="flex-1 text-[13px] truncate"
            :style="{ color: 'var(--text)' }"
            :title="row.id"
          >
            <span
              v-if="row.category"
              class="text-[11px] mr-1"
              :style="{ color: 'var(--muted)' }"
            >
              [{{ row.category }}]
            </span>
            {{ row.label }}
            <span
              v-if="!row.isDefault"
              class="ml-2 text-[11px]"
              :style="{ color: 'var(--muted)' }"
            >
              （默认 {{ row.defaultBinding || "无" }}）
            </span>
          </div>

          <div class="min-w-[160px] text-right">
            <template v-if="recordingId === row.id">
              <span
                class="inline-block px-2 py-0.5 rounded-sm text-[12px]"
                :style="{
                  background: 'var(--accent)',
                  color: 'var(--bg)',
                }"
              >
                录制中…
              </span>
            </template>
            <template v-else>
              <span
                class="inline-block px-2 py-0.5 rounded-sm text-[12px] mr-2"
                :style="{
                  background: 'var(--panel)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--text)',
                }"
              >
                {{ row.binding || "未绑定" }}
              </span>
              <button
                type="button"
                class="h-6 px-2 text-[12px] rounded-sm cursor-pointer border"
                :style="{
                  background: 'transparent',
                  borderColor: 'var(--hairline)',
                  color: 'var(--muted)',
                }"
                @click="startRecording(row.id)"
              >
                录制
              </button>
              <button
                v-if="row.binding"
                type="button"
                class="h-6 px-2 text-[12px] rounded-sm cursor-pointer border ml-1"
                :style="{
                  background: 'transparent',
                  borderColor: 'var(--hairline)',
                  color: 'var(--muted)',
                }"
                @click="onClear(row.id)"
              >
                清空
              </button>
              <button
                v-if="!row.isDefault"
                type="button"
                class="h-6 px-2 text-[12px] rounded-sm cursor-pointer border ml-1"
                :style="{
                  background: 'transparent',
                  borderColor: 'var(--hairline)',
                  color: 'var(--muted)',
                }"
                @click="onReset(row.id)"
              >
                还原
              </button>
            </template>
          </div>
        </div>
      </div>

      <div
        v-if="status"
        class="mt-3 text-[12px]"
        :style="{
          color:
            status.kind === 'err'
              ? 'var(--error)'
              : status.kind === 'ok'
                ? 'var(--success, var(--accent))'
                : 'var(--muted)',
        }"
      >
        {{ status.text }}
      </div>

      <div
        v-if="pendingConflict"
        class="mt-3 p-2 rounded-sm border flex items-center gap-2"
        :style="{
          borderColor: 'var(--hairline)',
          background: 'var(--panel)',
        }"
      >
        <div class="flex-1 text-[12px]" :style="{ color: 'var(--text)' }">
          {{ pendingConflict.combo }} 已被「{{
            labelFor(pendingConflict.occupiedBy)
          }}」占用。是否替换？
        </div>
        <button
          type="button"
          class="h-6 px-2 text-[12px] rounded-sm cursor-pointer border"
          :style="{
            background: 'transparent',
            borderColor: 'var(--hairline)',
            color: 'var(--text)',
          }"
          @click="confirmReplace"
        >
          替换
        </button>
        <button
          type="button"
          class="h-6 px-2 text-[12px] rounded-sm cursor-pointer border"
          :style="{
            background: 'transparent',
            borderColor: 'var(--hairline)',
            color: 'var(--muted)',
          }"
          @click="cancelReplace"
        >
          取消
        </button>
      </div>
    </div>
  </div>
</template>
