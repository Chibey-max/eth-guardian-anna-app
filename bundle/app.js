/**
 * ETH Guardian — Final clean controller
 * No dynamic imports. No async init. Stats update live.
 */

// ── Live state ───────────────────────────────────────────────────────────────
var TOTAL = 0;
var DENIED_COUNT = 0;
var PENDING = [];
var HISTORY = [];

// ── Selector library ─────────────────────────────────────────────────────────
var SELECTORS = {
  "0xa9059cbb": { name:"transfer(address,uint256)", proto:"ERC-20", risk:"low" },
  "0x095ea7b3": { name:"approve(address,uint256)", proto:"ERC-20", risk:"high" },
  "0x23b872dd": { name:"transferFrom(address,address,uint256)", proto:"ERC-20", risk:"medium" },
  "0x3659cfe6": { name:"upgradeTo(address)", proto:"Proxy", risk:"critical" },
  "0x4f1eb3d8": { name:"upgradeToAndCall(address,bytes)", proto:"Proxy", risk:"critical" },
  "0xf2fde38b": { name:"transferOwnership(address)", proto:"Ownable", risk:"critical" },
  "0x715018a6": { name:"renounceOwnership()", proto:"Ownable", risk:"critical" },
  "0x7ff36ab5": { name:"swapExactETHForTokens(...)", proto:"Uniswap V2", risk:"medium" },
  "0xe8eda9df": { name:"deposit(address,uint256,address,uint16)", proto:"Aave", risk:"medium" },
  "0x8456cb59": { name:"pause()", proto:"Pausable", risk:"high" },
};

var CHAINS = {1:"Ethereum Mainnet",11155111:"Sepolia",8453:"Base",42161:"Arbitrum",5000:"Mantle"};

var DEMOS = [
  { id:"usdc",    name:"USDC Transfer",      proto:"ERC-20",     risk:"low",      action:"check",   desc:"Send 1,000 USDC to another address. Standard low-risk ERC-20 transfer.", calldata:"0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045000000000000000000000000000000000000000000000000000000003b9aca00", to:"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", value:"0", chain:1, accent:"#22c55e" },
  { id:"approve", name:"Unlimited Approval", proto:"ERC-20",     risk:"critical", action:"check",   desc:"Grant a contract infinite spending rights on all your tokens forever.", calldata:"0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", to:"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", value:"0", chain:1, accent:"#ef4444" },
  { id:"upgrade", name:"Proxy Upgrade",      proto:"Proxy",      risk:"critical", action:"check",   desc:"Replace contract implementation — permanently changes all behavior.", calldata:"0x3659cfe6000000000000000000000000deadbeef1234567890abcdef1234567890abcdef12", to:"0x1234567890abcdef1234567890abcdef12345678", value:"0", chain:1, accent:"#ef4444" },
  { id:"swap",    name:"ETH → USDC Swap",   proto:"Uniswap V2", risk:"medium",   action:"check",   desc:"Swap 0.5 ETH for USDC via Uniswap V2. Triggers approval threshold.", calldata:"0x7ff36ab5000000000000000000000000000000000000000000000000000000003b9aca00", to:"0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", value:"500000000000000000", chain:1, accent:"#f59e0b" },
  { id:"owner",   name:"Transfer Ownership", proto:"Ownable",    risk:"critical", action:"explain", desc:"Hand contract ownership to a new address. Irreversible admin action.", calldata:"0xf2fde38b000000000000000000000000deadbeef1234567890abcdef1234567890abcdef12", to:"0xabcdef1234567890abcdef1234567890abcdef12", value:"0", chain:1, accent:"#ef4444" },
  { id:"aave",    name:"Aave Deposit",       proto:"Aave V2",    risk:"medium",   action:"explain", desc:"Deposit USDC into the Aave V2 lending pool to earn variable yield.", calldata:"0xe8eda9df000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000003b9aca00", to:"0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9", value:"0", chain:1, accent:"#f59e0b" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function g(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function rel(ts) {
  if (!ts) return "—";
  var d = Math.floor(Date.now()/1000) - ts;
  if (d < 60) return d + "s ago";
  if (d < 3600) return Math.floor(d/60) + "m ago";
  return new Date(ts*1000).toLocaleString();
}

// ── Update stat cards (called after every action) ────────────────────────────
function updateStats() {
  var allowed  = TOTAL - DENIED_COUNT;
  var awaiting = PENDING.length;
  g("stat-total")   && (g("stat-total").textContent   = TOTAL);
  g("stat-allowed") && (g("stat-allowed").textContent = allowed);
  g("stat-denied")  && (g("stat-denied").textContent  = DENIED_COUNT);
  g("stat-pending") && (g("stat-pending").textContent = awaiting);
  var badge = g("nav-badge");
  if (badge) { badge.textContent = awaiting; badge.hidden = awaiting === 0; }
}

// ── Policy engine ─────────────────────────────────────────────────────────────
function runCheck(to, calldata, valueWei) {
  var cd   = (calldata || "0x").toLowerCase();
  var sel  = cd.slice(0, 10);
  var info = SELECTORS[sel] || { name:"unknown function", proto:"Unknown", risk:"medium" };
  var unlimited = sel === "0x095ea7b3" && cd.length > 10 && cd.slice(-64).split("f").join("").length === 0;
  var v = BigInt(valueWei || "0");
  var denials = [], warnings = [];

  if (info.risk === "critical" || unlimited) {
    denials.push(info.name + " is CRITICAL risk (" + info.proto + "). Blocked by guardian policy.");
    if (unlimited) denials.push("Unlimited token approval (max uint256) detected.");
  } else if (info.risk === "high") {
    warnings.push(info.name + " is HIGH risk (" + info.proto + "). Review before approving.");
  }
  if (v > BigInt("1000000000000000000")) denials.push("ETH value exceeds policy maximum (1.0 ETH).");
  else if (v > BigInt("100000000000000000")) warnings.push("Value exceeds approval threshold (0.1 ETH).");

  TOTAL++;
  if (denials.length) DENIED_COUNT++;

  return { verdict: denials.length ? "DENY" : "ALLOW", selector: info, sel: sel, denials: denials, warnings: warnings };
}

function runExplain(to, calldata, chainId) {
  var sel  = (calldata || "0x").toLowerCase().slice(0, 10);
  var info = SELECTORS[sel] || { name:"unknown function", proto:"Unknown", risk:"medium" };
  var chain = CHAINS[chainId || 1] || "Unknown Chain";
  var label = {low:"Low",medium:"Medium",high:"High",critical:"CRITICAL"}[info.risk] || "Medium";
  var flags = [];
  if (info.risk === "critical") flags.push("🚨 " + info.name + " is a privileged admin call (" + info.proto + ").");
  return { summary:"Calls `" + info.name + "` on a " + info.proto + " contract on " + chain + ". Overall risk: " + label + ".", chain:chain, fname:info.name, protocol:info.proto, risk:info.risk, flags:flags };
}

// ── Result painters ───────────────────────────────────────────────────────────
function paintCheck(result, box) {
  var ok  = result.verdict === "ALLOW";
  var cls = ok ? "is-allow" : "is-deny";
  var bc  = ok ? "vb-allow" : "vb-deny";
  var h   = '<div class="result-inner ' + cls + '">';
  h += '<div class="verdict-line"><span class="verdict-badge ' + bc + '">' + result.verdict + '</span>';
  h += '<span class="verdict-fn">' + esc(result.selector.name) + '</span></div>';
  h += '<div class="result-row">Protocol: <strong>' + esc(result.selector.proto) + '</strong></div>';
  if (result.denials.length)  { h += '<div class="result-section">Denials</div>';  result.denials.forEach(function(x)  { h += '<div class="result-denial">• ' + esc(x) + '</div>'; }); }
  if (result.warnings.length) { h += '<div class="result-section">Warnings</div>'; result.warnings.forEach(function(x) { h += '<div class="result-warning">• ' + esc(x) + '</div>'; }); }
  if (ok && !result.warnings.length) h += '<div class="result-ok">No policy violations. Transaction may proceed.</div>';
  h += '</div>';
  box.innerHTML = h;
  box.hidden = false;
}

function paintExplain(result, box) {
  var cls = {low:"is-allow",medium:"is-warn",high:"is-deny",critical:"is-deny"}[result.risk] || "is-warn";
  var bc  = {low:"vb-allow",medium:"vb-warn",high:"vb-deny",critical:"vb-crit"}[result.risk] || "vb-warn";
  var h   = '<div class="result-inner ' + cls + '">';
  h += '<div class="verdict-line"><span class="verdict-badge ' + bc + '">' + result.risk.toUpperCase() + ' RISK</span></div>';
  h += '<div class="result-row" style="color:var(--t0);margin-bottom:8px">' + esc(result.summary) + '</div>';
  h += '<div class="result-row">Chain: <strong>' + esc(result.chain) + '</strong></div>';
  h += '<div class="result-row">Function: <strong>' + esc(result.fname) + '</strong></div>';
  if (result.flags.length) { h += '<div class="result-section">Risk flags</div>'; result.flags.forEach(function(f) { h += '<div class="result-flag">' + esc(f) + '</div>'; }); }
  h += '</div>';
  box.innerHTML = h;
  box.hidden = false;
}

function paintErr(box, msg) {
  box.innerHTML = '<div class="result-inner is-deny"><div class="verdict-line"><span class="verdict-badge vb-deny">ERROR</span></div><div class="result-denial">' + esc(msg) + '</div></div>';
  box.hidden = false;
}

// ── Queue + history ───────────────────────────────────────────────────────────
function renderQueue() {
  var list = g("approval-list"); if (!list) return;
  if (!PENDING.length) { list.innerHTML = '<li class="empty">The guardian is idle — no pending approvals.</li>'; return; }
  list.innerHTML = PENDING.map(function(p) {
    return '<li class="approval-item bc-' + p.risk + '">' +
      '<div class="ai-meta"><span class="ai-id">#' + p.id + '</span>' +
      '<span class="risk-pill rp-' + p.risk + '">' + p.risk + '</span>' +
      '<span class="ai-time">' + rel(p.ts) + '</span></div>' +
      '<div class="ai-desc">' + esc(p.desc) + '</div>' +
      '<div class="ai-addr">' + esc(p.to) + '</div>' +
      '<div class="ai-actions">' +
      '<button class="btn-approve" data-id="' + p.id + '" data-a="approve">✓ Approve</button>' +
      '<button class="btn-deny-action" data-id="' + p.id + '" data-a="deny">✕ Deny</button>' +
      '</div></li>';
  }).join("");
  list.querySelectorAll("[data-a]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var id = btn.getAttribute("data-id");
      var action = btn.getAttribute("data-a");
      var idx = PENDING.findIndex(function(p) { return p.id === id; });
      if (idx > -1) {
        var entry = PENDING.splice(idx, 1)[0];
        HISTORY.unshift({ id:entry.id, to:entry.to, desc:entry.desc, decision:action==="approve"?"approved":"denied", ts:Math.floor(Date.now()/1000) });
      }
      toast((action==="approve"?"Approved":"Denied") + " #" + id, action==="approve"?"ok":"err");
      updateStats();
      renderQueue();
      renderHistory();
    });
  });
}

function renderHistory() {
  var list = g("history-list"); if (!list) return;
  if (!HISTORY.length) { list.innerHTML = '<li class="empty">No decisions recorded yet.</li>'; return; }
  list.innerHTML = HISTORY.map(function(h) {
    return '<li class="history-item hi-' + h.decision + '">' +
      '<div class="hi-verdict">' + (h.decision==="approved" ? "✓ Approved" : "✕ Denied") + '</div>' +
      '<div class="hi-desc">' + esc(h.desc || h.to) + '</div>' +
      '<div class="hi-time">' + rel(h.ts) + '</div></li>';
  }).join("");
}

// ── Button handlers ───────────────────────────────────────────────────────────
function handleCheck() {
  var to  = (g("check-to")?.value || "").trim();
  var val = (g("check-value")?.value || "0").trim();
  var cd  = (g("check-calldata")?.value || "0x").trim();
  if (!to) { toast("Enter a target address", "err"); return; }
  var result = runCheck(to, cd, val);
  paintCheck(result, g("check-result"));
  updateStats();
}

function handleExplain() {
  var to    = (g("explain-to")?.value || "").trim();
  var cd    = (g("explain-calldata")?.value || "0x").trim();
  var chain = parseInt(g("explain-chain")?.value || "1");
  if (!to) { toast("Enter a target address", "err"); return; }
  var result = runExplain(to, cd, chain);
  paintExplain(result, g("explain-result"));
}

function handleSubmit() {
  var to   = (g("req-to")?.value || "").trim();
  var desc = (g("req-desc")?.value || "").trim();
  var risk = g("req-risk")?.value || "medium";
  if (!to || !desc) { toast("Address and description required", "err"); return; }
  var id = Math.random().toString(16).slice(2,10);
  PENDING.push({ id:id, to:to, desc:desc, risk:risk, ts:Math.floor(Date.now()/1000) });
  var box = g("approval-result");
  box.innerHTML = '<div class="result-inner is-warn"><div class="verdict-line"><span class="verdict-badge vb-warn">PENDING</span><strong>#' + id + '</strong></div><div class="result-row">Submitted. Risk: ' + risk.toUpperCase() + '.</div></div>';
  box.hidden = false;
  toast("Submitted #" + id, "ok");
  updateStats();
}

// ── Demo cards ────────────────────────────────────────────────────────────────
function buildDemos() {
  var grid = g("demo-grid"); if (!grid) return;
  grid.innerHTML = DEMOS.map(function(d) {
    return '<div class="demo-card" data-id="' + d.id + '" style="--card-accent:' + d.accent + '" tabindex="0" role="button">' +
      '<div class="demo-card-top"><span class="demo-proto">' + d.proto + '</span><span class="risk-pill rp-' + d.risk + '">' + d.risk + '</span></div>' +
      '<div class="demo-name">' + d.name + '</div>' +
      '<div class="demo-desc">' + d.desc + '</div>' +
      '<div class="demo-selector">' + d.calldata.slice(0,10) + '…</div>' +
      '<div class="demo-cta"><svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="2,1 10,6 2,11"/></svg>Run ' + (d.action==="check"?"check_policy":"explain_risk") + '</div>' +
      '</div>';
  }).join("");

  grid.querySelectorAll(".demo-card").forEach(function(card) {
    function run() {
      var id = card.getAttribute("data-id");
      var tx = DEMOS.find(function(d) { return d.id === id; });
      if (!tx) return;
      var panel = g("demo-result-panel");
      var body  = g("demo-result-body");
      var label = g("demo-result-label");
      if (tx.action === "check") {
        var result = runCheck(tx.to, tx.calldata, tx.value);
        if (label) label.textContent = tx.name + " — " + result.verdict;
        paintCheck(result, body);
      } else {
        var result = runExplain(tx.to, tx.calldata, tx.chain);
        if (label) label.textContent = tx.name + " — " + result.risk.toUpperCase() + " RISK";
        paintExplain(result, body);
      }
      if (panel) panel.hidden = false;
      updateStats();
    }
    card.addEventListener("click", run);
    card.addEventListener("keydown", function(e) { if (e.key==="Enter"||e.key===" ") run(); });
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────
function switchView(name) {
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(function(n) {
    n.classList.toggle("is-active", n.getAttribute("data-view") === name);
  });
  document.querySelectorAll(".view").forEach(function(v) {
    v.hidden = v.id !== "view-" + name;
  });
  if (name === "pending") renderQueue();
  if (name === "history") renderHistory();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type) {
  var el = document.createElement("div");
  el.className = "toast t-" + (type||"ok");
  el.textContent = msg;
  var wrap = g("toast-container");
  if (wrap) wrap.appendChild(el);
  requestAnimationFrame(function() { el.classList.add("show"); });
  setTimeout(function() { el.classList.remove("show"); el.addEventListener("transitionend", function() { el.remove(); }); }, 3000);
}

// ── Boot (runs when DOM is ready) ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function() {
  buildDemos();
  updateStats();

  g("btn-check")           && g("btn-check").addEventListener("click", handleCheck);
  g("btn-explain")         && g("btn-explain").addEventListener("click", handleExplain);
  g("btn-submit-approval") && g("btn-submit-approval").addEventListener("click", handleSubmit);
  g("btn-demo-clear")      && g("btn-demo-clear").addEventListener("click", function() { var p=g("demo-result-panel"); if(p) p.hidden=true; });
  g("btn-refresh-pending") && g("btn-refresh-pending").addEventListener("click", renderQueue);
  g("btn-refresh-history") && g("btn-refresh-history").addEventListener("click", renderHistory);

  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(function(n) {
    n.addEventListener("click", function() { switchView(n.getAttribute("data-view")); });
  });
});
