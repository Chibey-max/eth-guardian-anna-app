/**
 * ETH Guardian — Anna App bundle controller
 *
 * Connects to Anna via the runtime SDK when available.
 * Falls back to a local simulation engine for standalone preview &
 * offline demos, so every action produces a real verdict either way.
 */

// Anna SDK is imported dynamically inside init() so a 404 on localhost
// (standalone preview) is catchable and falls back to the sim engine,
// instead of aborting the whole module before any handlers bind.
let AnnaAppRuntime = null;

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
const STORAGE_KEY_THEME   = "eth-guardian:theme";

// ── DOM refs ────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const tabs  = document.querySelectorAll(".tab");
const views = document.querySelectorAll(".view");

const els = {
  connDot: $("conn-dot"), connLabel: $("conn-label"), chainBadge: $("chain-badge"),
  pendingCount: $("pending-count"), themeToggle: $("theme-toggle"),
  statTotal: $("stat-total"), statDenied: $("stat-denied"), statRate: $("stat-rate"), statPending: $("stat-pending-val"),
  checkTo: $("check-to"), checkValue: $("check-value"), checkCalldata: $("check-calldata"),
  btnCheck: $("btn-check"), checkResult: $("check-result"),
  btnFillAllow: $("btn-fill-allow"), btnFillDeny: $("btn-fill-deny"),
  explainTo: $("explain-to"), explainCalldata: $("explain-calldata"), explainChain: $("explain-chain"),
  btnExplain: $("btn-explain"), explainResult: $("explain-result"),
  approvalList: $("approval-list"), btnRefreshPending: $("btn-refresh-pending"),
  reqTo: $("req-to"), reqDesc: $("req-desc"), reqCalldata: $("req-calldata"), reqRisk: $("req-risk"),
  btnSubmitApproval: $("btn-submit-approval"), approvalResult: $("approval-result"),
  btnRefreshPolicy: $("btn-refresh-policy"),
  polMaxEth: $("pol-max-eth"), polThresh: $("pol-thresh"), polTargets: $("pol-targets"),
  polSelectors: $("pol-selectors"), polUnknown: $("pol-unknown"), polTimelock: $("pol-timelock"), polUpdated: $("pol-updated"),
  agentStatus: $("agent-status"), agentCalls: $("agent-calls"), agentDenied: $("agent-denied"), agentLast: $("agent-last"),
  historyList: $("history-list"), btnRefreshHistory: $("btn-refresh-history"),
  toastContainer: $("toast-container"),
};

let anna = null;
let isCalling = false;
let demoMode = false;

// ── Local simulation engine (offline / preview / demo) ───────────────────────
const SIM = {
  policy: {
    max_eth_value_wei: "5000000000000000000",      // 5 ETH
    require_approval_above_wei: "1000000000000000000", // 1 ETH
    whitelisted_targets: ["0xbD00277dFec1265d2aA10e003A331839c4aE14C8"],
    whitelisted_selectors: ["0xa9059cbb", "0x"],   // transfer, plain
    allow_unknown_selectors: false,
    timelock_seconds: 3600,
    updated_at: Math.floor(Date.now() / 1000) - 7200,
  },
  selectors: {
    "0x":         { name: "plain ETH transfer", risk: "low",      protocol: null },
    "0xa9059cbb": { name: "transfer(address,uint256)", risk: "low", protocol: "ERC-20" },
    "0x095ea7b3": { name: "approve(address,uint256)",  risk: "high", protocol: "ERC-20" },
    "0x23b872dd": { name: "transferFrom(address,address,uint256)", risk: "medium", protocol: "ERC-20" },
  },
  chains: { 1: "Ethereum Mainnet", 11155111: "Sepolia", 17000: "Holesky", 8453: "Base", 42161: "Arbitrum One", 5000: "Mantle" },
  stats: { total: 0, denied: 0 },
  pending: [],
  history: [],
  reqSeq: 1,
};

function simSelector(calldata) {
  const sel = (calldata || "0x").slice(0, 10).toLowerCase();
  if (sel === "0x" || sel === "") return SIM.selectors["0x"];
  return SIM.selectors[sel] || { name: `unknown selector ${sel}`, risk: "high", protocol: "Unknown" };
}
function isUnlimitedApproval(calldata) {
  return (calldata || "").toLowerCase().includes("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
}
function simCheck({ to, value_wei, calldata }) {
  const sel = simSelector(calldata);
  const denials = [], warnings = [];
  const val = BigInt(value_wei || "0");
  const wl = SIM.policy.whitelisted_targets.map(a => a.toLowerCase());
  const selHex = (calldata || "0x").slice(0, 10).toLowerCase();

  if (val > BigInt(SIM.policy.max_eth_value_wei))
    denials.push(`Value ${val} wei exceeds policy max ${SIM.policy.max_eth_value_wei} wei`);
  if (!SIM.policy.allow_unknown_selectors && !SIM.policy.whitelisted_selectors.includes(selHex) && selHex !== "0x")
    denials.push(`Selector ${selHex} is not whitelisted`);
  if (wl.length && !wl.includes((to || "").toLowerCase()) && val > 0n)
    warnings.push(`Target ${to} is not on the whitelist`);
  if (isUnlimitedApproval(calldata))
    denials.push("Unlimited token approval detected — high drain risk");
  if (val > BigInt(SIM.policy.require_approval_above_wei) && !denials.length)
    warnings.push("Value above approval threshold — human sign-off recommended");

  const verdict = denials.length ? "DENY" : "ALLOW";
  SIM.stats.total++; if (verdict === "DENY") SIM.stats.denied++;
  SIM.history.unshift({ decision: verdict === "ALLOW" ? "approved" : "denied", description: `${sel.name} → ${to}`, to, decided_at: Math.floor(Date.now()/1000) });
  SIM.history = SIM.history.slice(0, 12);
  return { verdict, selector: sel, denials, warnings };
}
function simExplain({ to, calldata, chain_id }) {
  const sel = simSelector(calldata);
  const unlimited = isUnlimitedApproval(calldata);
  let risk = sel.risk;
  const flags = [];
  if (unlimited) { risk = "critical"; flags.push("⚠ Unlimited approval — spender can move your entire balance later"); }
  if (sel.protocol === "Unknown") flags.push("⚠ Unrecognized function selector — intent cannot be verified");
  if (sel.name.startsWith("approve")) flags.push("Grants a third party permission to spend your tokens");
  const summaries = {
    low: `This is a ${sel.name} on ${SIM.chains[chain_id] || "the selected chain"}. No elevated risk patterns detected.`,
    medium: `This ${sel.name} moves tokens on your behalf. Verify the recipient before approving.`,
    high: `This ${sel.name} grants spending permission. Confirm the spender is a contract you trust.`,
    critical: `This transaction sets an UNLIMITED token approval. If the spender is malicious or compromised, your full balance is at risk. Strongly recommend denying or capping the amount.`,
  };
  return { risk_level: risk, summary: summaries[risk], chain: SIM.chains[chain_id] || String(chain_id),
    function: sel.name, protocol: sel.protocol || "Unknown", value_eth: "0", risk_flags: flags };
}
function simStatus() {
  const rate = SIM.stats.total ? Math.round(((SIM.stats.total - SIM.stats.denied) / SIM.stats.total) * 100) : 0;
  return {
    stats: { total_calls: SIM.stats.total, denied_calls: SIM.stats.denied, approval_rate: `${rate}%` },
    agent_role: { enabled: true, total_calls: SIM.stats.total, denied_calls: SIM.stats.denied, last_active: Math.floor(Date.now()/1000) },
    guardian: { policy: SIM.policy, pending_approvals: SIM.pending.length, pending_queue: SIM.pending },
    recent_decisions: SIM.history,
  };
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  applyStoredTheme();
  bindUI();
  try {
    const mod = await import("/static/anna-apps/_sdk/latest/index.js");
    AnnaAppRuntime = mod.AnnaAppRuntime;
    anna = await AnnaAppRuntime.connect();
    setConnMode("live");
    const savedView = await safeStorageGet(STORAGE_KEY_VIEW);
    if (savedView) switchView(savedView, false);
    await refreshStatus();
  } catch (e) {
    demoMode = true;
    setConnMode("demo");
    renderStatus(simStatus());     // real zeros, not dashes
  }
}

function setConnMode(mode) {
  els.connDot.classList.remove("is-connected", "is-demo");
  if (mode === "live") { els.connDot.classList.add("is-connected"); els.connLabel.textContent = "LIVE"; els.chainBadge.textContent = "ETH"; els.connDot.title = "Connected to Anna"; }
  else if (mode === "demo") { els.connDot.classList.add("is-demo"); els.connLabel.textContent = "DEMO"; els.chainBadge.textContent = "SIM"; els.connDot.title = "Local simulation mode"; }
  else { els.connLabel.textContent = "OFFLINE"; els.chainBadge.textContent = "—"; }
}

// ── Theme ────────────────────────────────────────────────────────────────────
function applyStoredTheme() {
  let theme = "dark";
  try { theme = localStorage.getItem(STORAGE_KEY_THEME) || "dark"; } catch {}
  document.documentElement.setAttribute("data-theme", theme);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem(STORAGE_KEY_THEME, next); } catch {}
  safeStorageSet(STORAGE_KEY_THEME, next);
  toast(`${next === "dark" ? "Dark" : "Light"} mode`, "success");
}

// ── Tool invocation (live OR sim) ────────────────────────────────────────────
async function callTool(method, args) {
  if (demoMode || !anna) {
    await delay(420 + Math.random() * 280); // feels real
    if (method === TOOL_METHOD_CHECK)   return simCheck(args);
    if (method === TOOL_METHOD_EXPLAIN) return simExplain(args);
    if (method === TOOL_METHOD_STATUS)  return simStatus();
    if (method === TOOL_METHOD_APPROVE) return simApprove(args);
    throw new Error("Unknown method");
  }
  const result = await anna.tools.invoke({ tool_id: TOOL_ID, method, args });
  if (!result.success) throw new Error(result.error || "Tool call failed");
  return result.data;
}
function simApprove(args) {
  if (args.action === "list") return { pending: SIM.pending };
  if (args.action === "submit") {
    const id = `REQ-${String(SIM.reqSeq++).padStart(3, "0")}`;
    SIM.pending.unshift({ request_id: id, risk_level: args.risk_level, description: args.description, to: args.to, submitted_at: Math.floor(Date.now()/1000) });
    return { request_id: id, message: "Routed to human review queue." };
  }
  if (args.action === "approve" || args.action === "deny") {
    const idx = SIM.pending.findIndex(p => p.request_id === args.request_id);
    if (idx >= 0) {
      const [item] = SIM.pending.splice(idx, 1);
      SIM.history.unshift({ decision: args.action === "approve" ? "approved" : "denied", description: item.description, to: item.to, decided_at: Math.floor(Date.now()/1000) });
    }
    return { ok: true };
  }
  return { ok: true };
}

// ── Status ───────────────────────────────────────────────────────────────────
async function refreshStatus() {
  try { const data = await callTool(TOOL_METHOD_STATUS, { include_history: true }); renderStatus(data); renderHistory(data.recent_decisions || []); }
  catch (e) { console.warn("Status refresh failed:", e.message); }
}
function renderStatus(data) {
  const stats = data.stats || {}, agent = data.agent_role || {}, guardian = data.guardian || {};
  const policy = guardian.policy || {}, pendingN = guardian.pending_approvals || 0;

  countUp(els.statTotal, stats.total_calls ?? 0);
  countUp(els.statDenied, stats.denied_calls ?? 0);
  els.statRate.textContent = stats.approval_rate ?? "0%";
  countUp(els.statPending, pendingN);

  if (pendingN > 0) { els.pendingCount.textContent = pendingN; els.pendingCount.hidden = false; }
  else els.pendingCount.hidden = true;

  els.polMaxEth.textContent = policy.max_eth_value_wei || "—";
  els.polThresh.textContent = policy.require_approval_above_wei || "—";
  els.polTargets.textContent = policy.whitelisted_targets?.length ? policy.whitelisted_targets.join(", ") : "None (open)";
  els.polSelectors.textContent = policy.whitelisted_selectors?.length ? policy.whitelisted_selectors.join(", ") : "None (open)";
  els.polUnknown.textContent = policy.allow_unknown_selectors ? "Yes" : "No";
  els.polTimelock.textContent = `${policy.timelock_seconds ?? 0}s`;
  els.polUpdated.textContent = policy.updated_at ? new Date(policy.updated_at * 1000).toLocaleString() : "—";
  els.agentStatus.textContent = agent.enabled ? "Active" : "Paused";
  els.agentCalls.textContent = agent.total_calls ?? "0";
  els.agentDenied.textContent = agent.denied_calls ?? "0";
  els.agentLast.textContent = agent.last_active ? new Date(agent.last_active * 1000).toLocaleString() : "Never";
  renderPending(guardian.pending_queue || []);
}

// ── Check policy ─────────────────────────────────────────────────────────────
async function handleCheckPolicy() {
  if (isCalling) return;
  const to = els.checkTo.value.trim(), valueWei = els.checkValue.value.trim() || "0", calldata = els.checkCalldata.value.trim() || "0x";
  if (!to) { toast("Enter a target address", "error"); return; }
  setLoading(true, els.btnCheck); els.checkResult.hidden = true;
  try {
    const data = await callTool(TOOL_METHOD_CHECK, { to, value_wei: valueWei, calldata });
    renderCheckResult(data);
    if (anna && !demoMode) await anna.chat.write_message({ role: "system", content: `ETH Guardian policy check: ${data.verdict} for ${to}. ${data.denials?.length ? "Reason: " + data.denials[0] : "Transaction allowed."}` });
    await refreshStatus();
  } catch (e) { showError(els.checkResult, e.message); }
  finally { setLoading(false, els.btnCheck); }
}
function renderCheckResult(data) {
  const box = els.checkResult;
  box.className = `result-box ${data.verdict === "ALLOW" ? "is-allow" : "is-deny"}`;
  box.hidden = false;
  const riskClass = data.verdict === "ALLOW" ? "verdict-allow" : "verdict-deny";
  const selInfo = data.selector || {};
  let html = `<div class="result-verdict ${riskClass}">${data.verdict === "ALLOW" ? "✓ ALLOW" : "✗ DENY"}</div>`;
  html += `<div>Function: <span class="risk-${selInfo.risk || "low"}">${escapeHtml(selInfo.name || "plain ETH transfer")}</span>`;
  if (selInfo.protocol) html += ` <span style="color:var(--text-muted)">(${escapeHtml(selInfo.protocol)})</span>`;
  html += `</div>`;
  if (data.denials?.length) { html += `\n<div style="color:var(--accent-red);margin-top:8px">Denials:</div>`; data.denials.forEach(d => html += `<div>• ${escapeHtml(d)}</div>`); }
  if (data.warnings?.length) { html += `\n<div style="color:var(--accent-amber);margin-top:8px">Warnings:</div>`; data.warnings.forEach(w => html += `<div>• ${escapeHtml(w)}</div>`); }
  box.innerHTML = html;
  triggerScanReveal(box);
}

// ── Explain risk ─────────────────────────────────────────────────────────────
async function handleExplainRisk() {
  if (isCalling) return;
  const to = els.explainTo.value.trim(), calldata = els.explainCalldata.value.trim() || "0x", chainId = parseInt(els.explainChain.value, 10);
  if (!to) { toast("Enter a target address", "error"); return; }
  setLoading(true, els.btnExplain); els.explainResult.hidden = true;
  try { const data = await callTool(TOOL_METHOD_EXPLAIN, { to, calldata, value_wei: "0", chain_id: chainId }); renderExplainResult(data); }
  catch (e) { showError(els.explainResult, e.message); }
  finally { setLoading(false, els.btnExplain); }
}
function renderExplainResult(data) {
  const box = els.explainResult, risk = data.risk_level || "low";
  box.className = `result-box is-${risk === "low" ? "allow" : risk === "critical" ? "deny" : "warn"}`;
  box.hidden = false;
  let html = `<div class="result-verdict risk-${risk}">${risk.toUpperCase()} RISK</div>`;
  html += `<div style="margin-bottom:10px;color:var(--text-primary)">${escapeHtml(data.summary || "")}</div>`;
  html += `<div>Chain: <span style="color:var(--accent-cyan)">${escapeHtml(data.chain || "")}</span></div>`;
  html += `<div>Function: <span style="color:var(--text-code)">${escapeHtml(data.function || "N/A")}</span></div>`;
  html += `<div>Protocol: ${escapeHtml(data.protocol || "Unknown")}</div>`;
  if (data.risk_flags?.length) { html += `\n<div style="color:var(--accent-amber);margin-top:8px">Flags:</div>`; data.risk_flags.forEach(f => html += `<div>${escapeHtml(f)}</div>`); }
  box.innerHTML = html;
  triggerScanReveal(box);
}

// ── Approval ─────────────────────────────────────────────────────────────────
async function handleSubmitApproval() {
  if (isCalling) return;
  const to = els.reqTo.value.trim(), desc = els.reqDesc.value.trim();
  if (!to || !desc) { toast("Address and description required", "error"); return; }
  setLoading(true, els.btnSubmitApproval);
  try {
    const data = await callTool(TOOL_METHOD_APPROVE, { action: "submit", to, calldata: els.reqCalldata.value.trim() || "0x", description: desc, risk_level: els.reqRisk.value });
    const box = els.approvalResult;
    box.className = "result-box is-warn"; box.hidden = false;
    box.innerHTML = `<div class="result-verdict risk-medium">PENDING — ${escapeHtml(data.request_id)}</div><div>${escapeHtml(data.message || "")}</div>`;
    triggerScanReveal(box);
    toast(`Submitted: ${data.request_id}`, "success");
    await refreshPending(); await refreshStatus();
    if (anna && !demoMode) await anna.chat.write_message({ role: "system", content: `ETH Guardian: Approval request submitted (ID: ${data.request_id}). Risk: ${els.reqRisk.value.toUpperCase()}. Description: ${desc}` });
  } catch (e) { showError(els.approvalResult, e.message); }
  finally { setLoading(false, els.btnSubmitApproval); }
}
async function handleDecision(requestId, action) {
  setLoading(true);
  try {
    await callTool(TOOL_METHOD_APPROVE, { action, request_id: requestId });
    toast(`${action === "approve" ? "Approved" : "Denied"}: ${requestId}`, action === "approve" ? "success" : "error");
    if (anna && !demoMode) await anna.chat.write_message({ role: "system", content: `ETH Guardian: Request ${requestId} was ${action}d.` });
    await refreshPending(); await refreshStatus();
  } catch (e) { toast(e.message, "error"); }
  finally { setLoading(false); }
}
async function refreshPending() {
  try { const data = await callTool(TOOL_METHOD_APPROVE, { action: "list" }); renderPending(data.pending || []); }
  catch (e) { console.warn("Pending refresh failed:", e.message); }
}
function renderPending(pending) {
  const list = els.approvalList;
  if (!pending.length) { list.innerHTML = '<li class="empty-state">Queue is clear. Submit a transaction below to route it for human review.</li>'; return; }
  list.innerHTML = pending.map(p => `
    <li class="approval-item risk-${p.risk_level}-item">
      <div class="approval-meta">
        <span class="approval-id">#${escapeHtml(p.request_id)}</span>
        <span class="risk-chip risk-chip-${p.risk_level}">${escapeHtml(p.risk_level)}</span>
        <span class="approval-time">${relTime(p.submitted_at)}</span>
      </div>
      <div class="approval-desc">${escapeHtml(p.description)}</div>
      <div class="approval-target">${escapeHtml(p.to)}</div>
      <div class="approval-actions">
        <button class="btn btn-approve" data-id="${escapeHtml(p.request_id)}" data-action="approve">Approve</button>
        <button class="btn btn-deny" data-id="${escapeHtml(p.request_id)}" data-action="deny">Deny</button>
      </div>
    </li>`).join("");
  list.querySelectorAll("[data-action]").forEach(btn => btn.addEventListener("click", () => handleDecision(btn.dataset.id, btn.dataset.action)));
}
function renderHistory(history) {
  const list = els.historyList;
  if (!history.length) { list.innerHTML = '<li class="empty-state">No decisions yet. Checks and approvals will appear here as they happen.</li>'; return; }
  list.innerHTML = history.map(h => `
    <li class="history-item decision-${h.decision}">
      <div class="history-decision">${h.decision === "approved" ? "✓ Approved" : "✗ Denied"}</div>
      <div class="history-desc">${escapeHtml(h.description || h.to)}</div>
      <div class="history-time">${relTime(h.decided_at)}</div>
    </li>`).join("");
}

// ── Quick-fill demo helpers ──────────────────────────────────────────────────
function fillAllow() {
  els.checkTo.value = "0xbD00277dFec1265d2aA10e003A331839c4aE14C8";
  els.checkValue.value = "10000000000000000"; // 0.01 ETH
  els.checkCalldata.value = "0x";
  toast("Safe example loaded", "success");
}
function fillDeny() {
  els.checkTo.value = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";
  els.checkValue.value = "0";
  els.checkCalldata.value = "0x095ea7b30000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f984ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  // mirror into explain panel so the next demo beat is ready
  els.explainTo.value = els.checkTo.value;
  els.explainCalldata.value = els.checkCalldata.value;
  toast("Risky example loaded", "error");
}

// ── UI wiring ────────────────────────────────────────────────────────────────
function bindUI() {
  els.btnCheck.addEventListener("click", handleCheckPolicy);
  els.btnExplain.addEventListener("click", handleExplainRisk);
  els.btnSubmitApproval.addEventListener("click", handleSubmitApproval);
  els.btnRefreshPending.addEventListener("click", refreshPending);
  els.btnRefreshPolicy.addEventListener("click", refreshStatus);
  els.btnRefreshHistory.addEventListener("click", refreshStatus);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.btnFillAllow.addEventListener("click", fillAllow);
  els.btnFillDeny.addEventListener("click", fillDeny);
  tabs.forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  // Cmd/Ctrl+Enter runs the check
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleCheckPolicy(); }
  });
}
function switchView(viewName, save = true) {
  tabs.forEach(t => { const active = t.dataset.view === viewName; t.classList.toggle("is-active", active); t.setAttribute("aria-selected", active); });
  views.forEach(v => { const active = v.id === `view-${viewName}`; v.classList.toggle("is-active", active); v.hidden = !active; });
  if (save) safeStorageSet(STORAGE_KEY_VIEW, viewName);
  if (viewName === "pending") refreshPending();
  if (viewName === "history") refreshStatus();
}

// ── Storage helpers ──────────────────────────────────────────────────────────
async function safeStorageGet(key) { try { return (await anna?.storage.get({ key }))?.value || null; } catch { return null; } }
async function safeStorageSet(key, value) { try { await anna?.storage.set({ key, value }); } catch {} }

// ── Helpers ──────────────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function setLoading(on, btn) {
  isCalling = on;
  [els.btnCheck, els.btnExplain, els.btnSubmitApproval].forEach(b => { if (b) b.disabled = on; });
  if (btn) btn.classList.toggle("is-loading", on);
}
function triggerScanReveal(box) { box.classList.remove("scan-reveal"); void box.offsetWidth; box.classList.add("scan-reveal"); }
function countUp(el, target) {
  const from = parseInt(el.textContent.replace(/\D/g, ""), 10) || 0;
  target = Number(target) || 0;
  if (from === target) { el.textContent = target; return; }
  const steps = 16, diff = target - from; let i = 0;
  const tick = () => { i++; el.textContent = Math.round(from + (diff * i) / steps); if (i < steps) requestAnimationFrame(tick); else el.textContent = target; };
  requestAnimationFrame(tick);
}
function showError(box, msg) {
  box.className = "result-box is-deny"; box.hidden = false;
  box.innerHTML = `<div class="result-verdict verdict-deny">✗ ERROR</div><div>${escapeHtml(msg)}</div>`;
  triggerScanReveal(box);
}
function toast(msg, type = "success") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`; el.textContent = msg;
  els.toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));
  setTimeout(() => { el.classList.remove("is-visible"); el.addEventListener("transitionend", () => el.remove()); }, 3000);
}
function escapeHtml(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function relTime(ts) { if (!ts) return "—"; const diff = Math.floor(Date.now()/1000) - ts; if (diff < 60) return `${diff}s ago`; if (diff < 3600) return `${Math.floor(diff/60)}m ago`; return new Date(ts*1000).toLocaleString(); }

init();
