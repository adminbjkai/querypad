"use client";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { openTablePage } from "@/lib/workspace-actions";
import { Icon, type IconName } from "@/components/ui/icons";

interface Action {
  icon: IconName;
  title: string;
  body: string;
  /** Accessible name; distinct from the chrome's buttons so each stays uniquely addressable. */
  label: string;
  run: () => void;
}

/** Four ways into the work, shown under the composer once the space has data. */
export default function QuickActions() {
  const firstTable = useWorkspaceStore((s) => s.tables[0]?.name ?? s.views[0]?.name ?? null);

  const actions: Action[] = [
    {
      icon: "upload",
      title: "Add data",
      body: "Drop files, pick them, or load a URL.",
      label: "Import data files",
      run: () => useUiStore.getState().setDialog("addFiles"),
    },
    {
      icon: "code",
      title: "New query",
      body: "Start a blank SQL tab in the workbench.",
      label: "Start a SQL query",
      run: () => {
        const ws = useWorkspaceStore.getState();
        ws.setViewMode("sql");
        if (ws.addTab()) useUiStore.getState().setWorkspacePage("workbench");
      },
    },
    {
      icon: "profile",
      title: "Inspect a dataset",
      body: "Columns, details, rows and a profile.",
      label: "Inspect a dataset",
      run: () => {
        if (firstTable) openTablePage(firstTable);
        else useUiStore.getState().setDialog("addFiles");
      },
    },
    {
      icon: "sparkle",
      title: "Open Assistant",
      body: "Ask questions; answers cite your tables.",
      label: "Chat with the AI helper",
      run: () => useUiStore.getState().setAssistantOpen(true),
    },
  ];

  return (
    <section aria-label="Quick actions" className="mt-8">
      <h2 className="px-1 pb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Quick actions</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {actions.map((a) => (
          <button
            key={a.title}
            onClick={a.run}
            aria-label={a.label}
            className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-raised text-accent">
              <Icon name={a.icon} size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-5 text-ink">{a.title}</span>
              <span className="mt-0.5 block text-[12px] leading-4 text-muted max-sm:hidden">{a.body}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
