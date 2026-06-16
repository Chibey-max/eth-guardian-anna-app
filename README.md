# ETH Guardian

Human-in-the-loop safety for autonomous Ethereum agents, built as an Anna AI-Native App for the Anna AI-Native App Hackathon.

ETH Guardian gives an autonomous Ethereum agent a control layer before it sends transactions. It validates proposed calls against policy rules, explains calldata in plain English, and routes sensitive actions into a human approval queue inside Anna.

## Hackathon submission

- **Hackathon:** Anna AI-Native App Hackathon
- **Track fit:** AI-native workflow, developer tools, AI agents, productivity, human review
- **Repository:** https://github.com/Chibey-max/eth-guardian-anna-app
- **Project type:** Shareable Anna app with bundled Executa tool and skill workflow

## What it does

ETH Guardian is designed for developers running autonomous trading, yield, treasury, or wallet agents. Instead of letting an agent execute blindly, the app adds a safety checkpoint:

1. Check the target, value, token, and function selector against guardian policy.
2. Explain the transaction risk in developer-friendly language.
3. Require explicit human approval for high-risk actions.
4. Record pending approvals and decisions for later review.

The project includes:

- `eth-guardian` Executa plugin with four tools: `check_policy`, `explain_risk`, `request_approval`, and `get_status`.
- `eth-safety` skill that tells Anna how to reason about transaction safety and approval flow.
- Static Anna app UI with dashboard, policy checker, risk explainer, pending queue, policy view, and history view.
- Demo fixtures for happy-path and critical-deny workflows.

## Why it matters

Autonomous crypto agents can be useful, but every wallet action has real consequences. A single bad approval, proxy upgrade, ownership transfer, or large spend can cause permanent loss. ETH Guardian keeps AI useful while making the human the final authority for risky transactions.

## Meaningful use of AI

Anna is not just a chatbot wrapper here. The app uses Anna as the coordination layer between the developer, the autonomous agent, and the guardian tools:

- Anna calls `check_policy` before commenting on a transaction.
- Anna calls `explain_risk` to translate low-level calldata into a concise risk summary.
- Anna uses the `eth-safety` skill to follow a consistent approval protocol.
- Anna writes approval events back into the conversation so decisions stay visible.

## Fit with Anna

ETH Guardian uses the Anna app model directly:

- `manifest.json` declares the app UI, permissions, bundled Executas, and host APIs.
- `executas/eth-guardian/plugin.js` exposes the runtime tool surface over JSON-RPC stdio.
- `skills/eth-safety/SKILL.md` defines the conversational workflow and hard safety rules.
- `bundle/` contains the static app interface loaded by Anna.

## Run locally

Requirements:

- Node.js 18 or newer
- Anna developer tooling with `anna-app dev`

Install dependencies if needed, then run:

```bash
npm run dev
```

Smoke-test the bundled Executa plugin:

```bash
npm run test:plugin
```

## Demo flow

1. Open the ETH Guardian Anna app.
2. Paste a transaction target and calldata into **Check Transaction**.
3. Run **Check Policy** to get `ALLOW` or `DENY`.
4. Run **Explain Risk** to translate the calldata into a plain-English summary.
5. Submit a sensitive action to the approval queue.
6. Approve or deny it from the pending queue.

## Example safety checks

ETH Guardian currently recognizes and flags:

- ERC-20 transfers and approvals
- Unlimited token approvals
- Uniswap swaps
- Aave deposits and withdrawals
- Proxy upgrades
- Ownership transfers and renounces
- Unknown function selectors
- ETH value thresholds
- Whitelisted targets, selectors, and tokens

## Repository structure

```text
.
├── app.json                         # App marketplace metadata
├── manifest.json                    # Anna app manifest
├── bundle/                          # Static app UI
├── executas/eth-guardian/           # Executa stdio plugin
├── skills/eth-safety/               # Anna safety workflow skill
└── fixtures/                        # Demo conversation fixtures
```

## Privacy

ETH Guardian stores local guardian state under the user's home directory at `~/.anna/eth-guardian/state.json`. The app does not include private keys, seed phrases, or signing logic. It is a review and approval layer, not a wallet.

## Current status

This is a hackathon prototype. It is built to demonstrate the workflow and app integration clearly. Before production use, it should be connected to live ABI decoding, stronger policy configuration, chain-aware token metadata, and a real wallet or agent execution environment.
