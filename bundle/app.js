/**
 * ETH Guardian — Enhanced Anna App controller
 * Anna SDK + preview mode + one-click demo transactions
 */

// ── Tool ID ─────────────────────────────────────────────────────────────────
const TOOL_ID =
  (typeof window !== "undefined" &&
    window.__ANNA_TOOL_IDS__ &&
    window.__ANNA_TOOL_IDS__["eth-guardian"]) ||
  "tool-ilorahdavid126-eth-guardian-pxf3jej7";

const STORAGE_KEY = "eth-guardian:last-view";

// ── Demo transactions ────────────────────────────────────────────────────────
const DEMO_TXS = [
  {
    id: "usdc-transfer",
    name: "USDC Transfer",
    protocol: "ERC-20",
    desc: "Send 1,000 USDC to another wallet. Standard low-risk token transfer.",
    calldata: "0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045000000000000000000000000000000000000000000000000000000003b9aca00",
    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    value: "0",
    chain: 1,
    risk: "low",
    accent: "#00ff88",
    action: "check",
  },
  {
    id: "unlimited-approval",
    name: "Unlimited Approval",
    protocol: "ERC-20",
    desc: "Grant a contract unlimited permission to spend all your tokens forever.",
    calldata: "0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    value: "0",
    chain: 1,
    risk: "critical",
    accent: "#ff3355",
    action: "check",
  },
  {
    id: "proxy-upgrade",
    name: "Proxy Upgrade",
    protocol: "Proxy",
    desc: "Replace the contract's logic implementation — changes all behavior permanently.",
    calldata: "0x3659cfe6000000000000000000000000deadbeef1234567890abcdef1234567890abcdef12",
    to: "0x1234567890abcdef1234567890abcdef12345678",
    value: "0",
    chain: 1,
    risk: "critical",
    accent: "#ff3355",
    action: "check",
  },
  {
    id: "uniswap-swap",
    name: "ETH → USDC Swap",
    protocol: "Uniswap V2",
    desc: "Swap 0.5 ETH for USDC. Value transfer triggers approval threshold.",
    calldata: "0x7ff36ab5000000000000000000000000000000000000000000000000000000003b9aca0000000000000000000000000000000000000000000000000000000000000080000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045",
    to: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    value: "500000000000000000",
    chain: 1,
    risk: "medium",
    accent: "#ffaa00",
    action: "check",
  },
  {
    id: "transfer-ownership",
    name: "Transfer Ownership",
    protocol: "Ownable",
    desc: "Hand over contract ownership to a new address — irreversible admin action.",
    calldata: "0xf2fde38b000000000000000000000000deadbeef1234567890abcdef1234567890abcdef12",
    to: "0xabcdef1234567890abcdef1234567890abcdef12",
    value: "0",
    chain: 1,
    risk: "critical",
    accent: "#ff3355",
    action: "explain",
  },
  {
    id: "aave-deposit",
    name: "Aave Deposit",
    protocol: "Aave V2",
    desc: "Deposit USDC into Aave lending pool to earn yield.",
    calldata: "0xe8eda9df000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000003b9aca00000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000000000000",
    to: "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9",
    value: "0",
    chain: 1,
    risk: "medium",
    accent: "#ffaa00",
    action: "explain",
  },
];

// ── DOM helpers ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const tabs = document.querySelectorAll(".tab");
const views = document.querySelectorAll(".view");

let anna = null;
let isCalling = false;

// ── Anna connection ──────────────────────────────────────────────────────────
async function init() {
  renderDemoCards();
  bindUI();

  try {
    const { AnnaAppRuntime } = await import("/static/anna-apps/_sdk/latest/index.js");
    anna = await AnnaAppRuntime.connect();
    setConnected(true);
    const saved = await safeGet(STORAGE_KEY);
    if (saved) switchView(saved, false);
    await refreshStatus();
  } catch {
    setConnected(false);
    renderStandalone();
  }
}

function setConnected(ok) {
  const dot   = $("conn-dot");
  const label = $("conn-label");
  if (dot)   dot.classList.toggle("is-connected", ok);
  if (label) label.textContent = ok ? "Connected" : "Preview";
  if (ok) {
    const badge = $("chain-badge");
    if (badge) badge.textContent = "Mainnet";
  }
}

// ── Tool call ────────────────────────────────────────────────────────────────
async function callTool(method, args) {
  if (!anna) {
    // Preview mode — call the local plugin via fetch-simulated mock
    return previewCall(method, args);
  }
  const r = await anna.tools.invoke({ tool_id: TOOL_ID, method, args });
  if (!r.success) throw new Error(r.error || "Tool call failed");
  return r.data;
}

// ── Preview mode mock (calls are described, not executed) ────────────────────
function previewCall(method, args) {
  // Simulate realistic responses for demo without Anna
  if (method === "check_policy") {
    const calldata = (args.calldata || "0x").toLowerCase();
    const sel = calldata.slice(0, 10);
    const CRITICAL = ["0x3659cfe6", "0x4f1eb3d8", "0xf2fde38b", "0x715018a6"];
    const HIGH     = ["0x095ea7b3", "0x8456cb59"];
    const isCritical = CRITICAL.includes(sel);
    const isHigh = HIGH.includes(sel);
    const isUnlimitedApproval = sel === "0x095ea7b3" && calldata.endsWith("f".repeat(64));
    const valueWei = BigInt(args.value_wei || "0");
    const overLimit = valueWei > 1000000000000000000n;

    const denials = [];
    const warnings = [];

    if (isCritical || isUnlimitedApproval) {
      denials.push(`Selector ${sel} is CRITICAL risk. Blocked by guardian policy.`);
      if (isUnlimitedApproval) denials.push("Unlimited token approval (max uint256) detected.");
    }
    if (isHigh && !isCritical) warnings.push(`Selector ${sel} is HIGH risk. Review carefully.`);
    if (overLimit) denials.push(`ETH value exceeds policy maximum (1 ETH).`);

    return Promise.resolve({
      verdict: denials.length ? "DENY" : "ALLOW",
      selector: SELECTOR_INFO[sel] || { name: "unknown function", protocol: "Unknown", risk: "medium", selector: sel, known: false },
      denials,
      warnings,
      checked_at: Math.floor(Date.now() / 1000),
    });
  }

  if (method === "explain_risk") {
    const sel = (args.calldata || "0x").toLowerCase().slice(0, 10);
    const info = SELECTOR_INFO[sel] || { name: "unknown function", protocol: "Unknown", risk: "medium" };
    const chains = { 1: "Ethereum Mainnet", 11155111: "Sepolia", 8453: "Base", 42161: "Arbitrum", 5000: "Mantle" };
    const chain = chains[args.chain_id || 1] || "Unknown Chain";
    const risk = info.risk;
    const riskLabel = { low: "Low", medium: "Medium", high: "High", critical: "CRITICAL" }[risk];
    const flags = [];
    if (risk === "critical") flags.push(`🚨 ${info.name} is a privileged admin call (${info.protocol}).`);
    if (sel === "0x095ea7b3" && (args.calldata || "").toLowerCase().endsWith("f".repeat(64))) {
      flags.push("⚠️  Unlimited token approval — grants infinite spending rights.");
    }
    return Promise.resolve({
      summary: `This transaction calls \`${info.name}\` on a ${info.protocol} contract on ${chain}. Overall risk: **${riskLabel}**.` + (flags.length ? "" : " No major concerns detected."),
      chain, function: info.name, protocol: info.protocol,
      risk_level: risk, risk_flags: flags,
    });
  }

  if (method === "request_approval") {
    if (args.action === "submit") {
      const id = Math.random().toString(16).slice(2, 10);
      return Promise.resolve({ request_id: id, status: "pending", message: `Approval request submitted. Risk: ${(args.risk_level || "medium").toUpperCase()}.` });
    }
    if (args.action === "list") return Promise.resolve({ pending: [], pending_count: 0 });
  }

  if (method === "get_status") {
    return Promise.resolve({
      guardian: { policy: { max_eth_value_wei: "1000000000000000000", require_approval_above_wei: "100000000000000000", allow_unknown_selectors: false }, pending_approvals: 0, pending_queue: [] },
      agent_role: { enabled: true, total_calls: 0, denied_calls: 0, last_active: null },
      stats: { total_calls: 0, denied_calls: 0, approval_rate: "N/A" },
      recent_decisions: [],
    });
  }

  return Promise.resolve({});
}

const SELECTOR_INFO = {
  "0xa9059cbb": { name: "transfer(address,uint256)", protocol: "ERC-20", risk: "low" },
  "0x095ea7b3": { name: "approve(address,uint256)", protocol: "ERC-20", risk: "high" },
  "0x23b872dd": { name: "transferFrom(address,address,uint256)", protocol: "ERC-20", risk: "medium" },
  "0x70a08231": { name: "balanceOf(address)", protocol: "ERC-20", risk: "low" },
  "0x3659cfe6": { name: "upgradeTo(address)", protocol: "Proxy", risk: "critical" },
  "0x4f1eb3d8": { name: "upgradeToAndCall(address,bytes)", protocol: "Proxy", risk: "critical" },
  "0xf2fde38b": { name: "transferOwnership(address)", protocol: "Ownable", risk: "critical" },
  "0x715018a6": { name: "renounceOwnership()", protocol: "Ownable", risk: "critical" },
  "0x7ff36ab5": { name: "swapExactETHForTokens(...)", protocol: "Uniswap V2", risk: "medium" },
  "0xe8eda9df": { name: "deposit(address,uint256,address,uint16)", protocol: "Aave", risk: "medium" },
  "0x8456cb59": { name: "pause()", protocol: "Pausable", risk: "high" },
};

// ── Status refresh ───────────────────────────────────────────────────────────
async function refreshStatus() {
  try {
    const d = await callTool("get_status", { include_history: true });
    const s = d.stats || {};
    const g = d.guardian || {};
    const n = g.pending_approvals || 0;
    setText("stat-total",   s.total_calls ?? "0");
    setText("stat-allowed", String(Number(s.total_calls || 0) - Number(s.denied_calls || 0)));
    setText("stat-denied",  s.denied_calls ?? "0");
    setText("stat-pending-val", n);
    const badge = $("pending-count");
    if (badge) { badge.textContent = n; badge.hidden = n === 0; }
    renderHistory(d.recent_decisions || []);
    renderPending(g.pending_queue || []);
  } catch (e) {
    console.warn("Status refresh:", e.message);
  }
}

// ── Check policy ─────────────────────────────────────────────────────────────
async function handleCheckPolicy() {
  if (isCalling) return;
  const to       = $("check-to")?.value.trim();
  const valueWei = $("check-value")?.value.trim() || "0";
  const calldata = $("check-calldata")?.value.trim() || "0x";
  if (!to) { toast("Enter a target address", "error"); return; }
  setLoading(true);
  const box = $("check-result");
  box.hidden = true;
  try {
    const d = await callTool("check_policy", { to, value_wei: valueWei, calldata });
    renderCheckResult(d, box);
    if (anna) await anna.chat.write_message({ role: "system", content: `ETH Guardian policy check: ${d.verdict} for ${to}.${d.denials?.[0] ? " " + d.denials[0] : ""}` });
    await refreshStatus();
  } catch (e) { showError(box, e.message); } finally { setLoading(false); }
}

function renderCheckResult(d, box) {
  const isAllow = d.verdict === "ALLOW";
  box.className = `result-box ${isAllow ? "is-allow" : "is-deny"}`;
  box.hidden = false;
  const s = d.selector || {};
  let h = `<div class="result-verdict ${isAllow ? "verdict-allow" : "verdict-deny"}">${isAllow ? "✓ ALLOW" : "✗ DENY"}</div>`;
  h += `<div>Function: <span class="risk-${s.risk || "low"}">${esc(s.name || "plain ETH transfer")}</span>`;
  if (s.protocol) h += ` <span style="color:var(--t-2)">(${esc(s.protocol)})</span>`;
  h += `</div>`;
  if (d.denials?.length) { h += `<div style="color:var(--red);margin-top:8px;margin-bottom:2px">Denials</div>`; d.denials.forEach(x => { h += `<div>• ${esc(x)}</div>`; }); }
  if (d.warnings?.length) { h += `<div style="color:var(--amber);margin-top:8px;margin-bottom:2px">Warnings</div>`; d.warnings.forEach(x => { h += `<div>• ${esc(x)}</div>`; }); }
  if (isAllow && !d.warnings?.length) h += `<div style="color:var(--t-2);margin-top:6px;font-size:10px">No policy violations detected.</div>`;
  box.innerHTML = h;
}

// ── Explain risk ─────────────────────────────────────────────────────────────
async function handleExplainRisk() {
  if (isCalling) return;
  const to = $("explain-to")?.value.trim();
  if (!to) { toast("Enter a target address", "error"); return; }
  setLoading(true);
  const box = $("explain-result");
  box.hidden = true;
  try {
    const d = await callTool("explain_risk", {
      to,
      calldata:  $("explain-calldata")?.value.trim() || "0x",
      value_wei: "0",
      chain_id:  parseInt($("explain-chain")?.value || "1"),
    });
    renderExplainResult(d, box);
    if (anna) await anna.chat.write_message({ role: "system", content: `ETH Guardian risk: ${(d.risk_level || "").toUpperCase()} — ${d.summary}` });
  } catch (e) { showError(box, e.message); } finally { setLoading(false); }
}

function renderExplainResult(d, box) {
  const risk = d.risk_level || "low";
  box.className = `result-box ${risk === "low" ? "is-allow" : risk === "critical" ? "is-deny" : "is-warn"}`;
  box.hidden = false;
  let h = `<div class="result-verdict risk-${risk}">${risk.toUpperCase()} RISK</div>`;
  h += `<div style="margin-bottom:8px;color:var(--t-0)">${esc(d.summary || "")}</div>`;
  h += `<div>Chain: <span style="color:var(--cyan)">${esc(d.chain || "")}</span></div>`;
  h += `<div>Function: <span style="color:var(--t-code)">${esc(d.function || "N/A")}</span></div>`;
  h += `<div>Protocol: <span style="color:var(--t-1)">${esc(d.protocol || "Unknown")}</span></div>`;
  if (d.risk_flags?.length) {
    h += `<div style="color:var(--amber);margin-top:8px;margin-bottom:2px">Risk flags</div>`;
    d.risk_flags.forEach(f => { h += `<div>${esc(f)}</div>`; });
  }
  box.innerHTML = h;
}

// ── Submit approval ──────────────────────────────────────────────────────────
async function handleSubmitApproval() {
  if (isCalling) return;
  const to   = $("req-to")?.value.trim();
  const desc = $("req-desc")?.value.trim();
  if (!to || !desc) { toast("Address and description required", "error"); return; }
  setLoading(true);
  const box = $("approval-result");
  box.hidden = true;
  try {
    const d = await callTool("request_approval", {
      action: "submit", to,
      calldata: "0x",
      description: desc,
      risk_level: $("req-risk")?.value || "medium",
    });
    box.className = "result-box is-warn";
    box.hidden = false;
    box.innerHTML = `<div class="result-verdict verdict-warn">⏳ PENDING #${d.request_id}</div><div>${esc(d.message || "")}</div>`;
    toast(`Submitted #${d.request_id}`, "success");
    if (anna) await anna.chat.write_message({ role: "system", content: `ETH Guardian: Approval #${d.request_id} submitted. Risk: ${$("req-risk")?.value?.toUpperCase()}. ${desc}` });
    await refreshPending();
    await refreshStatus();
  } catch (e) { showError(box, e.message); } finally { setLoading(false); }
}

// ── Demo cards ───────────────────────────────────────────────────────────────
function renderDemoCards() {
  const grid = $("demo-grid");
  if (!grid) return;
  grid.innerHTML = DEMO_TXS.map(tx => `
    <div class="demo-card" data-id="${tx.id}" style="--card-accent:${tx.accent}" role="button" tabindex="0">
      <div class="demo-card-head">
        <span class="demo-card-protocol">${tx.protocol}</span>
        <span class="demo-risk-chip chip-${tx.risk}">${tx.risk}</span>
      </div>
      <div class="demo-card-name">${tx.name}</div>
      <div class="demo-card-desc">${tx.desc}</div>
      <div class="demo-card-calldata">${tx.calldata.slice(0, 34)}…</div>
      <div class="demo-card-action">▶ Run ${tx.action === "check" ? "check_policy" : "explain_risk"}</div>
    </div>
  `).join("");

  grid.querySelectorAll(".demo-card").forEach(card => {
    const run = () => runDemo(card.dataset.id);
    card.addEventListener("click", run);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") run(); });
  });
}

async function runDemo(id) {
  const tx = DEMO_TXS.find(t => t.id === id);
  if (!tx || isCalling) return;

  const card = document.querySelector(`[data-id="${id}"]`);
  card?.classList.add("is-loading");
  setLoading(true);

  const panel = $("demo-result-panel");
  const body  = $("demo-result-body");
  const title = $("demo-result-title");

  try {
    let d, html;
    if (tx.action === "check") {
      d = await callTool("check_policy", { to: tx.to, value_wei: tx.value, calldata: tx.calldata });
      const isAllow = d.verdict === "ALLOW";
      const s = d.selector || {};
      title.textContent = `${tx.name} — ${d.verdict}`;
      html = `<div class="result-verdict ${isAllow ? "verdict-allow" : "verdict-deny"}">${isAllow ? "✓ ALLOW" : "✗ DENY"}</div>`;
      html += `<div>Function: <span class="risk-${s.risk || "low"}">${esc(s.name || tx.calldata.slice(0,10))}</span> <span style="color:var(--t-2)">(${esc(s.protocol || "")})</span></div>`;
      if (d.denials?.length)  { html += `<div style="color:var(--red);margin-top:8px">Denials</div>`; d.denials.forEach(x => { html += `<div>• ${esc(x)}</div>`; }); }
      if (d.warnings?.length) { html += `<div style="color:var(--amber);margin-top:8px">Warnings</div>`; d.warnings.forEach(x => { html += `<div>• ${esc(x)}</div>`; }); }
      if (isAllow && !d.warnings?.length) html += `<div style="color:var(--t-2);margin-top:6px;font-size:10px">No policy violations detected.</div>`;
    } else {
      d = await callTool("explain_risk", { to: tx.to, calldata: tx.calldata, value_wei: tx.value, chain_id: tx.chain });
      const risk = d.risk_level || "low";
      title.textContent = `${tx.name} — ${risk.toUpperCase()} RISK`;
      html = `<div class="result-verdict risk-${risk}">${risk.toUpperCase()} RISK</div>`;
      html += `<div style="margin-bottom:8px;color:var(--t-0)">${esc(d.summary || "")}</div>`;
      html += `<div>Function: <span style="color:var(--t-code)">${esc(d.function || "N/A")}</span></div>`;
      if (d.risk_flags?.length) { html += `<div style="color:var(--amber);margin-top:8px">Risk flags</div>`; d.risk_flags.forEach(f => { html += `<div>${esc(f)}</div>`; }); }
    }

    body.innerHTML = html;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

    // Pre-fill the dashboard fields for further exploration
    if (tx.action === "check") {
      const el = $("check-to"); if (el) { el.value = tx.to; }
      const cd = $("check-calldata"); if (cd) { cd.value = tx.calldata; }
      const vl = $("check-value"); if (vl) { vl.value = tx.value; }
    }

    await refreshStatus();
  } catch (e) {
    body.innerHTML = `<div style="color:var(--red)">Error: ${esc(e.message)}</div>`;
    panel.hidden = false;
  } finally {
    card?.classList.remove("is-loading");
    setLoading(false);
  }
}

// ── Queue + History ──────────────────────────────────────────────────────────
async function refreshPending() {
  try {
    const d = await callTool("request_approval", { action: "list", to: "n/a", description: "n/a" });
    renderPending(d.pending || []);
  } catch {}
}

function renderPending(pending) {
  const list = $("approval-list");
  if (!list) return;
  list.innerHTML = pending.length
    ? pending.map(p => `
        <li class="approval-item risk-${p.risk_level}-border">
          <div class="approval-meta">
            <span class="approval-id">#${p.request_id}</span>
            <span class="risk-chip risk-chip-${p.risk_level}">${p.risk_level}</span>
            <span class="approval-time">${relTime(p.submitted_at)}</span>
          </div>
          <div class="approval-desc">${esc(p.description)}</div>
          <div class="approval-addr">${esc(p.to)}</div>
          <div class="approval-actions">
            <button class="btn-approve" data-id="${p.request_id}" data-action="approve">✓ Approve</button>
            <button class="btn-deny"    data-id="${p.request_id}" data-action="deny">✕ Deny</button>
          </div>
        </li>`).join("")
    : `<li class="empty-state"><span class="empty-icon">◎</span><span>No pending approvals — the guardian is idle.</span></li>`;
  list.querySelectorAll("[data-action]").forEach(btn =>
    btn.addEventListener("click", () => handleDecision(btn.dataset.id, btn.dataset.action))
  );
}

async function handleDecision(id, action) {
  setLoading(true);
  try {
    await callTool("request_approval", { action, request_id: id, to: "n/a", description: "n/a" });
    toast(`${action === "approve" ? "Approved" : "Denied"} #${id}`, action === "approve" ? "success" : "error");
    if (anna) await anna.chat.write_message({ role: "system", content: `ETH Guardian: Request #${id} was ${action}d.` });
    await refreshPending();
    await refreshStatus();
  } catch (e) { toast(e.message, "error"); } finally { setLoading(false); }
}

function renderHistory(history) {
  const list = $("history-list");
  if (!list) return;
  list.innerHTML = history.length
    ? history.map(h => `
        <li class="history-item decision-${h.decision}">
          <div class="history-decision">${h.decision === "approved" ? "✓ Approved" : "✕ Denied"}</div>
          <div class="history-desc">${esc(h.description || h.to)}</div>
          <div class="history-time">${relTime(h.decided_at)}</div>
        </li>`).join("")
    : `<li class="empty-state"><span class="empty-icon">≡</span><span>No decisions recorded yet.</span></li>`;
}

// ── UI wiring ────────────────────────────────────────────────────────────────
function bindUI() {
  $("btn-check")?.addEventListener("click", handleCheckPolicy);
  $("btn-explain")?.addEventListener("click", handleExplainRisk);
  $("btn-submit-approval")?.addEventListener("click", handleSubmitApproval);
  $("btn-refresh-pending")?.addEventListener("click", refreshPending);
  $("btn-refresh-history")?.addEventListener("click", refreshStatus);
  $("btn-demo-clear")?.addEventListener("click", () => {
    const p = $("demo-result-panel"); if (p) p.hidden = true;
  });

  tabs.forEach(tab =>
    tab.addEventListener("click", () => switchView(tab.dataset.view))
  );
}

function switchView(name, save = true) {
  tabs.forEach(t => {
    t.classList.toggle("is-active", t.dataset.view === name);
    t.setAttribute("aria-selected", t.dataset.view === name);
  });
  views.forEach(v => {
    v.classList.toggle("is-active", v.id === `view-${name}`);
    v.hidden = v.id !== `view-${name}`;
  });
  if (save) safeSet(STORAGE_KEY, name);
  if (name === "pending") refreshPending();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function setLoading(on) {
  isCalling = on;
  ["btn-check", "btn-explain", "btn-submit-approval"].forEach(id => {
    const b = $(id); if (b) b.disabled = on;
  });
}
function showError(box, msg) {
  if (!box) return;
  box.className = "result-box is-deny";
  box.hidden = false;
  box.innerHTML = `<div class="result-verdict verdict-deny">✗ ERROR</div><div>${esc(msg)}</div>`;
}
function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $("toast-container")?.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));
  setTimeout(() => { el.classList.remove("is-visible"); el.addEventListener("transitionend", () => el.remove()); }, 3000);
}
function setText(id, val) { const el = $(id); if (el) el.textContent = val; }
function esc(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function relTime(ts) {
  if (!ts) return "—";
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return new Date(ts * 1000).toLocaleString();
}
async function safeGet(k) { try { return (await anna?.storage.get({ key: k }))?.value || null; } catch { return null; } }
async function safeSet(k, v) { try { await anna?.storage.set({ key: k, value: v }); } catch {} }
function renderStandalone() { toast("Preview mode — Anna not connected", "info"); }

init();
