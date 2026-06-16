# ETH Guardian

Human-in-the-loop safety for autonomous Ethereum agents, built as an Anna AI-Native App for the Anna AI-Native App Hackathon.

ETH Guardian gives an autonomous Ethereum agent a control layer before it sends transactions. It validates proposed calls against policy rules, explains calldata in plain English, performs read-only Sepolia/RPC verification when configured, and routes sensitive actions into a human approval queue inside Anna.

## Hackathon submission

- **Hackathon:** Anna AI-Native App Hackathon
- **Track fit:** AI-native workflow, developer tools, AI agents, productivity, human review
- **Repository:** https://github.com/Chibey-max/eth-guardian-anna-app
- **Project type:** Shareable Anna app with bundled Executa tool and skill workflow
- **DoraHacks page:** https://dorahacks.io/hackathon/2204/detail
- **Anna developer docs:** https://anna.partners/developers

## Submission links

- Project artifact: https://github.com/Chibey-max/eth-guardian-anna-app
- Anna Developer Hub: https://anna.partners/developers
- Anna docs manifest for AI agents: https://anna.partners/llms.txt
- DoraHacks hackathon page: https://dorahacks.io/hackathon/2204/detail
- Reference video 1: https://www.youtube.com/watch?v=GL2JD6pLZ78&t=23s
- Reference video 2: https://www.youtube.com/watch?v=-UUcczhYPgE&t=1s

## What it does

ETH Guardian is designed for developers running autonomous trading, yield, treasury, or wallet agents. Instead of letting an agent execute blindly, the app adds a safety checkpoint:

1. Check the target, value, token, and function selector against guardian policy.
2. Explain the transaction risk in developer-friendly language.
3. Require explicit human approval for high-risk actions.
4. Record pending approvals and decisions for later review.

The project includes:

- `eth-guardian` Executa plugin with five tools: `check_policy`, `explain_risk`, `verify_onchain`, `request_approval`, and `get_status`.
- `eth-safety` skill that tells Anna how to reason about transaction safety and approval flow.
- Static Anna app UI with dashboard, policy checker, risk explainer, live verification panel, pending queue, policy view, and history view.
- Demo fixtures for happy-path and critical-deny workflows.

## Why it matters

Autonomous crypto agents can be useful, but every wallet action has real consequences. A single bad approval, proxy upgrade, ownership transfer, or large spend can cause permanent loss. ETH Guardian keeps AI useful while making the human the final authority for risky transactions.

## Meaningful use of AI

Anna is not just a chatbot wrapper here. The app uses Anna as the coordination layer between the developer, the autonomous agent, and the guardian tools:

- Anna calls `check_policy` before commenting on a transaction.
- Anna calls `explain_risk` to translate low-level calldata into a concise risk summary.
- Anna calls `verify_onchain` for read-only Sepolia/RPC verification when an RPC URL is configured.
- Anna uses the `eth-safety` skill to follow a consistent approval protocol.
- Anna writes approval events back into the conversation so decisions stay visible.

## Fit with Anna

ETH Guardian uses Anna's three building blocks directly: Tools, Skills, and Apps.

- `manifest.json` declares the Anna App UI, permissions, bundled Executas, behavior, and host APIs.
- `executas/eth-guardian/plugin.js` exposes the runtime tool surface over JSON-RPC 2.0 on stdio.
- `skills/eth-safety/SKILL.md` defines the conversational workflow and hard safety rules.
- `bundle/` contains the embedded HTML, CSS, and JavaScript interface loaded by Anna.
- The app can be mentioned in chat as `#eth-guardian`, giving the conversation access to the UI, tool, and safety workflow together.

## Judging criteria fit

- **Usefulness and user value:** gives developers a practical safety layer for autonomous Ethereum agents.
- **Working demo:** includes a static Anna UI, runnable Executa plugin, local preview, automated tests, and demo fixtures.
- **Meaningful use of AI:** Anna coordinates policy checks, risk explanations, approval workflow, and chat-visible decisions.
- **Fit with Anna:** uses Anna app manifests, bundled Executa tools, SKILL.md behavior, storage, chat, and embedded UI.
- **Creativity and execution:** applies AI-native app patterns to a high-stakes web3 workflow where human review matters.

## Run and verify

Requirements:

- Node.js 18 or newer
- Anna developer tooling with `anna-app dev` for the full Anna runtime
- Optional Sepolia RPC endpoint for live read-only checks

Run the automated Executa test suite:

```bash
npm test
```

Configure live Sepolia verification:

```bash
cp .env.example .env
```

Set `SEPOLIA_RPC_URL` in `.env` or export it before launching Anna:

```bash
export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/YOUR_KEY"
```

Run the app locally. If the Anna developer CLI is installed, this launches Anna app dev mode. If not, it falls back to the browser preview:

```bash
npm run dev
```

Run a browser preview of the UI directly:

```bash
npm run dev:preview
```

Then open:

```text
http://127.0.0.1:4173
```

The preview mode uses an in-browser mock of the guardian tools so reviewers can click through the policy check, risk explainer, live verifier, approval queue, and history flow without needing a live Anna desktop runtime.

Run the full Anna app explicitly when the Anna developer CLI is installed:

```bash
npm run dev:anna
```

Smoke-test command for the bundled Executa plugin:

```bash
npm run test:plugin
```

## Demo flow

1. Open the ETH Guardian Anna app.
2. Paste a transaction target and calldata into **Check Transaction**.
3. Run **Check Policy** to get `ALLOW` or `DENY`.
4. Run **Explain Risk** to translate the calldata into a plain-English summary.
5. Run **Verify On-Chain** to check Sepolia chain ID, target code, target balance, allowance context, and `eth_call` simulation.
6. Submit a sensitive action to the approval queue.
7. Approve or deny it from the pending queue.

## Tested behavior

The automated test suite starts the Executa plugin as a long-running JSON-RPC process and verifies:

- `describe` returns the ETH Guardian manifest and tool list.
- `check_policy` blocks unlimited ERC-20 approvals.
- `explain_risk` marks unlimited approval as `critical`.
- `verify_onchain` reads chain ID, contract code, ETH balance, allowance context, and `eth_call` simulation from a mock Sepolia RPC server.
- `request_approval` can submit, list, and approve pending requests.
- `get_status` returns decision history.
- `health` returns an active state file path.

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
- Sepolia/RPC chain ID checks
- Target contract code and balance checks
- ERC-20 approval spender and current allowance reads
- Read-only `eth_call` simulation

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

ETH Guardian stores local guardian state under the user's home directory at `~/.anna/eth-guardian/state.json`. If that location is not writable, it falls back to a temporary directory so demos do not fail in restricted environments. The app does not include private keys, seed phrases, or signing logic. Sepolia RPC access is read-only. It is a review and approval layer, not a wallet.

## Current status

This is a hackathon prototype, not a production wallet. It intentionally does not sign or send transactions. Before production use, it should be connected to live ABI decoding, stronger policy configuration, chain-aware token metadata, deeper transaction simulation, and a real wallet or agent execution environment.
