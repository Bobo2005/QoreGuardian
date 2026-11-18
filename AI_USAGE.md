# AI Usage & Explainable Risk Architecture (`AI_USAGE.md`)

QoreGuardian uses AI in two distinct ways: **inside the product** as an explainable, bounded defensive risk engine, and **in the engineering workflow** to build, test, and verify the full-stack application.

---

## 1. In-Product AI: Explainable Risk Engine (`agent/src/riskEngine.ts`)

### QoreChain Native AI Precompiles
- **`simulateWithRiskScore` (`@qorechain/sdk` / `@qorechain/evm`):** Before any transaction is approved, `assessTransactionRisk()` runs QoreChain's read-only pre-flight simulation, which queries:
  - `aiRiskScore` (`0x0000000000000000000000000000000000000B01`) for calldata/bytecode risk level
  - `aiAnomalyCheck` (`0x0000000000000000000000000000000000000B02`) for `(sender, value)` anomaly flagging

### Deterministic Contextual Scoring & Explainability
To ensure predictable, auditable behavior (and prevent prompt-injection manipulation of an LLM), `agent/src/riskEngine.ts` combines precompile signals with deterministic policy rules:
- **Leaked Classical Key Signal:** `+90` points (immediate `FREEZE_AND_FORCE_MOVE`)
- **Prompt-Injection Pattern Detection (`detectPromptInjection`):** `+60` points for instruction-override, security-bypass, or drain directives
- **Non-Allowlisted Recipient:** `+25` points
- **Per-Tx / Daily Limit & Baseline Deviation:** `+12` to `+30` points
- **Transaction Velocity Spike:** `+12` (`>=5 tx/hr`) or `+25` (`>=10 tx/hr`)

Every evaluation emits a structured JSON verdict (`riskScore` `0–100`, `action` in `ALLOW | REDUCE_LIMITS | FREEZE | FREEZE_AND_FORCE_MOVE`, and plain-English `reasons[]`) streamed in real time over SSE (`/api/events`) to the dashboard's **Explainable AI Live Feed**.

### Bounded Authority (Zero Trust in the AI)
Even if the off-chain AI agent is compromised, `GuardianAccount.sol` enforces strict on-chain privilege separation:
- `guardianAgent` can **only** call `reduceLimits()`, `freeze()`, and `forceMoveToVault()`.
- `guardianAgent` can **never** call `unfreeze()`, `setLimits()`, `setAllowlist()`, or `execute()`.
- QoreChain's **Scoped EVM Window** (`allowedTargets = [GuardianAccount]`) further restricts the agent at the protocol level.

---

## 2. AI-Assisted Engineering Workflow

- **Coding Assistant:** Used Antigravity (Gemini) across a structured 20-phase execution playbook (`docs/20-phase-prompts.md`) to scaffold contracts, TypeScript agent modules, React dashboard components, and documentation.
- **Verification Discipline:** Every AI-generated change was gated by deterministic checks:
  - `forge build` and `forge test -vvv` for Solidity invariants
  - `tsc --noEmit` and `node --test` (`agent/src/riskEngine.test.ts`) for TypeScript & risk-scoring determinism
  - Live `qorechain-diana` testnet verification scripts (`scripts/phase8-scoped-window.ts`, `scripts/phase9-deploy.ts`, `agent/src/verify-phase12.ts`, and 3 consecutive end-to-end drills in `agent/src/verify-phase17.ts`)
- **Human-in-the-Loop:** All testnet key management, QoreX funding, and live deployment verification were explicitly reviewed and executed by the builder.
