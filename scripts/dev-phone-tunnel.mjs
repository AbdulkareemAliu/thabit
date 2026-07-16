#!/usr/bin/env node
import { spawn } from "node:child_process";

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false, ...options });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });

await run("npm", ["run", "build:preview"]);
await run("npm", ["run", "free-preview-port"]);

const preview = spawn(
  "npx",
  ["vite", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, THABIT_PHONE: "1", VITE_DISABLE_SW: "1" },
  },
);

const tunnel = spawn("npx", ["localtunnel", "--port", "4173"], {
  stdio: "inherit",
  shell: false,
});

const shutdown = () => {
  preview.kill("SIGTERM");
  tunnel.kill("SIGTERM");
};

process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(143);
});

await Promise.race([
  new Promise((resolve) => preview.on("exit", resolve)),
  new Promise((resolve) => tunnel.on("exit", resolve)),
]);

shutdown();
