import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const build = spawn(process.execPath, [path.resolve(dir, "build.mjs")], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" },
});

build.on("exit", (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  const server = spawn(
    process.execPath,
    ["--enable-source-maps", path.resolve(dir, "dist/index.mjs")],
    {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "development" },
    },
  );

  server.on("exit", (exitCode) => {
    process.exit(exitCode ?? 0);
  });
});
