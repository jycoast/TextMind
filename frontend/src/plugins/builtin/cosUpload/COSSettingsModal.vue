<template>
  <div class="cos-modal-mask" @mousedown.self="close">
    <div class="cos-modal">
      <div class="cos-modal__header">
        <span>腾讯云 COS 图片上传配置</span>
        <button class="cos-modal__close" type="button" @click="close">×</button>
      </div>

      <div class="cos-modal__body">
        <p class="cos-modal__hint">
          配置后，在 Markdown 编辑器中粘贴图片（QQ/微信截图、文件管理器复制等）会自动上传到 COS 并插入图片链接。
          仅本机本用户可读（文件权限 0600），不会上传到云端。
        </p>

        <label class="row">
          <span class="label">SecretID</span>
          <input v-model.trim="form.secretId" type="text" placeholder="AKIDxxxxxxxxxxxxxxxxxxxxxxxx" />
        </label>

        <label class="row">
          <span class="label">SecretKey</span>
          <input
            v-model.trim="form.secretKey"
            :type="showSecret ? 'text' : 'password'"
            placeholder="32 位密钥"
          />
          <button class="row__btn" type="button" @click="showSecret = !showSecret">
            {{ showSecret ? "隐藏" : "显示" }}
          </button>
        </label>

        <label class="row">
          <span class="label">Region</span>
          <input v-model.trim="form.region" type="text" placeholder="如 ap-guangzhou / ap-shanghai" />
        </label>

        <label class="row">
          <span class="label">Bucket</span>
          <input v-model.trim="form.bucket" type="text" placeholder="如 mybucket-1250000000" />
        </label>

        <label class="row">
          <span class="label">KeyPrefix</span>
          <input
            v-model.trim="form.keyPrefix"
            type="text"
            placeholder="可选，如 textmind/images/，留空则上传到根目录"
          />
        </label>

        <label class="row">
          <span class="label">自定义域名</span>
          <input
            v-model.trim="form.customDomain"
            type="text"
            placeholder="可选，如 https://cdn.example.com，留空则用桶默认域名"
          />
        </label>

        <p class="cos-modal__path">
          实际上传路径示例：<code>{{ samplePath }}</code>
        </p>
      </div>

      <div class="cos-modal__footer">
        <span class="cos-modal__status">{{ status }}</span>
        <button class="btn" type="button" @click="close">取消</button>
        <button class="btn btn--primary" type="button" :disabled="saving" @click="save">
          {{ saving ? "保存中…" : "保存" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { backend } from "@/api/backend";
import { useUiStore } from "@/stores/ui";

const props = defineProps<{ onClose: () => void }>();

const ui = useUiStore();

const form = reactive({
  secretId: "",
  secretKey: "",
  region: "",
  bucket: "",
  keyPrefix: "",
  customDomain: "",
});

const showSecret = ref(false);
const saving = ref(false);
const status = ref("");

onMounted(async () => {
  try {
    const cfg = await backend.getCOSConfig();
    form.secretId = cfg.secretId || "";
    form.secretKey = cfg.secretKey || "";
    form.region = cfg.region || "";
    form.bucket = cfg.bucket || "";
    form.keyPrefix = cfg.keyPrefix || "";
    form.customDomain = cfg.customDomain || "";
  } catch (err) {
    console.warn("load cos config:", err);
  }
});

const samplePath = computed(() => {
  const region = form.region || "<region>";
  const bucket = form.bucket || "<bucket>";
  const prefix = (form.keyPrefix || "").replace(/^\/+/, "");
  const normPrefix = prefix ? (prefix.endsWith("/") ? prefix : prefix + "/") : "";
  const base = form.customDomain
    ? form.customDomain.replace(/\/+$/, "")
    : `https://${bucket}.cos.${region}.myqcloud.com`;
  const date = new Date();
  const ym = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `${base}/${normPrefix}${ym}/<timestamp>-<hash>.png`;
});

function close() {
  props.onClose();
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  status.value = "";
  try {
    const res = await backend.saveCOSConfig({
      secretId: form.secretId,
      secretKey: form.secretKey,
      region: form.region,
      bucket: form.bucket,
      keyPrefix: form.keyPrefix,
      customDomain: form.customDomain,
    } as never);
    if (res?.error) {
      status.value = res.error;
      ui.showTip(res.error);
      return;
    }
    ui.showTip("COS 配置已保存");
    close();
  } catch (err) {
    status.value = String(err);
    ui.showTip("保存失败");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.cos-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.cos-modal {
  width: 540px;
  max-width: calc(100vw - 32px);
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--hairline);
  border-radius: 6px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
}
.cos-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--hairline);
  font-weight: 600;
}
.cos-modal__close {
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}
.cos-modal__body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cos-modal__hint {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
  margin: 0 0 4px;
}
.cos-modal__path {
  font-size: 12px;
  color: var(--muted);
  margin: 6px 0 0;
  word-break: break-all;
}
.cos-modal__path code {
  background: var(--panel-input, var(--panel));
  padding: 1px 4px;
  border-radius: 3px;
  border: 1px solid var(--hairline);
  font-size: 11px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row .label {
  width: 92px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--muted);
  text-align: right;
}
.row input {
  flex: 1;
  min-width: 0;
  background: var(--panel-input, var(--panel));
  border: 1px solid var(--hairline);
  border-radius: 3px;
  padding: 4px 8px;
  color: var(--text);
  font-size: 13px;
  outline: none;
}
.row input:focus {
  border-color: var(--accent);
}
.row__btn {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--hairline);
  border-radius: 3px;
  padding: 3px 9px;
  cursor: pointer;
  font-size: 12px;
}
.row__btn:hover {
  border-color: var(--accent);
}
.cos-modal__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--hairline);
}
.cos-modal__status {
  margin-right: auto;
  font-size: 12px;
  color: #d97474;
}
.btn {
  padding: 5px 14px;
  border-radius: 4px;
  border: 1px solid var(--hairline);
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.btn:hover { border-color: var(--accent); }
.btn--primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.btn--primary:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
