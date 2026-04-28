<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useUpdateStore } from "@/stores/update";
import { renderMarkdown } from "@/composables/useMarkdown";

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const store = useUpdateStore();
const {
  status,
  error,
  appVersion,
  info,
  downloadedBytes,
  totalBytes,
  downloadProgress,
  canAutoInstall,
} = storeToRefs(store);

watch(
  () => props.visible,
  async (v) => {
    if (!v) return;
    await store.loadAppVersion();
    // Always trigger a fresh check when the user explicitly opens the modal,
    // unless we're already in the middle of one or installing.
    if (
      status.value === "idle" ||
      status.value === "up-to-date" ||
      status.value === "available" ||
      status.value === "error"
    ) {
      await store.check(false);
    }
  },
  { immediate: false },
);

const currentLabel = computed<string>(() => {
  return appVersion.value || "未知";
});

const latestLabel = computed<string>(() => {
  return info.value?.latestVersion || "—";
});

const sizeLabel = computed<string>(() => {
  const total = totalBytes.value;
  const done = downloadedBytes.value;
  if (!total) return formatBytes(done);
  return `${formatBytes(done)} / ${formatBytes(total)}`;
});

const pickedAssetLabel = computed<string>(() => {
  const a = info.value?.asset;
  if (!a) return "未找到适配本平台的安装包";
  if (a.size > 0) return `${a.name} (${formatBytes(a.size)})`;
  return a.name;
});

const renderedNotes = computed<string>(() => {
  const body = info.value?.releaseNotes ?? "";
  return body ? renderMarkdown(body) : "";
});

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function close() {
  emit("close");
}

async function onCheck() {
  await store.check(false);
}

async function onInstall() {
  await store.install();
}

async function onCancel() {
  await store.cancel();
}

function onOpenReleasePage() {
  store.openReleasePage();
}
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-[1300]">
    <div
      class="absolute inset-0"
      :style="{ background: 'var(--overlay)' }"
      @click="close"
    ></div>
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-auto p-4 box-border rounded-md border flex flex-col gap-3"
      :style="{
        background: 'var(--panel-elevated)',
        borderColor: 'var(--hairline)',
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
        width: 'min(640px, calc(100% - 32px))',
        maxHeight: 'calc(100% - 48px)',
      }"
      role="dialog"
      aria-label="检查更新"
    >
      <div class="flex items-center justify-between">
        <div class="text-[15px]" :style="{ color: 'var(--text)' }">
          检查更新
        </div>
        <button class="tm-icon-btn" title="关闭" @click="close">×</button>
      </div>

      <div class="grid gap-2 text-[13px]" :style="{ color: 'var(--text)' }">
        <div class="flex justify-between">
          <span :style="{ color: 'var(--muted)' }">当前版本</span>
          <span class="font-mono">{{ currentLabel }}</span>
        </div>
        <div class="flex justify-between">
          <span :style="{ color: 'var(--muted)' }">最新版本</span>
          <span class="font-mono">{{ latestLabel }}</span>
        </div>
        <div v-if="info?.publishedAt" class="flex justify-between">
          <span :style="{ color: 'var(--muted)' }">发布时间</span>
          <span class="font-mono">{{ info.publishedAt }}</span>
        </div>
        <div v-if="info?.asset" class="flex justify-between gap-3">
          <span :style="{ color: 'var(--muted)' }">下载文件</span>
          <span class="font-mono text-right break-all">{{
            pickedAssetLabel
          }}</span>
        </div>
      </div>

      <div
        v-if="status === 'checking'"
        class="text-[13px] py-3 text-center"
        :style="{ color: 'var(--muted)' }"
      >
        正在检查更新...
      </div>

      <div
        v-else-if="status === 'up-to-date'"
        class="text-[13px] py-3 text-center"
        :style="{ color: '#7ad08f' }"
      >
        ✓ 已是最新版本
      </div>

      <div
        v-else-if="
          status === 'available' ||
          status === 'downloading' ||
          status === 'applying'
        "
        class="flex flex-col gap-2"
      >
        <div class="text-xs" :style="{ color: 'var(--muted)' }">
          更新内容
        </div>
        <div
          class="release-notes overflow-auto p-3 rounded-sm"
          :style="{
            background: 'var(--panel-input)',
            border: '1px solid var(--hairline)',
            color: 'var(--text)',
            maxHeight: '240px',
            minHeight: '80px',
          }"
        >
          <div
            v-if="renderedNotes"
            class="markdown-body text-[13px] leading-relaxed"
            v-html="renderedNotes"
          ></div>
          <div
            v-else
            class="text-[12px]"
            :style="{ color: 'var(--muted)' }"
          >
            （无更新说明）
          </div>
        </div>

        <div
          v-if="status === 'downloading' || status === 'applying'"
          class="flex flex-col gap-1"
        >
          <div class="flex justify-between text-xs">
            <span :style="{ color: 'var(--muted)' }">
              {{
                status === "downloading" ? "下载中" : "正在应用更新..."
              }}
            </span>
            <span
              class="font-mono"
              :style="{ color: 'var(--muted)' }"
            >
              {{ sizeLabel }}
            </span>
          </div>
          <div
            class="progress h-1.5 rounded-sm overflow-hidden"
            :style="{ background: 'var(--panel-input)' }"
          >
            <div
              class="h-full"
              :style="{
                width: `${downloadProgress}%`,
                background: 'var(--accent)',
                transition: 'width 0.15s',
              }"
            ></div>
          </div>
        </div>

        <div
          v-if="status === 'applying'"
          class="text-xs text-center mt-1"
          :style="{ color: 'var(--muted)' }"
        >
          应用即将关闭并自动重启...
        </div>
      </div>

      <div v-else-if="status === 'error'" class="flex flex-col gap-2 py-2">
        <div
          class="text-[13px] p-3 rounded-sm"
          :style="{
            background: 'var(--panel-input)',
            border: '1px solid var(--hairline)',
            color: '#f08f8f',
          }"
        >
          {{ error || "操作失败" }}
        </div>
      </div>

      <div
        v-if="status === 'available' && !canAutoInstall"
        class="text-xs"
        :style="{ color: 'var(--muted)' }"
      >
        当前平台暂不支持应用内自动更新，请前往下载页手动安装。
      </div>

      <div class="flex justify-end gap-2 mt-1">
        <button
          v-if="
            status === 'idle' ||
            status === 'up-to-date' ||
            status === 'error'
          "
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          :disabled="(status as string) === 'checking'"
          @click="onCheck"
        >
          {{ status === "idle" ? "检查更新" : "重新检查" }}
        </button>

        <button
          v-if="info?.releaseUrl && status !== 'downloading' && status !== 'applying'"
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          @click="onOpenReleasePage"
        >
          前往 GitHub 查看
        </button>

        <button
          v-if="status === 'available' && canAutoInstall"
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--accent); color: var(--text)"
          @click="onInstall"
        >
          下载并自动安装
        </button>

        <button
          v-if="status === 'downloading'"
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          @click="onCancel"
        >
          取消下载
        </button>

        <button
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          :disabled="(status as string) === 'applying'"
          @click="close"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tm-icon-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 2px;
  font-size: 14px;
  line-height: 1;
}
.tm-icon-btn:hover {
  background: var(--hover-bg);
  color: var(--text);
}
.markdown-body :deep(p) {
  margin: 0 0 6px 0;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 22px;
  margin: 4px 0;
}
.markdown-body :deep(code) {
  background: var(--panel-elevated);
  border: 1px solid var(--hairline);
  border-radius: 3px;
  padding: 0 4px;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
}
.markdown-body :deep(a) {
  color: var(--accent);
  text-decoration: underline;
}
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin: 6px 0 4px;
  font-size: 13px;
  font-weight: 600;
}
.progress {
  width: 100%;
}
</style>
