#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const pluginPath = path.join(__dirname, "..", "executas", "eth-guardian", "plugin.js");
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "eth-guardian-test-"));
const unlimitedApproval =
  "0x095ea7b3" +
  "0000000000000000000000002222222222222222222222222222222222222222" +
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

function startRpcServer() {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const message = JSON.parse(body);
      let result = "0x";
      if (message.method === "eth_chainId") result = "0xaa36a7";
      if (message.method === "eth_getCode") result = "0x6001600055";
      if (message.method === "eth_getBalance") result = "0xde0b6b3a7640000";
      if (message.method === "eth_call") {
        const data = message.params?.[0]?.data || "0x";
        result = data.startsWith("0xdd62ed3e")
          ? "0x000000000000000000000000000000000000000000000000000000000000000a"
          : "0x";
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function startPlugin(rpcUrl) {
  const child = spawn(process.execPath, [pluginPath], {
    env: { ...process.env, ETH_GUARDIAN_STATE_DIR: stateDir, SEPOLIA_RPC_URL: rpcUrl },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const queue = [];
  let buffer = "";

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const next = queue.shift();
      if (next) next(JSON.parse(line));
    }
  });

  function request(message) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${message.method}`)), 2000);
      queue.push((response) => {
        clearTimeout(timeout);
        resolve(response);
      });
      child.stdin.write(JSON.stringify(message) + "\n");
    });
  }

  return { child, request };
}

async function main() {
  const { server, url } = await startRpcServer();
  const { child, request } = startPlugin(url);
  try {
    const describe = await request({ jsonrpc: "2.0", id: 1, method: "describe", params: {} });
    assert.equal(describe.result.display_name, "ETH Guardian");
    assert.equal(describe.result.tools.length, 5);

    const policy = await request({
      jsonrpc: "2.0",
      id: 2,
      method: "invoke",
      params: {
        tool: "check_policy",
        arguments: {
          to: "0x1111111111111111111111111111111111111111",
          value_wei: "0",
          calldata: unlimitedApproval,
        },
      },
    });
    assert.equal(policy.result.success, true);
    assert.equal(policy.result.data.verdict, "DENY");
    assert.match(policy.result.data.denials.join(" "), /Unlimited ERC-20 approval/);

    const risk = await request({
      jsonrpc: "2.0",
      id: 3,
      method: "invoke",
      params: {
        tool: "explain_risk",
        arguments: {
          to: "0x1111111111111111111111111111111111111111",
          value_wei: "0",
          calldata: unlimitedApproval,
          chain_id: 1,
        },
      },
    });
    assert.equal(risk.result.success, true);
    assert.equal(risk.result.data.risk_level, "critical");

    const onchain = await request({
      jsonrpc: "2.0",
      id: 9,
      method: "invoke",
      params: {
        tool: "verify_onchain",
        arguments: {
          to: "0x1111111111111111111111111111111111111111",
          from: "0x9999999999999999999999999999999999999999",
          value_wei: "0",
          calldata: unlimitedApproval,
          chain_id: 11155111,
        },
      },
    });
    assert.equal(onchain.result.success, true);
    assert.equal(onchain.result.data.live, true);
    assert.equal(onchain.result.data.rpc_connected, true);
    assert.equal(onchain.result.data.actual_chain_id, 11155111);
    assert.equal(onchain.result.data.target_has_code, true);
    assert.equal(onchain.result.data.target_balance_eth, "1.000000");
    assert.equal(onchain.result.data.simulation.success, true);
    assert.equal(onchain.result.data.allowance.current_allowance_raw, "10");

    const submitted = await request({
      jsonrpc: "2.0",
      id: 4,
      method: "invoke",
      params: {
        tool: "request_approval",
        arguments: {
          action: "submit",
          to: "0x3333333333333333333333333333333333333333",
          description: "Demo high-risk transaction",
          risk_level: "high",
        },
      },
    });
    assert.equal(submitted.result.success, true);
    assert.equal(submitted.result.data.status, "pending");

    const listed = await request({
      jsonrpc: "2.0",
      id: 5,
      method: "invoke",
      params: { tool: "request_approval", arguments: { action: "list" } },
    });
    assert.equal(listed.result.data.pending_count, 1);

    const approved = await request({
      jsonrpc: "2.0",
      id: 6,
      method: "invoke",
      params: {
        tool: "request_approval",
        arguments: {
          action: "approve",
          request_id: submitted.result.data.request_id,
        },
      },
    });
    assert.equal(approved.result.data.decision, "approved");

    const status = await request({
      jsonrpc: "2.0",
      id: 7,
      method: "invoke",
      params: { tool: "get_status", arguments: { include_history: true } },
    });
    assert.equal(status.result.success, true);
    assert.equal(status.result.data.recent_decisions.length, 1);

    const health = await request({ jsonrpc: "2.0", id: 8, method: "health", params: {} });
    assert.equal(health.result.status, "ok");
    assert.match(health.result.state_file, /state\.json$/);
  } finally {
    child.kill();
    server.close();
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

main()
  .then(() => {
    console.log("ETH Guardian plugin tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
