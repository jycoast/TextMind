import type { Plugin, PluginContext } from "@/plugins/core";
import { useTabsStore } from "@/stores/tabs";
import { useMenusStore } from "@/stores/menus";
import { useUiStore } from "@/stores/ui";
import { tryFormatJson, tryMinifyJson } from "@/composables/useJsonFormat";

const PLUGIN_ID = "textmind.json";

export const jsonPlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "JSON Tools",
    version: "1.0.0",
    builtin: true,
    description: "Format / minify JSON.",
  },
  async activate(ctx: PluginContext) {
    const tabs = useTabsStore();
    const menus = useMenusStore();
    const ui = useUiStore();

    function runJsonOp(variant: "format" | "minify") {
      menus.closeEverything();
      const sel = tabs.getSelectionText();
      const useSelection = sel.trim().length > 0;
      const source = useSelection ? sel : tabs.adapter?.getValue() ?? "";
      if (!source.trim()) {
        ui.showTip("没有可处理的文本");
        return;
      }
      const res =
        variant === "format" ? tryFormatJson(source, 2) : tryMinifyJson(source);
      if (!res.ok) {
        ui.showTip(`JSON 解析失败：${res.error}`);
        return;
      }
      if (useSelection) {
        tabs.replaceSelection(res.text);
      } else if (tabs.adapter) {
        tabs.adapter.setValue(res.text);
      }
      tabs.setCurrentLanguage("json");
      ui.showTip(variant === "format" ? "已格式化 JSON" : "已压缩 JSON");
    }

    ctx.commands.register({
      id: "json.format",
      title: "格式化 JSON",
      category: "JSON",
      handler: () => runJsonOp("format"),
    });
    ctx.commands.register({
      id: "json.minify",
      title: "压缩 JSON",
      category: "JSON",
      handler: () => runJsonOp("minify"),
    });

    ctx.menus.registerItem({
      id: "ctx.json.format",
      menu: "editor.context",
      group: "b-json",
      order: 10,
      label: "格式化 JSON",
      separatorBefore: true,
      commandId: "json.format",
    });
    ctx.menus.registerItem({
      id: "ctx.json.minify",
      menu: "editor.context",
      group: "b-json",
      order: 20,
      label: "压缩 JSON",
      commandId: "json.minify",
    });
  },
};
