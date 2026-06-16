#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

const anna = run("anna-app", ["dev"]);

anna.on("error", (err) => {
  if (err.code !== "ENOENT") {
    console.error(err.message);
    process.exit(1);
  }

  console.log("anna-app CLI was not found.");
  console.log("Starting ETH Guardian browser preview instead.");
  console.log("Open http://127.0.0.1:4173");
  console.log("Use `npm run dev:anna` after installing the Anna developer CLI.");

  const preview = run("python3", ["-m", "http.server", "4173", "-d", "bundle"]);
  preview.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code || 0);
  });
});

anna.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code || 0);
});
