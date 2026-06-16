/**
 * ETH Guardian — Anna App bundle controller
 *
 * Connects to Anna via the runtime SDK when available.
 * RPC shapes used:
 *   anna.tools.invoke({ tool_id, method, args })
 *   anna.storage.get({ key })
 *   anna.storage.set({ key, value })
 *   anna.chat.write_message({ role, content })
 *   anna.window.set_title({ title })
 */

// ── Tool ID resolution ──────────────────────────────────────────────────────
const DEV_TOOL_ID = "tool-0xdave-eth-guardian-00000000";
const TOOL_ID =
  (typeof window !== "undefined" &&
    window.__ANNA_TOOL_IDS__ &&
    window.__ANNA_TOOL_IDS__["eth-guardian"]) ||
  DEV_TOOL_ID;
const TOOL_METHOD_CHECK   = "check_policy";
const TOOL_METHOD_EXPLAIN = "explain_risk";
const TOOL_METHOD_APPROVE = "request_approval";
const TOOL_METHOD_STATUS  = "get_status";
const STORAGE_KEY_VIEW    = "eth-guardian:last-view";

// ── DOM refs ────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const tabs  = document.querySelectorAll(".tab");
const views = document.querySelectorAll(".view");

const els = {
  connDot:        $("conn-dot"),
  chainBadge:     $("chain-badge"),
  pendingCount:   $("pending-count"),

  // Stats
  statTotal:      $("stat-total"),
  statDenied:     $("stat-denied"),
  statRate:       $("stat-rate"),
  statPending:    $("stat-pending-val"),

  // Check policy
  checkTo:        $("check-to"),
  checkValue:     $("check-value"),
  checkCalldata:  $("check-calldata"),
  btnCheck:       $("btn-check"),
  checkResult:    $("check-result"),

  // Explain risk
  explainTo:      $("explain-to"),
  explainCalldata:$("explain-calldata"),
  explainChain:   $("explain-chain"),
  btnExplain:     $("btn-explain"),
  explainResult:  $("explain-result"),

  // Pending
  approvalList:   $("approval-list"),
  btnRefreshPending: $("btn-refresh-pending"),
  reqTo:          $("req-to"),
  reqDesc:        $("req-desc"),
  reqCalldata:    $("req-calldata"),
  reqRisk:        $("req-risk"),
  btnSubmitApproval: $("btn-submit-approval"),
  approvalResult: $("approval-result"),

  // Policy
  btnRefreshPolicy: $("btn-refresh-policy"),
  polMaxEth:      $("pol-max-eth"),
  polThresh:      $("pol-thresh"),
  polTargets:     $("pol-targets"),
  polSelectors:   $("pol-selectors"),
  polUnknown:     $("pol-unknown"),
  polTimelock:    $("pol-timelock"),
  polUpdated:     $("pol-updated"),
  agentStatus:    $("agent-status"),
  agentCalls:     $("agent-calls"),
  agentDenied:    $("agent-denied"),
  agentLast:      $("agent-last"),

  // History
  historyList:    $("history-list"),
  btnRefreshHistory: $("btn-refresh-history"),

  toastContainer: $("toast-container"),
};

let anna = null;
let isCalling = false;
const previewState = {
  totalCalls: 0,
  deniedCalls: 0,
  pending: [],
  history: [],
};

// ── Anna connection ─────────────────────────────────────────────────────────
async function init() {
  bindUI();
  try {
    const { AnnaAppRuntime } = await import("/static/anna-apps/_sdk/latest/index.js");
    anna = await AnnaAppRuntime.connect();
    setConnected(true);
    const savedView = await safeStorageGet(STORAGE_KEY_VIEW);
    if (savedView) switchView(savedView, false);
    await refreshStatus();
  } catch (e) {
    setConnected(false);
    // Standalone preview — still functional with mock data
    renderStandaloneMock();
  }
}

function setConnected(ok) {
  els.connDot.classList.toggle("is-connected", ok);
  els.connDot.title = ok ? "Connected to Anna" : "Standalone preview";
  if (ok) els.chainBadge.textContent = "ETH";
}

// ── Tool invocation ─────────────────────────────────────────────────────────
async function callTool(method, args) {
  if (!anna) return callPreviewTool(method, args);
  const result = await anna.tools.invoke({ tool_id: TOOL_ID, method, args });
  if (!result.success) throw new Error(result.error || "Tool call failed");
  return result.data;
}

function callPreviewTool(method, args = {}) {
  switch (method) {
    case TOOL_METHOD_CHECK:
      return previewCheckPolicy(args);
    case TOOL_METHOD_EXPLAIN:
      return previewExplainRisk(args);
    case TOOL_METHOD_APPROVE:
      return previewApproval(args);
    case TOOL_METHOD_STATUS:
      return previewStatus();
    default:
      throw new Error(`Preview tool not implemented: ${method}`);
  }
}

function previewSelector(calldata = "0x") {
  const selector = calldata.length >= 10 ? calldata.slice(0, 10).toLowerCase() : null;
  const known = {
    "0xa9059cbb": { name: "transfer(address,uint256)", protocol: "ERC-20", risk: "low" },
    "0x23b872dd": { name: "transferFrom(address,address,uint256)", protocol: "ERC-20", risk: "medium" },
    "0x095ea7b3": { name: "approve(address,uint256)", protocol: "ERC-20", risk: "high" },
    "0x3659cfe6": { name: "upgradeTo(address)", protocol: "Proxy", risk: "critical" },
    "0xf2fde38b": { name: "transferOwnership(address)", protocol: "Ownable", risk: "critical" },
    "0x715018a6": { name: "renounceOwnership()", protocol: "Ownable", risk: "critical" },
  };
  if (!selector) return { selector: null, known: false, name: "plain ETH transfer", protocol: "Native", risk: "low" };
  return known[selector] ? { selector, known: true, ...known[selector] } : { selector, known: false, name: "unknown function", protocol: "Unknown", risk: "medium" };
}

function previewIsUnlimitedApproval(calldata, selInfo) {
  return selInfo.selector === "0x095ea7b3" && calldata.length > 10 && calldata.slice(-64).replace(/f/gi, "").length === 0;
}

function previewCheckPolicy(args) {
  const calldata = args.calldata || "0x";
  const valueWei = BigInt(args.value_wei || "0");
  const selInfo = previewSelector(calldata);
  const denials = [];
  const warnings = [];

  if (valueWei > 1000000000000000000n) {
    denials.push("ETH value exceeds preview policy maximum of 1 ETH.");
  } else if (valueWei > 100000000000000000n) {
    warnings.push("Value exceeds preview approval threshold of 0.1 ETH. Human approval recommended.");
  }
  if (previewIsUnlimitedApproval(calldata, selInfo)) {
    denials.push("Unlimited ERC-20 approval detected. This grants ongoing spending rights and is blocked by guardian policy.");
  } else if (selInfo.risk === "critical") {
    denials.push(`Selector ${selInfo.name} is classified as CRITICAL risk and is blocked by guardian policy.`);
  } else if (selInfo.risk === "high") {
    warnings.push(`Selector ${selInfo.name} is HIGH risk. Review carefully before approving.`);
  }

  previewState.totalCalls += 1;
  if (denials.length) previewState.deniedCalls += 1;

  return {
    verdict: denials.length ? "DENY" : "ALLOW",
    selector: selInfo,
    denials,
    warnings,
    policy_snapshot: {
      max_eth_value_wei: "1000000000000000000",
      require_approval_above_wei: "100000000000000000",
      whitelisted_targets_count: 0,
      whitelisted_selectors_count: 0,
    },
    checked_at: Math.floor(Date.now() / 1000),
  };
}

function previewExplainRisk(args) {
  const calldata = args.calldata || "0x";
  const selInfo = previewSelector(calldata);
  const valueEth = Number(BigInt(args.value_wei || "0")) / 1e18;
  let risk = selInfo.risk || "low";
  const flags = [];

  if (previewIsUnlimitedApproval(calldata, selInfo)) {
    risk = "critical";
    flags.push("Unlimited token approval detected - grants ongoing spending rights.");
  }
  if (!selInfo.known && selInfo.selector) flags.push(`Unknown function selector ${selInfo.selector}.`);
  if (valueEth > 1 && risk !== "critical") risk = "high";
  if (valueEth > 0.1 && risk === "low") risk = "medium";

  return {
    summary: `Preview mode: this transaction calls ${selInfo.name} on ${selInfo.protocol}. Overall risk: ${risk.toUpperCase()}.`,
    chain: "Ethereum Mainnet",
    target: args.to,
    function: selInfo.name,
    protocol: selInfo.protocol,
    risk_level: risk,
    value_eth: valueEth.toFixed(6),
    risk_flags: flags,
    selector: selInfo.selector,
    explained_at: Math.floor(Date.now() / 1000),
  };
}

function previewApproval(args) {
  const action = args.action || "submit";
  if (action === "list") {
    return {
      pending: previewState.pending,
      pending_count: previewState.pending.length,
      recent_history: previewState.history.slice(0, 5),
    };
  }
  if (action === "approve" || action === "deny") {
    const idx = previewState.pending.findIndex((item) => item.request_id === args.request_id);
    if (idx === -1) throw new Error(`No pending request found with id ${args.request_id}.`);
    const entry = previewState.pending.splice(idx, 1)[0];
    const record = {
      ...entry,
      decision: action === "approve" ? "approved" : "denied",
      decided_at: Math.floor(Date.now() / 1000),
    };
    previewState.history.unshift(record);
    return record;
  }
  const entry = {
    request_id: `demo${String(previewState.pending.length + 1).padStart(2, "0")}`,
    to: args.to,
    calldata: args.calldata || "0x",
    value_wei: args.value_wei || "0",
    description: args.description || "Preview approval request",
    risk_level: args.risk_level || "medium",
    submitted_at: Math.floor(Date.now() / 1000),
    status: "pending",
  };
  previewState.pending.push(entry);
  return {
    request_id: entry.request_id,
    status: "pending",
    message: "Preview approval request submitted.",
    submitted_at: entry.submitted_at,
  };
}

function previewStatus() {
  return {
    guardian: {
      policy: {
        max_eth_value_wei: "1000000000000000000",
        whitelisted_tokens: [],
        whitelisted_selectors: [],
        whitelisted_targets: [],
        require_approval_above_wei: "100000000000000000",
        timelock_seconds: 0,
        allow_unknown_selectors: false,
        updated_at: Math.floor(Date.now() / 1000),
      },
      pending_approvals: previewState.pending.length,
      pending_queue: previewState.pending,
    },
    agent_role: {
      enabled: true,
      last_active: previewState.totalCalls ? Math.floor(Date.now() / 1000) : null,
      total_calls: previewState.totalCalls,
      denied_calls: previewState.deniedCalls,
    },
    stats: {
      total_calls: previewState.totalCalls,
      denied_calls: previewState.deniedCalls,
      approval_rate: previewState.totalCalls
        ? (((previewState.totalCalls - previewState.deniedCalls) / previewState.totalCalls) * 100).toFixed(1) + "%"
        : "N/A",
    },
    recent_decisions: previewState.history.slice(0, 10),
  };
}

// ── Status refresh ──────────────────────────────────────────────────────────
async function refreshStatus() {
  try {
    const data = await callTool(TOOL_METHOD_STATUS, { include_history: true });
    renderStatus(data);
    renderHistory(data.recent_decisions || []);
  } catch (e) {
    console.warn("Status refresh failed:", e.message);
  }
}

function renderStatus(data) {
  const stats = data.stats || {};
  const agent = data.agent_role || {};
  const guardian = data.guardian || {};
  const policy = guardian.policy || {};
  const pendingN = guardian.pending_approvals || 0;

  els.statTotal.textContent   = stats.total_calls ?? "0";
  els.statDenied.textContent  = stats.denied_calls ?? "0";
  els.statRate.textContent    = stats.approval_rate ?? "N/A";
  els.statPending.textContent = pendingN;

  // Pending badge
  if (pendingN > 0) {
    els.pendingCount.textContent = pendingN;
    els.pendingCount.hidden = false;
  } else {
    els.pendingCount.hidden = true;
  }

  // Policy tab
  els.polMaxEth.textContent     = policy.max_eth_value_wei || "—";
  els.polThresh.textContent     = policy.require_approval_above_wei || "—";
  els.polTargets.textContent    = policy.whitelisted_targets?.length
    ? policy.whitelisted_targets.join(", ")
    : "None (open)";
  els.polSelectors.textContent  = policy.whitelisted_selectors?.length
    ? policy.whitelisted_selectors.join(", ")
    : "None (open)";
  els.polUnknown.textContent    = policy.allow_unknown_selectors ? "Yes" : "No";
  els.polTimelock.textContent   = `${policy.timelock_seconds ?? 0}s`;
  els.polUpdated.textContent    = policy.updated_at
    ? new Date(policy.updated_at * 1000).toLocaleString()
    : "—";

  els.agentStatus.textContent   = agent.enabled ? "Active" : "Paused";
  els.agentCalls.textContent    = agent.total_calls ?? "0";
  els.agentDenied.textContent   = agent.denied_calls ?? "0";
  els.agentLast.textContent     = agent.last_active
    ? new Date(agent.last_active * 1000).toLocaleString()
    : "Never";

  // Render pending queue
  renderPending(guardian.pending_queue || []);
}

// ── Check policy ────────────────────────────────────────────────────────────
async function handleCheckPolicy() {
  if (isCalling) return;
  const to       = els.checkTo.value.trim();
  const valueWei = els.checkValue.value.trim() || "0";
  const calldata = els.checkCalldata.value.trim() || "0x";
  if (!to) { toast("Enter a target address", "error"); return; }

  setLoading(true);
  els.checkResult.hidden = true;

  try {
    const data = await callTool(TOOL_METHOD_CHECK, { to, value_wei: valueWei, calldata });
    renderCheckResult(data);
    // Tell Anna about the result
    if (anna) {
      await anna.chat.write_message({
        role: "system",
        content: `ETH Guardian policy check: ${data.verdict} for ${to}. ${
          data.denials?.length ? "Reason: " + data.denials[0] : "Transaction allowed."
        }`,
      });
    }
    await refreshStatus();
  } catch (e) {
    showError(els.checkResult, e.message);
  } finally {
    setLoading(false);
  }
}

function renderCheckResult(data) {
  const box = els.checkResult;
  box.className = `result-box ${data.verdict === "ALLOW" ? "is-allow" : "is-deny"}`;
  box.hidden = false;

  const riskClass = data.verdict === "ALLOW" ? "verdict-allow" : "verdict-deny";
  const selInfo = data.selector || {};

  let html = `<div class="result-verdict ${riskClass}">${data.verdict === "ALLOW" ? "✓ ALLOW" : "✗ DENY"}</div>`;
  html += `<div>Function: <span class="risk-${selInfo.risk || "low"}">${selInfo.name || "plain ETH transfer"}</span>`;
  if (selInfo.protocol) html += ` <span style="color:var(--text-muted)">(${selInfo.protocol})</span>`;
  html += `</div>`;

  if (data.denials?.length) {
    html += `\n<div style="color:var(--accent-red);margin-top:6px">Denials:</div>`;
    data.denials.forEach(d => { html += `<div>• ${d}</div>`; });
  }
  if (data.warnings?.length) {
    html += `\n<div style="color:var(--accent-amber);margin-top:6px">Warnings:</div>`;
    data.warnings.forEach(w => { html += `<div>• ${w}</div>`; });
  }
  box.innerHTML = html;
}

// ── Explain risk ─────────────────────────────────────────────────────────────
async function handleExplainRisk() {
  if (isCalling) return;
  const to       = els.explainTo.value.trim();
  const calldata = els.explainCalldata.value.trim() || "0x";
  const chainId  = parseInt(els.explainChain.value, 10);
  if (!to) { toast("Enter a target address", "error"); return; }

  setLoading(true);
  els.explainResult.hidden = true;

  try {
    const data = await callTool(TOOL_METHOD_EXPLAIN, {
      to, calldata, value_wei: "0", chain_id: chainId,
    });
    renderExplainResult(data);
  } catch (e) {
    showError(els.explainResult, e.message);
  } finally {
    setLoading(false);
  }
}

function renderExplainResult(data) {
  const box = els.explainResult;
  const risk = data.risk_level || "low";
  box.className = `result-box is-${risk === "low" ? "allow" : risk === "critical" ? "deny" : "warn"}`;
  box.hidden = false;

  let html = `<div class="result-verdict risk-${risk}">${risk.toUpperCase()} RISK</div>`;
  html += `<div style="margin-bottom:8px">${escapeHtml(data.summary || "")}</div>`;
  html += `<div>Chain: <span style="color:var(--accent-cyan)">${escapeHtml(data.chain || "")}</span></div>`;
  html += `<div>Function: <span style="color:var(--text-code)">${escapeHtml(data.function || "N/A")}</span></div>`;
  html += `<div>Protocol: ${escapeHtml(data.protocol || "Unknown")}</div>`;
  if (parseFloat(data.value_eth) > 0) {
    html += `<div>Value: <span class="risk-medium">${data.value_eth} ETH</span></div>`;
  }

  if (data.risk_flags?.length) {
    html += `\n<div style="color:var(--accent-amber);margin-top:6px">Flags:</div>`;
    data.risk_flags.forEach(f => {
      html += `<div>${escapeHtml(f)}</div>`;
    });
  }
  box.innerHTML = html;
}

// ── Request approval ─────────────────────────────────────────────────────────
async function handleSubmitApproval() {
  if (isCalling) return;
  const to   = els.reqTo.value.trim();
  const desc = els.reqDesc.value.trim();
  if (!to || !desc) { toast("Address and description required", "error"); return; }

  setLoading(true);
  try {
    const data = await callTool(TOOL_METHOD_APPROVE, {
      action:       "submit",
      to,
      calldata:     els.reqCalldata.value.trim() || "0x",
      description:  desc,
      risk_level:   els.reqRisk.value,
    });
    const box = els.approvalResult;
    box.className = "result-box is-warn";
    box.hidden = false;
    box.innerHTML = `<div class="result-verdict risk-medium">PENDING — ${data.request_id}</div><div>${escapeHtml(data.message || "")}</div>`;
    toast(`Submitted: ${data.request_id}`, "success");
    await refreshPending();
    await refreshStatus();
    if (anna) {
      await anna.chat.write_message({
        role: "system",
        content: `ETH Guardian: Approval request submitted (ID: ${data.request_id}). Risk: ${els.reqRisk.value.toUpperCase()}. Description: ${desc}`,
      });
    }
  } catch (e) {
    showError(els.approvalResult, e.message);
  } finally {
    setLoading(false);
  }
}

async function handleDecision(requestId, action) {
  setLoading(true);
  try {
    await callTool(TOOL_METHOD_APPROVE, { action, request_id: requestId });
    toast(`${action === "approve" ? "Approved" : "Denied"}: ${requestId}`, action === "approve" ? "success" : "error");
    if (anna) {
      await anna.chat.write_message({
        role: "system",
        content: `ETH Guardian: Request ${requestId} was ${action}d.`,
      });
    }
    await refreshPending();
    await refreshStatus();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    setLoading(false);
  }
}

async function refreshPending() {
  try {
    const data = await callTool(TOOL_METHOD_APPROVE, { action: "list" });
    renderPending(data.pending || []);
  } catch (e) {
    console.warn("Pending refresh failed:", e.message);
  }
}

function renderPending(pending) {
  const list = els.approvalList;
  if (!pending.length) {
    list.innerHTML = '<li class="empty-state">No pending approvals — the guardian is idle.</li>';
    return;
  }
  list.innerHTML = pending.map(p => `
    <li class="approval-item risk-${p.risk_level}-item">
      <div class="approval-meta">
        <span class="approval-id">#${p.request_id}</span>
        <span class="risk-chip risk-chip-${p.risk_level}">${p.risk_level}</span>
        <span class="approval-time">${relTime(p.submitted_at)}</span>
      </div>
      <div class="approval-desc">${escapeHtml(p.description)}</div>
      <div class="approval-target">${escapeHtml(p.to)}</div>
      <div class="approval-actions">
        <button class="btn btn-approve" data-id="${p.request_id}" data-action="approve">Approve</button>
        <button class="btn btn-deny"    data-id="${p.request_id}" data-action="deny">Deny</button>
      </div>
    </li>
  `).join("");

  list.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () =>
      handleDecision(btn.dataset.id, btn.dataset.action)
    );
  });
}

function renderHistory(history) {
  const list = els.historyList;
  if (!history.length) {
    list.innerHTML = '<li class="empty-state">No decisions recorded yet.</li>';
    return;
  }
  list.innerHTML = history.map(h => `
    <li class="history-item decision-${h.decision}">
      <div class="history-decision">${h.decision === "approved" ? "✓ Approved" : "✗ Denied"}</div>
      <div class="history-desc">${escapeHtml(h.description || h.to)}</div>
      <div class="history-time">${relTime(h.decided_at)}</div>
    </li>
  `).join("");
}

// ── UI wiring ────────────────────────────────────────────────────────────────
function bindUI() {
  els.btnCheck.addEventListener("click", handleCheckPolicy);
  els.btnExplain.addEventListener("click", handleExplainRisk);
  els.btnSubmitApproval.addEventListener("click", handleSubmitApproval);
  els.btnRefreshPending.addEventListener("click", refreshPending);
  els.btnRefreshPolicy.addEventListener("click", refreshStatus);
  els.btnRefreshHistory.addEventListener("click", refreshStatus);

  tabs.forEach(tab => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });
}

function switchView(viewName, save = true) {
  tabs.forEach(t => {
    const active = t.dataset.view === viewName;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", active);
  });
  views.forEach(v => {
    const active = v.id === `view-${viewName}`;
    v.classList.toggle("is-active", active);
    v.hidden = !active;
  });
  if (save) safeStorageSet(STORAGE_KEY_VIEW, viewName);
  if (viewName === "pending") refreshPending();
}

// ── Storage helpers ──────────────────────────────────────────────────────────
async function safeStorageGet(key) {
  try { return (await anna?.storage.get({ key }))?.value || null; }
  catch { return null; }
}
async function safeStorageSet(key, value) {
  try { await anna?.storage.set({ key, value }); } catch { /* ignore */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function setLoading(on) {
  isCalling = on;
  [els.btnCheck, els.btnExplain, els.btnSubmitApproval].forEach(b => {
    if (b) b.disabled = on;
  });
}

function showError(box, msg) {
  box.className = "result-box is-deny";
  box.hidden = false;
  box.innerHTML = `<div class="result-verdict verdict-deny">✗ ERROR</div><div>${escapeHtml(msg)}</div>`;
}

function toast(msg, type = "success") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  els.toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));
  setTimeout(() => {
    el.classList.remove("is-visible");
    el.addEventListener("transitionend", () => el.remove());
  }, 3000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function relTime(ts) {
  if (!ts) return "—";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return new Date(ts * 1000).toLocaleString();
}

function renderStandaloneMock() {
  els.statTotal.textContent   = "—";
  els.statDenied.textContent  = "—";
  els.statRate.textContent    = "—";
  els.statPending.textContent = "—";
  const notices = document.querySelectorAll(".result-box");
  // Show a subtle standalone notice in the first panel result
  if (els.checkResult) {
    els.checkResult.className = "result-box";
    els.checkResult.hidden = false;
    els.checkResult.innerHTML =
      '<div style="color:var(--text-muted)">Standalone preview — connect to Anna to run live checks.</div>';
  }
}

init();
