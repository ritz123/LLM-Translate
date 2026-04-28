#!/usr/bin/env node
/**
 * Spawn Electron like `electron .` but drop known harmless Chromium stderr lines
 * (no session D-Bus, GPU helper exit) on minimal Linux / containers.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "electron", "cli.js");

const NOISE = [
  /ERROR:bus\.cc/,
  /Failed to connect to the bus/,
  /Failed to connect to socket \/run\/dbus/,
  /ERROR:viz_main_impl\.cc/,
  /Exiting GPU process due to errors/,
];

function isNoise(line) {
  return NOISE.some((re) => re.test(line));
}

const args = process.argv.slice(2);
const child = spawn(process.execPath, [cli, ...args], {
  cwd: root,
  stdio: ["inherit", "inherit", "pipe"],
  env: process.env,
});

let buf = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  buf += chunk;
  for (;;) {
    const idx = buf.indexOf("\n");
    if (idx === -1) break;
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!isNoise(line)) process.stderr.write(`${line}\n`);
  }
});
child.stderr.on("end", () => {
  if (buf.length === 0) return;
  const lines = buf.split("\n");
  const last = lines.pop() ?? "";
  for (const line of lines) {
    if (!isNoise(line)) process.stderr.write(`${line}\n`);
  }
  if (last.length > 0 && !isNoise(last)) process.stderr.write(`${last}\n`);
});

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
