# Local AI bridge

Lets a self-hosted QueryPad use the AI command-line tools already signed in on its host —
no API keys. QueryPad offers these models through it:

| QueryPad model | CLI | Model id | Effort |
|----------------|-----|----------|--------|
| Claude · Sonnet 5.5 | `claude` (Claude Code) | `claude-sonnet-5-5` | low / medium |
| Codex · GPT-6 Luna | `codex` | `gpt-6-luna` | low / medium |
| Grok · Grok 4.7 | `grok` | `grok-4.7` | low / medium |
| Cursor · Grok 4.7 Medium Fast (256k) | `cursor-agent` | `grok-4.7-medium-fast` | fixed |
| Cursor · Composer 2.5 | `cursor-agent` | `composer-2.5` | fixed |

Only models whose CLI is installed show as available.

## How it is isolated

Prompts include your schema and some column values, so they are treated as untrusted:

- Each request runs the CLI under **bubblewrap**: the sandbox sees `/usr`, a few files from
  `/etc` (DNS, certificates), the CLI's own install and login folders, and an empty scratch
  folder. The rest of your home directory, `/apps`, SSH keys and other apps' data don't exist
  inside it.
- Tools are switched off where the CLI allows: Claude `--tools ""`; Codex with the user config
  ignored and the shell, browser, computer-use and apps features disabled; Grok `--tools ""`
  with `--permission-mode dontAsk`; Cursor in read-only "ask" mode (its reads only reach the
  sandbox).
- The bridge listens on a Unix socket (mode 600), never a network port, and every request
  must carry the shared token. Three requests run at a time; each is stopped after 3 minutes
  or as soon as the browser cancels.

## Setup (systemd user service)

Requirements: Node 20+, `bwrap` (bubblewrap), and the CLIs signed in as the same user.

```bash
mkdir -p ~/.config/querypad ~/.local/state/querypad-ai && chmod 700 ~/.local/state/querypad-ai
TOKEN=$(openssl rand -hex 32)
cat > ~/.config/querypad/ai-bridge.env <<EOF
QUERYPAD_BRIDGE_TOKEN=$TOKEN
QUERYPAD_BRIDGE_SOCKET=$HOME/.local/state/querypad-ai/bridge.sock
EOF
chmod 600 ~/.config/querypad/ai-bridge.env

mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/querypad-ai-bridge.service <<EOF
[Unit]
Description=QueryPad local AI bridge
[Service]
EnvironmentFile=%h/.config/querypad/ai-bridge.env
ExecStart=$(command -v node) $PWD/local-ai/bridge.mjs
Restart=always
[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload && systemctl --user enable --now querypad-ai-bridge
loginctl enable-linger "$USER"   # keep it running without a login session
```

Then give QueryPad the same token and the socket path as seen inside the container
(`docker-compose.yml` mounts `~/.local/state/querypad-ai` at `/run/querypad-ai`), in
`.env.server`:

```bash
QUERYPAD_BRIDGE_TOKEN=<same token>
QUERYPAD_BRIDGE_SOCKET=/run/querypad-ai/bridge.sock
```

The container's user must have the same uid as the bridge's user (1000 in the stock image)
to open the socket. Without Docker, run QueryPad as that user and point
`QUERYPAD_BRIDGE_SOCKET` at the real path.

Check it: `curl --unix-socket ~/.local/state/querypad-ai/bridge.sock -H "x-querypad-bridge-token: $TOKEN" http://x/health`.
Logs: `journalctl --user -u querypad-ai-bridge`.
