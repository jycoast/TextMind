<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useShortcutsStore } from "@/stores/shortcuts";
import {
  ACTION_META,
  ALL_ACTION_IDS,
  comboFromEvent,
  stringifyCombo,
  type ActionId,
} from "@/composables/shortcutModel";

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const shortcuts = useShortcutsStore();

const recordingId = ref<ActionId | null>(null);

interface PendingConflict {
  id: ActionId;
  combo: string;
  occupiedBy: ActionId;
}
const pendingConflict = ref<PendingConflict | null>(null);

const status = ref<{ kind: "info" | "ok" | "err"; text: string } | null>(null);

const rows = computed(() =>
  ALL_ACTION_IDS.map((id) => ({
    id,
    label: ACTION_META[id].label,
    binding: shortcuts.bindings[id] || "",
    defaultBinding: ACTION_META[id].defaultBinding || "",
    isDefault:
      (shortcuts.bindings[id] || "") === (ACTION_META[id].defaultBinding || ""),
  })),
);

function close() {
  stopRecording();
  pendingConflict.value = null;
  status.value = null;
  emit("close");
}

function startRecording(id: ActionId) {
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

function commitBinding(id: ActionId, combo: string) {
  const conflict = shortcuts.findConflict(combo, id);
  if (conflict) {
    pendingConflict.value = { id, combo, occupiedBy: conflict };
    status.value = {
      kind: "err",
      text: `该组合已绑定到「${ACTION_META[conflict].label}」`,
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
    text: `已替换：${ACTION_META[pc.id].label} = ${pc.combo}`,
  };
  pendingConflict.value = null;
}

function cancelReplace() {
  pendingConflict.value = null;
  status.value = null;
}

function onClear(id: ActionId) {
  shortcuts.clearBinding(id);
  status.value = { kind: "ok", text: `已清空「${ACTION_META[id].label}」绑定` };
}

function onReset(id: ActionId) {
  shortcuts.resetBinding(id);
  status.value = {
    kind: "ok",
    text: `已恢复默认：${ACTION_META[id].defaultBinding || "（无绑定）"}`,
  };
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

watch(
  recordingId,
  (cur, prev) => {
    if (cur && !prev) {
      document.addEventListener("keydown", onCaptureKeydown, true);
    } else if (!cur && prev) {
      document.removeEventListener("keydown", onCaptureKeydown, true);
    }
  },
);

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
            borderTop:
              i === 0 ? 'none' : '1px solid var(--hairline)',
          }"
        >
          <div
            class="flex-1 text-[13px] truncate"
            :style="{ color: 'var(--text)' }"
            :title="row.id"
          >
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
            <template v-else-if="row.binding">
              <kbd
                class="inline-block px-2 py-0.5 rounded-sm text-[12px] font-mono border"
                :style="{
                  background: 'var(--panel-input)',
                  borderColor: 'var(--hairline)',
                  color: 'var(--text)',
                }"
              >
                {{ row.binding }}
              </kbd>
            </template>
            <template v-else>
              <span
                class="text-[12px]"
                :style="{ color: 'var(--muted)' }"
              >
                未设置
              </span>
            </template>
          </div>

          <div class="flex items-center gap-1">
            <button
              type="button"
              class="h-7 px-2 text-[12px] rounded-sm cursor-pointer border"
              :style="{
                background: 'transparent',
                borderColor: 'var(--hairline)',
                color: 'var(--text)',
              }"
              :disabled="recordingId !== null && recordingId !== row.id"
              @click="startRecording(row.id)"
            >
              {{ recordingId === row.id ? "取消" : "录制" }}
            </button>
            <button
              type="button"
              class="h-7 px-2 text-[12px] rounded-sm cursor-pointer border"
              :style="{
                background: 'transparent',
                borderColor: 'var(--hairline)',
                color: 'var(--muted)',
              }"
              :disabled="!row.binding"
              @click="onClear(row.id)"
            >
              清空
            </button>
            <button
              type="button"
              class="h-7 px-2 text-[12px] rounded-sm cursor-pointer border"
              :style="{
                background: 'transparent',
                borderColor: 'var(--hairline)',
                color: 'var(--muted)',
              }"
              :disabled="row.isDefault"
              @click="onReset(row.id)"
            >
              重置
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="pendingConflict"
        class="mt-3 p-2.5 rounded-sm border text-[12px] flex items-center justify-between gap-3"
        :style="{
          background: 'var(--panel)',
          borderColor: 'var(--accent)',
          color: 'var(--text)',
        }"
      >
        <div>
          组合
          <kbd
            class="px-1.5 py-0.5 rounded-sm font-mono border mx-1"
            :style="{
              background: 'var(--panel-input)',
              borderColor: 'var(--hairline)',
            }"
            >{{ pendingConflict.combo }}</kbd
          >
          已被「{{ ACTION_META[pendingConflict.occupiedBy].label
          }}」占用。是否清空原绑定并改为「{{
            ACTION_META[pendingConflict.id].label
          }}」？
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            class="h-7 px-2.5 text-[12px] rounded-sm cursor-pointer border"
            :style="{
              background: 'var(--accent)',
              borderColor: 'var(--accent)',
              color: 'var(--bg)',
            }"
            @click="confirmReplace"
          >
            替换
          </button>
          <button
            type="button"
            class="h-7 px-2.5 text-[12px] rounded-sm cursor-pointer border"
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

      <div
        v-if="status && !pendingConflict"
        class="mt-3 text-[12px]"
        :style="{
          color:
            status.kind === 'err'
              ? '#e57373'
              : status.kind === 'ok'
                ? 'var(--accent)'
                : 'var(--muted)',
        }"
      >
        {{ status.text }}
      </div>
    </div>
  </div>
</template>
