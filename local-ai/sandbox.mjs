// Builds the bubblewrap command line that runs one AI CLI with a minimal view of the host:
// system libraries, the CLI's own install + login files, the network, and an empty work dir.
// Everything else in $HOME (projects, keys, other apps' data) is simply absent.
import { copyFileSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const HOME = homedir();
const h = (p) => path.join(HOME, p);

const ETC = [
  "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", "/etc/passwd", "/etc/group",
  "/etc/ssl", "/etc/ca-certificates", "/etc/localtime", "/etc/host.conf", "/etc/gai.conf",
];

/**
 * Per-CLI mounts. `ro` = install dirs; `rw` = the CLI's own login/config dirs, mounted
 * whole because token refreshes rewrite files via rename. `copy` = files given as a
 * throwaway copy (writes are discarded). Claude, Codex and Grok run with every tool
 * disabled; Cursor keeps read tools in "ask" mode, so it sees nothing but its auth dir.
 */
export const CLI_MOUNTS = {
  claude: { ro: [h(".local/share/claude")], rw: [h(".claude"), h(".claude.json")], copy: [] },
  codex: { ro: [h(".local/lib/node_modules/@openai")], rw: [h(".codex")], copy: [] },
  grok: { ro: [], rw: [h(".grok")], copy: [] },
  cursor: { ro: [h(".local/share/cursor-agent")], rw: [h(".config/cursor")], copy: [h(".cursor/cli-config.json")] },
};

/** The executable each CLI is launched with (real path, so relative lookups work). */
export const CLI_BIN = {
  claude: ".local/bin/claude",
  codex: ".local/bin/codex",
  grok: ".local/bin/grok",
  cursor: ".local/bin/cursor-agent",
};

export function cliExecutable(cli) {
  return realpathSync(h(CLI_BIN[cli]));
}

export function sandboxArgs(cli, workDir) {
  const mounts = CLI_MOUNTS[cli];
  const args = [
    "--ro-bind", "/usr", "/usr",
    "--symlink", "usr/bin", "/bin", "--symlink", "usr/sbin", "/sbin",
    "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64",
    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
    "--tmpfs", HOME,
    "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--unshare-cgroup-try",
    "--die-with-parent", "--new-session",
    "--setenv", "HOME", HOME,
    "--setenv", "PATH", `${h(".local/bin")}:/usr/local/bin:/usr/bin:/bin`,
  ];
  for (const p of ETC) if (existsSync(p)) args.push("--ro-bind", p, p);
  // systemd-resolved: /etc/resolv.conf points into /run.
  if (existsSync("/run/systemd/resolve")) args.push("--ro-bind", "/run/systemd/resolve", "/run/systemd/resolve");
  for (const p of mounts.ro) if (existsSync(p)) args.push("--ro-bind", p, p);
  for (const p of mounts.rw) if (existsSync(p)) args.push("--bind", p, p);
  for (const p of mounts.copy) {
    if (!existsSync(p)) continue;
    const dir = path.join(workDir, ".copies");
    mkdirSync(dir, { recursive: true });
    const copy = path.join(dir, path.basename(p));
    copyFileSync(p, copy);
    // Mount the copy's directory so atomic rename-writes inside it succeed (and vanish).
    args.push("--bind", dir, path.dirname(p));
  }
  // Grok's binary lives inside its (writable) home dir; others need their real exe path.
  const exe = cliExecutable(cli);
  if (existsSync(exe) && !mounts.rw.some((d) => exe.startsWith(d + "/"))) args.push("--ro-bind", exe, exe);
  args.push("--bind", workDir, workDir, "--chdir", workDir);
  return args;
}
