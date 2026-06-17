/**
 * ETH Guardian — Premium DeFi Dashboard controller
 * Anna SDK + full preview mode + one-click demo transactions
 */

const TOOL_ID =
  (typeof window !== "undefined" && window.__ANNA_TOOL_IDS__?.["eth-guardian"]) ||
  "tool-ilorahdavid126-eth-guardian-pxf3jej7";

const STORAGE_KEY = "eth-guardian:view";

// ── Demo transactions ────────────────────────────────────────────────────────
const DEMOS = [
  { id: "usdc-transfer",    name: "USDC Transfer",       protocol: "ERC-20",    risk: "low",      action: "check",   desc: "Send 1,000 USDC to another wallet. Standard low-risk transfer.", calldata: "0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045000000000000000000000000000000000000000000000000000000003b9aca00", to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", value: "0", chain: 1 },
  { id: "unlimited-approve",name: "Unlimited Approval",  protocol: "ERC-20",    risk: "critical", action: "check",   desc: "Grant a contract unlimited permission to spend all your tokens — forever.", calldata: "0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", value: "0", chain: 1 },
  { id: "proxy-upgrade",    name: "Proxy Upgrade",       protocol: "Proxy",     risk: "critical", action: "check",   desc: "Replace contract logic entirely — changes all contract behavior permanently.", calldata: "0x3659cfe6000000000000000000000000deadbeef1234567890abcdef1234567890abcdef12", to: "0x1234567890abcdef1234567890abcdef12345678", value: "0", chain: 1 },
  { id: "uniswap-swap",     name: "ETH → USDC Swap",    protocol: "Uniswap V2",risk: "medium",   action: "check",   desc: "Swap 0.5 ETH for USDC. Triggers the approval threshold warning.", calldata: "0x7ff36ab5000000000000000000000000000000000000000000000000000000003b9aca00", to: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", value: "500000000000000000", chain: 1 },
  { id: "transfer-ownership",name:"Transfer Ownership",  protocol: "Ownable",   risk: "critical", action: "explain", desc: "Hand over contract ownership to a new address. Irreversible admin action.", calldata: "0xf2fde38b000000000000000000000000deadbeef1234567890abcdef1234567890abcdef12", to: "0xabcdef1234567890abcdef1234567890abcdef12", value: "0", chain: 1 },
  { id: "aave-deposit",     name: "Aave Deposit",        protocol: "Aave V2",   risk: "medium",   action: "explain", desc: "Deposit USDC into Aave lending pool to earn yield.", calldata: "0xe8eda9df000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000003b9aca00", to: "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9", value: "0", chain: 1 },
];

const SELECTORS = {
  "0xa9059cbb": { name: "transfer(address,uint256)",           protocol: "ERC-20",     risk: "low" },
  "0x095ea7b3": { name: "approve(address,uint256)",            protocol: "ERC-20",     risk: "high" },
  "0x23b872dd": { name: "transferFrom(address,address,uint256)",protocol:"ERC-20",     risk: "medium" },
  "0x70a08231": { name: "balanceOf(address)",                  protocol: "ERC-20",     risk: "low" },
  "0x3659cfe6": { name: "upgradeTo(address)",                  protocol: "Proxy",      risk: "critical" },
  "0x4f1eb3d8": { name: "upgradeToAndCall(address,bytes)",     protocol: "Proxy",      risk: "critical" },
  "0xf2fde38b": { name: "transferOwnership(address)",          protocol: "Ownable",    risk: "critical" },
  "0x715018a6": { name: "renounceOwnership()",                 protocol: "Ownable",    risk: "critical" },
  "0x7ff36ab5": { name: "swapExactETHForTokens(...)",          protocol: "Uniswap V2", risk: "medium" },
  "0xe8eda9df": { name: "deposit(address,uint256,address,uint16)",protocol:"Aave",     risk: "medium" },
  "0x8456cb59": { name: "pause()",                             protocol: "Pausable",   risk: "high" },
};

const CHAINS = { 1:"Ethereum Mainnet", 11155111:"Sepolia", 8453:"Base", 42161:"Arbitrum", 5000:"Mantle" };

// ── State ────────────────────────────────────────────────────────────────────
let anna = null;
let busy = false;
const $ = id => document.getElementById(id);
const navItems    = document.querySelectorAll(".nav-item, .bottom-nav-item");
const views       = document.querySelectorAll(".view");

// ── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  buildDemoGrid();
  bindUI();
  try {
    const { AnnaAppRuntime } = await import("/static/anna-apps/_sdk/latest/index.js");
    anna = await AnnaAppRuntime.connect();
    setOnline(true);
    const saved = await safeGet(STORAGE_KEY);
    if (saved) switchView(saved, false);
    await refreshStatus();
  } catch {
    setOnline(false);
  }
}

function setOnline(ok) {
  document.querySelectorAll(".status-dot").forEach(d => d.classList.toggle("online", ok));
  const t = $("status-text"); if (t) t.textContent = ok ? "Connected" : "Preview";
  const c = $("chain-tag"); if (c && ok) c.textContent = "Mainnet";
}

// ── Tool call / preview mock ─────────────────────────────────────────────────
async function call(method, args) {
  if (anna) {
    const r = await anna.tools.invoke({ tool_id: TOOL_ID, method, args });
    if (!r.success) throw new Error(r.error || "Tool failed");
    return r.data;
  }
  return mock(method, args);
}

function mock(method, args) {
  if (method === "check_policy") {
    const cd = (args.calldata || "0x").toLowerCase();
    const sel = cd.slice(0, 10);
    const info = SELECTORS[sel] || { name: "unknown function", protocol: "Unknown", risk: "medium" };
    const unlimitedApproval = sel === "0x095ea7b3" && cd.endsWith("f".repeat(64));
    const valueWei = BigInt(args.value_wei || "0");
    const denials = [], warnings = [];
    if (info.risk === "critical" || unlimitedApproval) {
      denials.push(`${info.name} is CRITICAL risk (${info.protocol}). Blocked by guardian policy.`);
      if (unlimitedApproval) denials.push("Unlimited token approval (max uint256) detected.");
    } else if (info.risk === "high") {
      warnings.push(`${info.name} is HIGH risk. Review carefully before approving.`);
    }
    if (valueWei > 1000000000000000000n) denials.push("ETH value exceeds policy maximum (1 ETH).");
    else if (valueWei > 100000000000000000n) warnings.push("Value exceeds approval threshold. Human approval recommended.");
    return Promise.resolve({ verdict: denials.length ? "DENY" : "ALLOW", selector: { ...info, selector: sel }, denials, warnings });
  }
  if (method === "explain_risk") {
    const sel = (args.calldata || "0x").toLowerCase().slice(0, 10);
    const info = SELECTORS[sel] || { name: "unknown function", protocol: "Unknown", risk: "medium" };
    const chain = CHAINS[args.chain_id || 1] || "Unknown Chain";
    const riskLabel = { low:"Low", medium:"Medium", high:"High", critical:"CRITICAL" }[info.risk];
    const flags = [];
    if (info.risk === "critical") flags.push(`🚨 ${info.name} is a privileged admin call (${info.protocol}).`);
    if (sel === "0x095ea7b3" && (args.calldata||"").toLowerCase().endsWith("f".repeat(64))) flags.push("⚠️ Unlimited token approval — grants infinite spending rights.");
    return Promise.resolve({ summary: `Calls \`${info.name}\` on ${info.protocol} on ${chain}. Overall risk: ${riskLabel}.`, chain, function: info.name, protocol: info.protocol, risk_level: info.risk, risk_flags: flags });
  }
  if (method === "request_approval") {
    if (args.action === "submit") { const id = Math.random().toString(16).slice(2,10); return Promise.resolve({ request_id: id, status: "pending", message: `Submitted. Risk: ${(args.risk_level||"medium").toUpperCase()}.` }); }
    if (args.action === "list") return Promise.resolve({ pending: [], pending_count: 0 });
    return Promise.resolve({ decision: args.action === "approve" ? "approved" : "denied", request_id: args.request_id });
  }
  if (method === "get_status") return Promise.resolve({ guardian: { pending_approvals: 0, pending_queue: [], policy: { max_eth_value_wei:"1000000000000000000", require_approval_above_wei:"100000000000000000" } }, agent_role: { enabled:true, total_calls:0, denied_calls:0 }, stats: { total_calls:0, denied_calls:0, approval_rate:"N/A" }, recent_decisions: [] });
  return Promise.resolve({});
}

// ── Status ───────────────────────────────────────────────────────────────────
async function refreshStatus() {
  try {
    const d = await call("get_status", { include_history: true });
    const s = d.stats || {}, g = d.guardian || {};
    const total = Number(s.total_calls || 0), denied = Number(s.denied_calls || 0);
    set("stat-total",   total);
    set("stat-allowed", total - denied);
    set("stat-denied",  denied);
    set("stat-pending", g.pending_approvals || 0);
    const b = $("nav-badge"); if (b) { b.textContent = g.pending_approvals || 0; b.hidden = !g.pending_approvals; }
    renderHistory(d.recent_decisions || []);
    renderPending(g.pending_queue || []);
  } catch {}
}

// ── Check policy ─────────────────────────────────────────────────────────────
async function doCheckPolicy() {
  if (busy) return;
  const to = $("check-to")?.value.trim();
  if (!to) { toast("Enter a target address", "error"); return; }
  setBusy(true);
  const box = $("check-result"); box.hidden = true;
  try {
    const d = await call("check_policy", { to, value_wei: $("check-value")?.value.trim()||"0", calldata: $("check-calldata")?.value.trim()||"0x" });
    showCheckResult(d, box);
    if (anna) await anna.chat.write_message({ role:"system", content:`ETH Guardian: ${d.verdict} for ${to}. ${d.denials?.[0]||""}` });
    await refreshStatus();
  } catch (e) { showErr(box, e.message); } finally { setBusy(false); }
}

function showCheckResult(d, box) {
  const ok = d.verdict === "ALLOW";
  box.className = `result-area ${ok ? "is-allow" : "is-deny"}`;
  box.hidden = false;
  const s = d.selector || {};
  let h = `<div class="verdict-row"><span class="verdict-badge ${ok?"badge-allow":"badge-deny"}">${ok?"ALLOW":"DENY"}</span> <strong style="color:var(--${ok?"green":"red"})">${esc(s.name||"plain ETH transfer")}</strong></div>`;
  h += `<div class="result-row">Protocol: <strong>${esc(s.protocol||"—")}</strong></div>`;
  if (d.denials?.length) { h += `<div class="result-section-label">Denials</div>`; d.denials.forEach(x => { h += `<div class="result-denial">• ${esc(x)}</div>`; }); }
  if (d.warnings?.length) { h += `<div class="result-section-label">Warnings</div>`; d.warnings.forEach(x => { h += `<div class="result-warning">• ${esc(x)}</div>`; }); }
  if (ok && !d.warnings?.length) h += `<div class="result-row" style="margin-top:8px;color:var(--text-2)">No policy violations detected.</div>`;
  box.innerHTML = h;
}

// ── Explain risk ─────────────────────────────────────────────────────────────
async function doExplainRisk() {
  if (busy) return;
  const to = $("explain-to")?.value.trim();
  if (!to) { toast("Enter a target address", "error"); return; }
  setBusy(true);
  const box = $("explain-result"); box.hidden = true;
  try {
    const d = await call("explain_risk", { to, calldata: $("explain-calldata")?.value.trim()||"0x", value_wei:"0", chain_id: parseInt($("explain-chain")?.value||"1") });
    showExplainResult(d, box);
    if (anna) await anna.chat.write_message({ role:"system", content:`ETH Guardian risk: ${(d.risk_level||"").toUpperCase()} — ${d.summary}` });
  } catch (e) { showErr(box, e.message); } finally { setBusy(false); }
}

function showExplainResult(d, box) {
  const risk = d.risk_level || "low";
  const cls  = { low:"is-allow", medium:"is-warn", high:"is-deny", critical:"is-deny" }[risk] || "is-warn";
  box.className = `result-area ${cls}`; box.hidden = false;
  const badgeCls = { low:"badge-allow", medium:"badge-warn", high:"badge-deny", critical:"badge-crit" }[risk] || "badge-warn";
  let h = `<div class="verdict-row"><span class="verdict-badge ${badgeCls}">${risk.toUpperCase()} RISK</span></div>`;
  h += `<div class="result-row" style="color:var(--text-0);margin-bottom:8px">${esc(d.summary||"")}</div>`;
  h += `<div class="result-row">Chain: <strong>${esc(d.chain||"")}</strong></div>`;
  h += `<div class="result-row">Function: <strong>${esc(d.function||"N/A")}</strong></div>`;
  h += `<div class="result-row">Protocol: <strong>${esc(d.protocol||"Unknown")}</strong></div>`;
  if (d.risk_flags?.length) { h += `<div class="result-section-label">Risk flags</div>`; d.risk_flags.forEach(f => { h += `<div class="result-flag">${esc(f)}</div>`; }); }
  box.innerHTML = h;
}

// ── Submit approval ──────────────────────────────────────────────────────────
async function doSubmitApproval() {
  if (busy) return;
  const to   = $("req-to")?.value.trim();
  const desc = $("req-desc")?.value.trim();
  if (!to || !desc) { toast("Address and description required", "error"); return; }
  setBusy(true);
  const box = $("approval-result"); box.hidden = true;
  try {
    const d = await call("request_approval", { action:"submit", to, calldata:"0x", description:desc, risk_level:$("req-risk")?.value||"medium" });
    box.className = "result-area is-warn"; box.hidden = false;
    box.innerHTML = `<div class="verdict-row"><span class="verdict-badge badge-warn">PENDING</span> <strong>#${d.request_id}</strong></div><div class="result-row">${esc(d.message||"")}</div>`;
    toast(`Submitted #${d.request_id}`, "success");
    if (anna) await anna.chat.write_message({ role:"system", content:`ETH Guardian: Approval #${d.request_id} pending. Risk: ${$("req-risk")?.value?.toUpperCase()}. ${desc}` });
    await refreshStatus();
  } catch (e) { showErr(box, e.message); } finally { setBusy(false); }
}

// ── Demo grid ────────────────────────────────────────────────────────────────
function buildDemoGrid() {
  const g = $("demo-grid"); if (!g) return;
  g.innerHTML = DEMOS.map(d => `
    <div class="demo-card" data-id="${d.id}" tabindex="0" role="button">
      <div class="demo-card-top">
        <span class="demo-protocol">${d.protocol}</span>
        <span class="risk-pill pill-${d.risk}">${d.risk}</span>
      </div>
      <div class="demo-name">${d.name}</div>
      <div class="demo-desc">${d.desc}</div>
      <div class="demo-calldata">${d.calldata.slice(0,32)}…</div>
      <div class="demo-run">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>
        ${d.action === "check" ? "check_policy" : "explain_risk"}
      </div>
    </div>`).join("");
  g.querySelectorAll(".demo-card").forEach(card => {
    const go = () => runDemo(card.dataset.id);
    card.addEventListener("click", go);
    card.addEventListener("keydown", e => { if (e.key==="Enter"||e.key===" ") go(); });
  });
}

async function runDemo(id) {
  const tx = DEMOS.find(d => d.id === id);
  if (!tx || busy) return;
  document.querySelector(`[data-id="${id}"]`)?.classList.add("is-running");
  setBusy(true);
  const panel = $("demo-result-panel"), body = $("demo-result-body"), label = $("demo-result-label");
  try {
    let html;
    if (tx.action === "check") {
      const d = await call("check_policy", { to:tx.to, value_wei:tx.value, calldata:tx.calldata });
      label.textContent = `${tx.name} — ${d.verdict}`;
      const ok = d.verdict==="ALLOW", s = d.selector||{};
      const bc = ok?"badge-allow":"badge-deny";
      html = `<div class="verdict-row"><span class="verdict-badge ${bc}">${d.verdict}</span> <strong style="color:var(--${ok?"green":"red"})">${esc(s.name||tx.calldata.slice(0,10))}</strong></div>`;
      html += `<div class="result-row">Protocol: <strong>${esc(s.protocol||"Unknown")}</strong></div>`;
      if (d.denials?.length)  { html += `<div class="result-section-label">Denials</div>`;  d.denials.forEach(x  => { html += `<div class="result-denial"  >• ${esc(x)}</div>`; }); }
      if (d.warnings?.length) { html += `<div class="result-section-label">Warnings</div>`; d.warnings.forEach(x => { html += `<div class="result-warning">• ${esc(x)}</div>`; }); }
      if (ok && !d.warnings?.length) html += `<div class="result-row" style="margin-top:8px;color:var(--text-2)">No policy violations detected.</div>`;
      body.className = `result-area is-visible ${ok?"is-allow":"is-deny"}`;
    } else {
      const d = await call("explain_risk", { to:tx.to, calldata:tx.calldata, value_wei:tx.value, chain_id:tx.chain });
      const risk = d.risk_level||"low", bc={ low:"badge-allow",medium:"badge-warn",high:"badge-deny",critical:"badge-crit" }[risk]||"badge-warn";
      label.textContent = `${tx.name} — ${risk.toUpperCase()} RISK`;
      html = `<div class="verdict-row"><span class="verdict-badge ${bc}">${risk.toUpperCase()} RISK</span></div>`;
      html += `<div class="result-row" style="color:var(--text-0);margin-bottom:8px">${esc(d.summary||"")}</div>`;
      html += `<div class="result-row">Function: <strong>${esc(d.function||"N/A")}</strong></div>`;
      if (d.risk_flags?.length) { html += `<div class="result-section-label">Risk flags</div>`; d.risk_flags.forEach(f => { html += `<div class="result-flag">${esc(f)}</div>`; }); }
      const cls = { low:"is-allow",medium:"is-warn",high:"is-deny",critical:"is-deny" }[risk]||"is-warn";
      body.className = `result-area is-visible ${cls}`;
    }
    body.innerHTML = html;
    panel.hidden = false;
    panel.scrollIntoView({ behavior:"smooth", block:"nearest" });
    await refreshStatus();
  } catch (e) {
    body.innerHTML = `<div style="color:var(--red)">Error: ${esc(e.message)}</div>`;
    body.className = "result-area is-visible is-deny";
    panel.hidden = false;
  } finally {
    document.querySelector(`[data-id="${id}"]`)?.classList.remove("is-running");
    setBusy(false);
  }
}

// ── Queue + history ──────────────────────────────────────────────────────────
async function refreshPending() {
  try { const d = await call("request_approval",{action:"list",to:"n/a",description:"n/a"}); renderPending(d.pending||[]); } catch {}
}

function renderPending(items) {
  const list = $("approval-list"); if (!list) return;
  list.innerHTML = items.length
    ? items.map(p=>`
        <li class="approval-item border-${p.risk_level}">
          <div class="approval-meta">
            <span class="approval-id">#${p.request_id}</span>
            <span class="risk-pill pill-${p.risk_level}">${p.risk_level}</span>
            <span class="approval-time">${rel(p.submitted_at)}</span>
          </div>
          <div class="approval-desc">${esc(p.description)}</div>
          <div class="approval-addr">${esc(p.to)}</div>
          <div class="approval-actions">
            <button class="btn-approve" data-id="${p.request_id}" data-action="approve">Approve</button>
            <button class="btn-deny"    data-id="${p.request_id}" data-action="deny">Deny</button>
          </div>
        </li>`).join("")
    : `<li class="empty-state">No pending approvals — the guardian is idle.</li>`;
  list.querySelectorAll("[data-action]").forEach(b => b.addEventListener("click", () => decide(b.dataset.id, b.dataset.action)));
}

async function decide(id, action) {
  setBusy(true);
  try {
    await call("request_approval",{action,request_id:id,to:"n/a",description:"n/a"});
    toast(`${action==="approve"?"Approved":"Denied"} #${id}`, action==="approve"?"success":"error");
    if (anna) await anna.chat.write_message({role:"system",content:`ETH Guardian: #${id} was ${action}d.`});
    await refreshPending(); await refreshStatus();
  } catch (e) { toast(e.message,"error"); } finally { setBusy(false); }
}

function renderHistory(items) {
  const list = $("history-list"); if (!list) return;
  list.innerHTML = items.length
    ? items.map(h=>`
        <li class="history-item ${h.decision}">
          <div class="history-verdict">${h.decision==="approved"?"✓ Approved":"✕ Denied"}</div>
          <div class="history-desc">${esc(h.description||h.to)}</div>
          <div class="history-time">${rel(h.decided_at)}</div>
        </li>`).join("")
    : `<li class="empty-state">No decisions recorded yet.</li>`;
}

// ── Navigation ───────────────────────────────────────────────────────────────
function switchView(name, save=true) {
  navItems.forEach(n => n.classList.toggle("is-active", n.dataset.view===name));
  views.forEach(v => { const show = v.id===`view-${name}`; v.classList.toggle("is-active",show); v.hidden=!show; });
  if (save) safeSet(STORAGE_KEY, name);
  if (name==="pending") refreshPending();
}

function bindUI() {
  $("btn-check")?.addEventListener("click", doCheckPolicy);
  $("btn-explain")?.addEventListener("click", doExplainRisk);
  $("btn-submit-approval")?.addEventListener("click", doSubmitApproval);
  $("btn-refresh-pending")?.addEventListener("click", refreshPending);
  $("btn-refresh-history")?.addEventListener("click", refreshStatus);
  $("btn-demo-clear")?.addEventListener("click",()=>{ const p=$("demo-result-panel"); if(p) p.hidden=true; });
  navItems.forEach(n => n.addEventListener("click", ()=> switchView(n.dataset.view)));
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function setBusy(on) {
  busy = on;
  ["btn-check","btn-explain","btn-submit-approval"].forEach(id=>{ const b=$(id); if(b) b.disabled=on; });
}
function showErr(box, msg) {
  box.className="result-area is-deny"; box.hidden=false;
  box.innerHTML=`<div class="verdict-row"><span class="verdict-badge badge-deny">ERROR</span></div><div class="result-row">${esc(msg)}</div>`;
}
function toast(msg, type="success") {
  const el=document.createElement("div"); el.className=`toast t-${type}`; el.textContent=msg;
  $("toast-container")?.appendChild(el);
  requestAnimationFrame(()=>el.classList.add("show"));
  setTimeout(()=>{ el.classList.remove("show"); el.addEventListener("transitionend",()=>el.remove()); }, 3000);
}
function set(id, val) { const el=$(id); if(el) el.textContent=val; }
function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function rel(ts) {
  if (!ts) return "—"; const d=Math.floor(Date.now()/1000)-ts;
  if (d<60) return `${d}s ago`; if (d<3600) return `${Math.floor(d/60)}m ago`;
  return new Date(ts*1000).toLocaleString();
}
async function safeGet(k) { try { return (await anna?.storage.get({key:k}))?.value||null; } catch { return null; } }
async function safeSet(k,v) { try { await anna?.storage.set({key:k,value:v}); } catch {} }

init();
