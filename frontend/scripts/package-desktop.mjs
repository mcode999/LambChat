import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function hasCommand(command) {
  return (
    spawnSync(command, ["--version"], {
      stdio: "ignore",
    }).status === 0
  );
}

const appUrl = process.env.LAMBCHAT_APP_URL || "";

if (!appUrl) {
  console.error(
    "Missing LAMBCHAT_APP_URL. Example: LAMBCHAT_APP_URL=https://chat.example.com pnpm package:desktop",
  );
  process.exit(1);
}

if (!hasCommand("rustc") || !hasCommand("cargo")) {
  console.error(
    "Rust is required for Pake desktop builds. Install Rust and Tauri system prerequisites, then rerun this command.",
  );
  console.error("See: https://tauri.app/start/prerequisites/");
  process.exit(1);
}

const iconPath = resolve("public/icons/icon-512.png");
const args = [
  "dlx",
  "pake-cli@3.11.7",
  appUrl,
  "--name",
  process.env.LAMBCHAT_APP_NAME || "LambChat",
  "--width",
  process.env.LAMBCHAT_APP_WIDTH || "1280",
  "--height",
  process.env.LAMBCHAT_APP_HEIGHT || "860",
];

if (existsSync(iconPath)) {
  args.push("--icon", iconPath);
}

if (process.env.PAKE_TARGETS) {
  args.push("--targets", process.env.PAKE_TARGETS);
}

if (process.env.PAKE_DEBUG === "1") {
  args.push("--debug");
}

const result = spawnSync(pnpmCommand, args, {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
