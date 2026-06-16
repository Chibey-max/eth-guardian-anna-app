#!/usr/bin/env node
/**
 * eth-guardian — Executa stdio plugin (Node.js)
 *
 * Anna's Control & Safety Layer for autonomous Ethereum agents.
 * Exposes three tool methods:
 *   - eth.check_policy    → validate a tx/calldata against guardian rules
 *   - eth.explain_risk    → translate raw on-chain data to plain English
 *   - eth.request_approval → surface a human-review gate (pending queue)
 *   - eth.get_status      → guardian/agent wallet state overview
 *
 * Protocol: JSON-RPC 2.0 over stdio (newline-delimited)
 * Methods : describe, invoke, health
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { createHash } = require("node:crypto");

// ---------------------------------------------------------------------------
// Plugin manifest
// ---------------------------------------------------------------------------
const MANIFEST = {
  display_name: "ETH Guardian",
  version: "1.0.0",
  description:
    "Control & Safety Layer for autonomous Ethereum agents. " +
    "Validates transactions against guardian policies, explains on-chain " +
    "risk in plain English, and gates sensitive operations behind human approval.",
  author: "0x_Dave",
  homepage: "https://github.com/Chibey-max/eth-guardian-anna-app",
  license: "MIT",
  tags: ["ethereum", "defi", "safety", "guardian", "agent", "web3"],
  tools: [
    {
      name: "check_policy",
      description:
        "Validate a proposed Ethereum transaction or calldata against the " +
        "guardian's active policy rules (token whitelist, selector whitelist, " +
        "spend limits, timelock). Returns ALLOW or DENY with a reason.",
      parameters: [
        {
          name: "to",
          type: "string",
          description: "Target contract or wallet address (0x…).",
          required: true,
        },
        {
          name: "value_wei",
          type: "string",
          description: "ETH value in wei (as decimal string). Use '0' for token-only calls.",
          required: false,
          default: "0",
        },
        {
          name: "calldata",
          type: "string",
          description: "Hex-encoded calldata (0x…). Empty string for plain ETH send.",
          required: false,
          default: "0x",
        },
        {
          name: "token",
          type: "string",
          description: "ERC-20 token address being transferred, if applicable.",
          required: false,
          default: "",
        },
        {
          name: "amount_raw",
          type: "string",
          description: "Token amount in raw units (as decimal string), if applicable.",
          required: false,
          default: "0",
        },
      ],
    },
    {
      name: "explain_risk",
      description:
        "Translate raw Ethereum transaction data into a plain-English risk " +
        "summary. Identifies the function selector, target protocol, estimated " +
        "gas cost, and flags any high-risk patterns (unrestricted approval, " +
        "proxy upgrade, large spend, unknown selector).",
      parameters: [
        {
          name: "to",
          type: "string",
          description: "Target address (0x…).",
          required: true,
        },
        {
          name: "calldata",
          type: "string",
          description: "Hex-encoded calldata (0x…).",
          required: false,
          default: "0x",
        },
        {
          name: "value_wei",
          type: "string",
          description: "ETH value in wei (decimal string).",
          required: false,
          default: "0",
        },
        {
          name: "chain_id",
          type: "integer",
          description: "EVM chain ID (1=mainnet, 11155111=sepolia, etc).",
          required: false,
          default: 1,
        },
      ],
    },
    {
      name: "request_approval",
      description:
        "Submit a transaction for human approval before it is sent on-chain. " +
        "Creates a pending entry in the guardian queue. Anna will surface this " +
        "to the user for a Go/No-Go decision. Returns a request_id.",
      parameters: [
        {
          name: "to",
          type: "string",
          description: "Target address.",
          required: true,
        },
        {
          name: "calldata",
          type: "string",
          description: "Hex-encoded calldata.",
          required: false,
          default: "0x",
        },
        {
          name: "value_wei",
          type: "string",
          description: "ETH value in wei.",
          required: false,
          default: "0",
        },
        {
          name: "description",
          type: "string",
          description: "Human-readable summary of what this transaction does (max 300 chars).",
          required: true,
        },
        {
          name: "risk_level",
          type: "string",
          description: "One of: low, medium, high, critical.",
          required: false,
          default: "medium",
        },
        {
          name: "action",
          type: "string",
          description: "One of: submit, approve, deny, list. Use 'list' to see pending queue.",
          required: false,
          default: "submit",
        },
        {
          name: "request_id",
          type: "string",
          description: "Required when action is approve or deny.",
          required: false,
          default: "",
        },
      ],
    },
    {
      name: "get_status",
      description:
        "Return the guardian wallet status: active policy rules, pending " +
        "approval queue size, recent approved/denied decisions, and agent " +
        "role capabilities.",
      parameters: [
        {
          name: "include_history",
          type: "boolean",
          description: "Include last 10 decisions in the response.",
          required: false,
          default: true,
        },
      ],
    },
  ],
  runtime: { type: "node", min_version: "18.0.0" },
};

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------
const STATE_DIRS = [
  process.env.ETH_GUARDIAN_STATE_DIR,
  path.join(os.homedir(), ".anna", "eth-guardian"),
  path.join(os.tmpdir(), "eth-guardian"),
].filter(Boolean);
let activeStateFile = path.join(STATE_DIRS[0], "state.json");

function now() {
  return Math.floor(Date.now() / 1000);
}

function shortId() {
  return createHash("sha256")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 8);
}

const DEFAULT_STATE = () => ({
  policy: {
    max_eth_value_wei: "1000000000000000000", // 1 ETH
    whitelisted_tokens: [],
    whitelisted_selectors: [],
    whitelisted_targets: [],
    require_approval_above_wei: "100000000000000000", // 0.1 ETH
    timelock_seconds: 0,
    allow_unknown_selectors: false,
    updated_at: now(),
  },
  pending: [],       // approval queue
  history: [],       // approved/denied decisions
  agent_role: {
    enabled: true,
    last_active: null,
    total_calls: 0,
    denied_calls: 0,
  },
});

function loadState() {
  for (const dir of STATE_DIRS) {
    const file = path.join(dir, "state.json");
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      const def = DEFAULT_STATE();
      activeStateFile = file;
      return {
        policy: { ...def.policy, ...(raw.policy || {}) },
        pending: raw.pending || [],
        history: raw.history || [],
        agent_role: { ...def.agent_role, ...(raw.agent_role || {}) },
      };
    } catch (err) {
      process.stderr.write(`[eth-guardian] corrupt state at ${file}, resetting: ${err.message}\n`);
      activeStateFile = file;
      return DEFAULT_STATE();
    }
  }
  return DEFAULT_STATE();
}

function saveState(state) {
  const errors = [];
  for (const dir of STATE_DIRS) {
    const file = path.join(dir, "state.json");
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, file);
      activeStateFile = file;
      return;
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
    }
  }
  throw new Error(`Unable to persist ETH Guardian state. Tried: ${errors.join("; ")}`);
}

// ---------------------------------------------------------------------------
// Known function selectors (4-byte lookup)
// ---------------------------------------------------------------------------
const KNOWN_SELECTORS = {
  "0xa9059cbb": { name: "transfer(address,uint256)", protocol: "ERC-20", risk: "low" },
  "0x23b872dd": { name: "transferFrom(address,address,uint256)", protocol: "ERC-20", risk: "medium" },
  "0x095ea7b3": { name: "approve(address,uint256)", protocol: "ERC-20", risk: "high" },
  "0x70a08231": { name: "balanceOf(address)", protocol: "ERC-20", risk: "low" },
  "0x18160ddd": { name: "totalSupply()", protocol: "ERC-20", risk: "low" },
  "0xe8eda9df": { name: "deposit(address,uint256,address,uint16)", protocol: "Aave", risk: "medium" },
  "0x69328dec": { name: "withdraw(address,uint256,address)", protocol: "Aave", risk: "medium" },
  "0x7ff36ab5": { name: "swapExactETHForTokens(…)", protocol: "Uniswap V2", risk: "medium" },
  "0x38ed1739": { name: "swapExactTokensForTokens(…)", protocol: "Uniswap V2", risk: "medium" },
  "0x3593564c": { name: "execute(bytes,bytes[],uint256)", protocol: "Uniswap V3", risk: "medium" },
  "0x4f1eb3d8": { name: "upgradeToAndCall(address,bytes)", protocol: "Proxy", risk: "critical" },
  "0x3659cfe6": { name: "upgradeTo(address)", protocol: "Proxy", risk: "critical" },
  "0x5c975abb": { name: "paused()", protocol: "Pausable", risk: "low" },
  "0x8456cb59": { name: "pause()", protocol: "Pausable", risk: "high" },
  "0x3f4ba83a": { name: "unpause()", protocol: "Pausable", risk: "high" },
  "0xf2fde38b": { name: "transferOwnership(address)", protocol: "Ownable", risk: "critical" },
  "0x715018a6": { name: "renounceOwnership()", protocol: "Ownable", risk: "critical" },
};

const RISK_WEIGHT = { low: 1, medium: 2, high: 3, critical: 4 };

function selectorInfo(calldata) {
  if (!calldata || calldata === "0x" || calldata.length < 10) {
    return { selector: null, known: false, name: "plain ETH transfer", protocol: "Native", risk: "low" };
  }
  const sel = calldata.slice(0, 10).toLowerCase();
  const info = KNOWN_SELECTORS[sel];
  if (info) return { selector: sel, known: true, ...info };
  return { selector: sel, known: false, name: "unknown function", protocol: "Unknown", risk: "medium" };
}

function isUnlimitedApproval(calldata, selInfo) {
  return (
    selInfo.selector === "0x095ea7b3" &&
    calldata.length > 10 &&
    calldata.slice(-64).replace(/f/gi, "").length === 0
  );
}

const CHAIN_NAMES = {
  1: "Ethereum Mainnet",
  11155111: "Sepolia Testnet",
  17000: "Holesky Testnet",
  8453: "Base",
  42161: "Arbitrum One",
  10: "Optimism",
  137: "Polygon",
  5000: "Mantle",
};

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
function toolCheckPolicy(args) {
  const state = loadState();
  const policy = state.policy;
  const { to, value_wei = "0", calldata = "0x", token = "", amount_raw = "0" } = args;

  const denials = [];
  const warnings = [];

  // 1. Target whitelist check
  const normalTo = (to || "").toLowerCase();
  if (
    policy.whitelisted_targets.length > 0 &&
    !policy.whitelisted_targets.map((a) => a.toLowerCase()).includes(normalTo)
  ) {
    denials.push(`Target ${to} is not in the guardian whitelist.`);
  }

  // 2. ETH value check
  const valueWei = BigInt(value_wei || "0");
  const maxWei = BigInt(policy.max_eth_value_wei || "0");
  if (valueWei > maxWei) {
    denials.push(
      `ETH value (${value_wei} wei) exceeds policy maximum (${policy.max_eth_value_wei} wei).`
    );
  }

  // 3. Approval-gate threshold
  const approvalThresh = BigInt(policy.require_approval_above_wei || "0");
  if (valueWei > approvalThresh && approvalThresh > 0n) {
    warnings.push(
      `Value exceeds approval threshold (${policy.require_approval_above_wei} wei). ` +
        "Human approval recommended."
    );
  }

  // 4. Selector whitelist
  const selInfo = selectorInfo(calldata);
  if (
    selInfo.selector &&
    policy.whitelisted_selectors.length > 0 &&
    !policy.whitelisted_selectors.includes(selInfo.selector) &&
    !policy.allow_unknown_selectors
  ) {
    denials.push(
      `Function selector ${selInfo.selector} (${selInfo.name}) is not whitelisted.`
    );
  }

  // 5. Token whitelist
  if (token && policy.whitelisted_tokens.length > 0) {
    if (!policy.whitelisted_tokens.map((a) => a.toLowerCase()).includes(token.toLowerCase())) {
      denials.push(`Token ${token} is not in the whitelisted token list.`);
    }
  }

  // 6. High-risk selector escalation
  if (isUnlimitedApproval(calldata, selInfo)) {
    denials.push(
      "Unlimited ERC-20 approval detected. This grants ongoing spending rights and is blocked by guardian policy."
    );
  } else if (selInfo.risk === "critical") {
    denials.push(
      `Selector ${selInfo.name} is classified as CRITICAL risk (${selInfo.protocol}). ` +
        "Blocked by guardian policy."
    );
  } else if (selInfo.risk === "high") {
    warnings.push(
      `Selector ${selInfo.name} is HIGH risk. Review carefully before approving.`
    );
  }

  // Update agent stats
  state.agent_role.total_calls += 1;
  if (denials.length > 0) state.agent_role.denied_calls += 1;
  state.agent_role.last_active = now();
  saveState(state);

  const verdict = denials.length > 0 ? "DENY" : "ALLOW";
  return {
    verdict,
    selector: selInfo,
    denials,
    warnings,
    policy_snapshot: {
      max_eth_value_wei: policy.max_eth_value_wei,
      require_approval_above_wei: policy.require_approval_above_wei,
      whitelisted_targets_count: policy.whitelisted_targets.length,
      whitelisted_selectors_count: policy.whitelisted_selectors.length,
    },
    checked_at: now(),
  };
}

function toolExplainRisk(args) {
  const { to, calldata = "0x", value_wei = "0", chain_id = 1 } = args;
  const selInfo = selectorInfo(calldata);
  const valueWei = BigInt(value_wei || "0");
  const valueEth = Number(valueWei) / 1e18;
  const chainName = CHAIN_NAMES[chain_id] || `Chain ${chain_id}`;

  const riskFlags = [];
  let overallRisk = selInfo.risk || "low";

  // Detect unlimited approval (max uint256)
  if (isUnlimitedApproval(calldata, selInfo)) {
    riskFlags.push("⚠️  Unlimited token approval detected — grants infinite spending rights.");
    overallRisk = "critical";
  }

  if (selInfo.risk === "critical") {
    riskFlags.push(
      `🚨 ${selInfo.name} is a privileged administrative call (${selInfo.protocol}). ` +
        "This can transfer contract ownership or upgrade proxy logic."
    );
  }

  if (valueEth > 1) {
    riskFlags.push(`💸 Sends ${valueEth.toFixed(4)} ETH — significant value transfer.`);
    if (RISK_WEIGHT[overallRisk] < RISK_WEIGHT["high"]) overallRisk = "high";
  } else if (valueEth > 0.1) {
    riskFlags.push(`💸 Sends ${valueEth.toFixed(4)} ETH.`);
    if (RISK_WEIGHT[overallRisk] < RISK_WEIGHT["medium"]) overallRisk = "medium";
  }

  if (!selInfo.known && selInfo.selector) {
    riskFlags.push(
      `🔍 Unknown function selector ${selInfo.selector} — not in the ETH Guardian library. ` +
        "Verify the target contract's ABI before approving."
    );
  }

  const summary = buildSummary(selInfo, valueEth, chainName, riskFlags, overallRisk);

  return {
    summary,
    chain: chainName,
    target: to,
    function: selInfo.name,
    protocol: selInfo.protocol,
    risk_level: overallRisk,
    value_eth: valueEth.toFixed(6),
    risk_flags: riskFlags,
    selector: selInfo.selector || null,
    explained_at: now(),
  };
}

function buildSummary(selInfo, valueEth, chainName, flags, risk) {
  const action =
    selInfo.known
      ? `calls \`${selInfo.name}\` on a ${selInfo.protocol} contract`
      : "calls an unrecognized function";
  const valuePart = valueEth > 0 ? ` and sends ${valueEth.toFixed(4)} ETH` : "";
  const riskLabel = { low: "Low", medium: "Medium", high: "High", critical: "CRITICAL" }[risk];
  return (
    `This transaction ${action}${valuePart} on ${chainName}. ` +
    `Overall risk: **${riskLabel}**. ` +
    (flags.length > 0
      ? `Key concerns: ${flags.map((f) => f.replace(/^[^\w]+/, "")).join("; ")}.`
      : "No major concerns detected.")
  );
}

function toolRequestApproval(args) {
  const {
    to,
    calldata = "0x",
    value_wei = "0",
    description = "",
    risk_level = "medium",
    action = "submit",
    request_id = "",
  } = args;

  const state = loadState();

  if (action === "list") {
    return {
      pending: state.pending,
      pending_count: state.pending.length,
      recent_history: state.history.slice(0, 5),
    };
  }

  if (action === "approve" || action === "deny") {
    const idx = state.pending.findIndex((p) => p.request_id === request_id);
    if (idx === -1) {
      return { error: `No pending request found with id ${request_id}.` };
    }
    const entry = state.pending.splice(idx, 1)[0];
    const record = {
      ...entry,
      decision: action === "approve" ? "approved" : "denied",
      decided_at: now(),
    };
    state.history.unshift(record);
    state.history = state.history.slice(0, 100);
    saveState(state);
    return {
      decision: record.decision,
      request_id: record.request_id,
      description: record.description,
      decided_at: record.decided_at,
    };
  }

  // action === "submit"
  const id = shortId();
  const risk = ["low", "medium", "high", "critical"].includes(risk_level)
    ? risk_level
    : "medium";

  const entry = {
    request_id: id,
    to,
    calldata: calldata || "0x",
    value_wei: value_wei || "0",
    description: String(description).trim().slice(0, 300),
    risk_level: risk,
    submitted_at: now(),
    status: "pending",
  };

  state.pending.push(entry);
  // Auto-expire pending requests older than 1 hour
  const cutoff = now() - 3600;
  state.pending = state.pending.filter((p) => p.submitted_at > cutoff);
  saveState(state);

  return {
    request_id: id,
    status: "pending",
    message:
      `Approval request submitted. Risk level: ${risk.toUpperCase()}. ` +
      "Use `request_approval` with action='list' to see the queue, " +
      "or action='approve'/'deny' with the request_id to decide.",
    submitted_at: entry.submitted_at,
  };
}

function toolGetStatus(args) {
  const { include_history = true } = args;
  const state = loadState();
  const result = {
    guardian: {
      policy: state.policy,
      pending_approvals: state.pending.length,
      pending_queue: state.pending,
    },
    agent_role: state.agent_role,
    stats: {
      total_calls: state.agent_role.total_calls,
      denied_calls: state.agent_role.denied_calls,
      approval_rate:
        state.agent_role.total_calls > 0
          ? (
              ((state.agent_role.total_calls - state.agent_role.denied_calls) /
                state.agent_role.total_calls) *
              100
            ).toFixed(1) + "%"
          : "N/A",
    },
    state_file: activeStateFile,
    checked_at: now(),
  };
  if (include_history) {
    result.recent_decisions = state.history.slice(0, 10);
  }
  return result;
}

const TOOL_DISPATCH = {
  check_policy: toolCheckPolicy,
  explain_risk: toolExplainRisk,
  request_approval: toolRequestApproval,
  get_status: toolGetStatus,
};

// ---------------------------------------------------------------------------
// JSON-RPC handlers
// ---------------------------------------------------------------------------
function handleDescribe() {
  return MANIFEST;
}

function handleInvoke(params) {
  const tool = params.tool;
  const args =
    params.arguments && typeof params.arguments === "object" ? params.arguments : {};
  const fn = TOOL_DISPATCH[tool];
  if (!fn) throw new Error(`unknown tool: ${JSON.stringify(tool)}`);
  try {
    const payload = fn(args);
    return { success: true, data: payload };
  } catch (err) {
    return { success: false, error: `${err.name}: ${err.message}` };
  }
}

function handleHealth() {
  return { status: "ok", state_file: activeStateFile, version: MANIFEST.version };
}

const METHOD_DISPATCH = {
  describe: handleDescribe,
  invoke: handleInvoke,
  health: handleHealth,
};

// ---------------------------------------------------------------------------
// Stdio loop
// ---------------------------------------------------------------------------
function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function main() {
  process.stderr.write(
    `[eth-guardian] ${MANIFEST.display_name} v${MANIFEST.version} ready\n`
  );
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (raw) => {
    const line = raw.trim();
    if (!line) return;
    let req;
    try {
      req = JSON.parse(line);
    } catch (e) {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: `parse error: ${e.message}` } });
      return;
    }
    const reqId = req.id;
    const method = req.method;
    const params = req.params || {};
    const handler = METHOD_DISPATCH[method];
    if (!handler) {
      send({ jsonrpc: "2.0", id: reqId, error: { code: -32601, message: `method not found: ${method}` } });
      return;
    }
    try {
      const result = handler(params);
      send({ jsonrpc: "2.0", id: reqId, result });
    } catch (err) {
      send({ jsonrpc: "2.0", id: reqId, error: { code: -32000, message: err.message || String(err) } });
    }
  });
}

main();
