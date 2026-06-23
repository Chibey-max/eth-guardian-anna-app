# ETH Guardian

> Human-in-the-loop safety layer for autonomous Ethereum agents, built as an Anna AI-Native App.

[![Demo](https://img.youtube.com/vi/ntWaVyL9MJk/0.jpg)](https://youtu.be/ntWaVyL9MJk)

## The Problem

Autonomous Ethereum agents can move real funds. Their mistakes are irreversible. If an AI agent signs the wrong transaction, the money is gone. No undo. No rollback.

ETH Guardian fixes that.

## What it does

ETH Guardian wraps your autonomous Ethereum agent in a guardian layer. Before any transaction reaches the chain, it must pass two gates:

1. **Policy gate** — checked automatically against on-chain rules
2. **Human gate** — flagged transactions wait for a human to approve or deny

The agent proposes. You decide. The chain only sees what is safe.

## How it works on Anna

ETH Guardian runs natively as an Anna AI-Native App. Anna's review-and-permission model is exactly the trust boundary a safety product needs. The agent calls Guardian's tools, denied transactions become review items, and approval state persists across sessions via Main Soul memory.
Autonomous Agent

│

│ proposes transaction

▼

ETH Guardian (Anna App)

│

├─ check_policy ──► ALLOW → executes

│

└─ DENY / HIGH RISK → explain_risk → request_approval → human queue

│

▼

Human: Approve / Deny

## Tools

| Tool | Description |
|------|-------------|
| `check_policy` | Validates a transaction against guardian rules. Returns ALLOW or DENY with reasons. |
| `explain_risk` | Translates raw calldata into a plain-language risk summary for human reviewers. |
| `request_approval` | Routes a transaction to the human approval queue. |
| `get_status` | Returns guardian state, pending queue, and decision history. |

## Dashboard

- **Total Checks** — live count of all policy checks
- **Denied** — transactions blocked by policy
- **Allow Rate** — percentage of transactions cleared
- **Awaiting** — transactions pending human review
- **Pending tab** — human approval queue with Approve / Deny actions
- **Policy tab** — active policy rules and agent stats
- **History tab** — full decision log

## Tech Stack

- Node.js Executa stdio plugin (JSON-RPC 2.0 over stdio)
- Declarative SKILL.md safety protocol
- Static SPA bundle with Anna SDK integration
- Local simulation engine (full demo mode, no backend required)
- Dual theme: dark cyberpunk / light lab
- Binary distribution: linux-x86_64, darwin-arm64, darwin-x86_64
- GitHub Actions CI/CD for multi-platform binary builds
- 10-test integration suite

## Quick Start (standalone preview)

```bash
git clone https://github.com/Chibey-max/eth-guardian-anna-app
cd eth-guardian-anna-app
npm run dev:preview
# Open http://localhost:4173
# Click "Load risky example" → "Check Policy" to see a DENY verdict
```

## Install on Anna

1. Open Anna → More → App Store
2. Search **ETH Guardian**
3. Click Install
4. Go to More → Agents → Install Essentials
5. Open ETH Guardian from the dashboard

Binary packages are auto-selected per platform and downloaded by Anna Agent.

## Binary Release

| Platform | File |
|----------|------|
| Linux x86_64 | `tool-ilorahdavid126-eth-guardian-pxf3jej7-linux-x86_64.tar.gz` |
| macOS ARM64 | `tool-ilorahdavid126-eth-guardian-pxf3jej7-darwin-arm64.tar.gz` |
| macOS x86_64 | `tool-ilorahdavid126-eth-guardian-pxf3jej7-darwin-x86_64.tar.gz` |

[View releases →](https://github.com/Chibey-max/eth-guardian-anna-app/releases)

## Repository Structure
eth-guardian-anna-app/

├── bundle/              # Anna App UI (HTML/CSS/JS)

│   ├── index.html       # Dashboard with 4 tabs

│   ├── style.css        # Cyberpunk dual-theme design

│   └── app.js           # Anna SDK + local sim engine

├── executas/

│   └── eth-guardian/    # Node.js Executa plugin

│       ├── plugin.js    # JSON-RPC stdio handler

│       └── executa.json # Tool metadata + binary config

├── skills/

│   └── eth-safety/      # Declarative SKILL.md protocol

├── .github/

│   └── workflows/

│       └── build-eth-guardian-binary.yml  # Multi-platform CI

├── app.json             # Anna App manifest

└── manifest.json        # Executa manifest

## Judging Criteria Alignment

| Criterion | How ETH Guardian delivers |
|-----------|--------------------------|
| Usefulness | Prevents irreversible fund loss for anyone running an onchain AI agent |
| Working demo | Full flow: policy check → risk explanation → human approval queue |
| Meaningful use of AI | AI translates raw calldata to plain-English risk summaries |
| Fit with Anna | Human-in-the-loop is Anna's core model — Guardian runs natively on it |
| Creativity | Safety layer as an Anna App is a novel use of the platform |

## Built for

[Anna AI-Native App Hackathon](https://dorahacks.io/hackathon/2204/detail) — June 2026

**Submission:** [dorahacks.io/buidl/45375](https://dorahacks.io/buidl/45375)

**Author:** [0x_Dave](https://github.com/Chibey-max)
