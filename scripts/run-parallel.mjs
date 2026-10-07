import { spawn } from "node:child_process";

/**
 * Run several npm scripts at once and fail if any of them fails:
 *   node scripts/run-parallel.mjs lint typecheck
 * Output is streamed as it arrives, each line prefixed with the script name.
 */
const scripts = process.argv.slice(2);
if (scripts.length === 0) {
  console.error("usage: node scripts/run-parallel.mjs <script> [<script> ...]");
  process.exit(2);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(script) {
  return new Promise((resolve) => {
    const child = spawn(npm, ["run", "--silent", script], { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    const forward = (stream, target) => {
      let rest = "";
      stream.on("data", (chunk) => {
        rest += chunk;
        const lines = rest.split("\n");
        rest = lines.pop() ?? "";
        for (const line of lines) target.write(`[${script}] ${line}\n`);
      });
      stream.on("end", () => {
        if (rest) target.write(`[${script}] ${rest}\n`);
      });
    };
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    child.on("error", (err) => {
      process.stderr.write(`[${script}] ${err.message}\n`);
      resolve(1);
    });
    child.on("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

const started = Date.now();
const codes = await Promise.all(scripts.map(run));
const failed = scripts.filter((_, i) => codes[i] !== 0);
const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (failed.length > 0) {
  console.error(`run-parallel: ${failed.join(", ")} failed (${seconds}s)`);
  process.exit(1);
}
console.log(`run-parallel: ${scripts.join(", ")} passed (${seconds}s)`);
