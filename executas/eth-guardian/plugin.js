#!/usr/bin/env node
"use strict";
const readline = require("node:readline");

const MANIFEST = {
  display_name: "ETH Guardian",
  version: "0.1.0",
  description: "Control & Safety Layer for autonomous Ethereum agents.",
  tools: [],
};

function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (raw) => {
  const req = JSON.parse(raw.trim());
  if (req.method === "describe") send({ jsonrpc: "2.0", id: req.id, result: MANIFEST });
  else send({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "method not found" } });
});
