"use client";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import type { QueryResult } from "@/types";
import { Icon } from "@/components/ui/icons";
import { Menu, btn, type MenuEntry, type MenuItem } from "@/components/ui/primitives";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const BASE = "querypad-export";

/** Export formats load lazily so heavy writers (xlsx) only ship when used. */
export default function ExportMenu({ result, query }: { result: QueryResult; query: string }) {
  const plugins = useWorkspaceStore((s) => s.plugins);
  const truncatedNote = result.rowCount > result.rows.length ? ` (first ${result.rows.length.toLocaleString()} rows)` : "";

  const run = (label: string, task: () => Promise<void>) => () =>
    void task().catch((err) => toast(`${label} export failed: ${err instanceof Error ? err.message : err}`, "error"));

  const items: MenuEntry[] = [
    { heading: "Copy" },
    {
      label: "Copy as table",
      icon: "copy",
      hint: "TSV",
      onSelect: run("Copy", async () => {
        const { copyToClipboard } = await import("@/lib/export/clipboard");
        await copyToClipboard(result);
        toast(`Copied ${result.rows.length.toLocaleString()} rows — paste into a spreadsheet.`, "success");
      }),
    },
    "divider",
    { heading: "Download" },
    {
      label: `CSV${truncatedNote}`,
      icon: "download",
      onSelect: run("CSV", async () => {
        const { exportCsv } = await import("@/lib/export/csv");
        download(new Blob([exportCsv(result)], { type: "text/csv" }), `${BASE}.csv`);
      }),
    },
    {
      label: `JSON${truncatedNote}`,
      icon: "download",
      onSelect: run("JSON", async () => {
        const { exportJson } = await import("@/lib/export/json");
        download(new Blob([exportJson(result)], { type: "application/json" }), `${BASE}.json`);
      }),
    },
    {
      label: "Markdown table",
      icon: "download",
      onSelect: run("Markdown", async () => {
        const { exportMarkdown } = await import("@/lib/export/markdown");
        download(new Blob([exportMarkdown(result)], { type: "text/markdown" }), `${BASE}.md`);
      }),
    },
    {
      label: "HTML report",
      icon: "download",
      onSelect: run("HTML", async () => {
        const { generateExportHtml } = await import("@/lib/export/html");
        download(new Blob([generateExportHtml(query, result)], { type: "text/html" }), `${BASE}.html`);
      }),
    },
    {
      label: "Excel (.xlsx)",
      icon: "download",
      onSelect: run("Excel", async () => {
        const { exportExcel } = await import("@/lib/export/excel");
        const buf = exportExcel(result);
        download(
          new Blob([buf.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          `${BASE}.xlsx`
        );
      }),
    },
    {
      label: "Parquet (all rows)",
      icon: "download",
      disabled: !query.trim(),
      onSelect: run("Parquet", async () => {
        const { exportParquet } = await import("@/lib/export/parquet");
        const buf = await exportParquet(query);
        download(new Blob([buf.buffer as ArrayBuffer], { type: "application/octet-stream" }), `${BASE}.parquet`);
      }),
    },
  ];

  const pluginItems: MenuItem[] = plugins.flatMap((p) =>
    p.manifest.extensions
      .filter((ext): ext is Extract<typeof ext, { type: "exporter" }> => ext.type === "exporter")
      .map((ext) => ({
        label: ext.label,
        icon: "puzzle" as const,
        onSelect: run(ext.label, async () => {
          const blob = await ext.export(result, query);
          download(blob, `querypad-${ext.label.toLowerCase().replace(/\s+/g, "-")}`);
        }),
      }))
  );
  if (pluginItems.length) items.push("divider", { heading: "Plugins" }, ...pluginItems);

  return (
    <Menu
      label="Export"
      items={items}
      trigger={({ toggle, open }) => (
        <button onClick={toggle} className={`${btn.ghost} h-7`} aria-expanded={open}>
          <Icon name="download" size={14} />
          Export
          <Icon name="chevronDown" size={12} />
        </button>
      )}
    />
  );
}
