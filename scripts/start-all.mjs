import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("[DEV] Starting API server on port 5000...");
const api = spawn(process.execPath, [path.join(rootDir, "artifacts/api-server/dev.mjs")], {
  cwd: rootDir,
  env: { ...process.env, PORT: "5000", NODE_ENV: "development", USE_LOCAL_DB: "1" },
  stdio: ["inherit", "pipe", "pipe"],
});

api.stdout.on("data", (data) => {
  process.stdout.write(`[API] ${data}`);
});
api.stderr.on("data", (data) => {
  process.stderr.write(`[API ERROR] ${data}`);
});

console.log("[DEV] Starting Web Dashboard on port 3000...");
const isWin = process.platform === "win32";
const npxCmd = isWin ? "npx.cmd" : "npx";

const web = spawn(npxCmd, ["vite", "--config", "vite.config.ts", "--host", "0.0.0.0"], {
  cwd: path.join(rootDir, "artifacts/medprix-dashboard"),
  env: { ...process.env, PORT: "3000", BASE_PATH: "/", NODE_ENV: "development" },
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
});

web.stdout.on("data", (data) => {
  process.stdout.write(`[WEB] ${data}`);
});
web.stderr.on("data", (data) => {
  process.stderr.write(`[WEB ERROR] ${data}`);
});

const cleanup = () => {
  console.log("\n[DEV] Shutting down servers...");
  api.kill();
  web.kill();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
api.on("exit", (code) => {
  console.log(`[API] exited with code ${code}`);
});
web.on("exit", (code) => {
  console.log(`[WEB] exited with code ${code}`);
});
