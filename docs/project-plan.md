# Project Plan: QoreGuardian

**Timeline:** 15 November 2026 – 2 December 2026 (17 Days Remaining)  
**Hackathon:** QoreChain Developer Fest 2026 — *"Build Before Q-Day"*  
**Submission Deadline:** 2 December 2026  

---

## 1. Strategic Objectives

1. **Win 1st Place in Post-Quantum AI Agents (Advanced Track A)** via unmatched defensive positioning and deep QoreChain-native execution.
2. **Win *Q-Day Survivor*** by running a live, openly verifiable classical-key-leak drill on QoreChain Testnet (`qorechain-diana`).
3. **Win *Best AI-Native Build*** via an explainable AI Risk Engine (`0–100` + reasoning), `simulateWithRiskScore` integration, Prompt Injection defense demo, and a crisp `AI_USAGE.md`.
4. **Win *People's Choice* (QoreX)** by hosting a public, zero-setup live testnet dashboard anyone can test in 10 seconds.

---

## 2. Phase-by-Phase Schedule

### Week 1: Foundation & Core Contracts (15 Nov – 21 Nov)
- **Days 1–2 (15–16 Nov):**
  - Initialize GitHub repo `qoreguardian` (all commits strictly within hackathon window).
  - Scaffold workspace with `npm create qorechain-dapp@latest`.
  - Install & configure `qorechain-mcp` / `@qorechain/qore-cli` (`qore`) and Foundry.
  - Obtain testnet `QOR` / `fUSD` / `fETH` on `qorechain-diana` (EVM Chain ID `9800`).
- **Days 3–5 (17–19 Nov):**
  - Implement `IPQCVerify.sol` (`0x...0A01`), `RecoveryVault.sol`, and `GuardianAccount.sol` (including `emergencyEvacuate()` Dead-Man's Switch).
  - Write comprehensive Foundry unit & invariant/fuzz tests (verifying agent *cannot* raise limits, `forceMoveToVault` works, `pqcVerify` rejects invalid sigs and replays).
- **Days 6–7 (20–21 Nov):**
  - Deploy & verify contracts on QoreChain Testnet (`https://evm-testnet.qore.host`).
  - Verify Scoped EVM Window (`openEvmWindowMsg` with `allowedTargets`) end-to-end on testnet.

### Week 2: AI Brain, Dashboard & Simulations (22 Nov – 28 Nov)
- **Days 8–10 (22–24 Nov):**
  - Build `agent/` service (Node.js + TypeScript + `viem` + `@qorechain/sdk`).
  - Implement Explainable Risk Engine (`0–100` score + reasons) + `simulateWithRiskScore` pre-flight integration + automatic escalation (`reduceLimits` → `freeze` → `forceMoveToVault`).
- **Days 11–13 (25–27 Nov):**
  - Build Next.js 15 Dashboard: live telemetry, Explainable AI Feed, **"Try to Drain Wallet with Leaked Key"** panel, **"Simulate Prompt Injection Attack"** panel, and **Post-Quantum Recovery** panel.
- **Day 14 (28 Nov):**
  - End-to-end integration testing on `qorechain-diana` testnet.
  - *Optional Stretch:* Only if ahead of schedule, add `QoreSeal` encrypted threat audit logs.

### Week 3: Polish, Video, Docs & Submission (29 Nov – 2 Dec)
- **Day 15 (29 Nov):**
  - Deploy public dashboard URL (e.g., Vercel) + hosted agent API.
  - Stress-test public Q-Day drill flow from a fresh browser.
- **Day 16 (30 Nov):**
  - Write final `README.md` (with deployed addresses & `https://explore.qore.network` links) and `AI_USAGE.md`.
  - Record and edit the **≤ 3-minute hero demo video**.
- **Day 17 (1–2 Dec):**
  - Run final integrity check (no leaked real secrets, clean repo, working links).
  - Submit to QoreChain Developer Fest 2026 & share public demo for QoreX *People's Choice* voting.

---

## 3. Risk Register & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `pqcVerify` precompile payload formatting mismatch | High | Test directly against `qorechain-diana` testnet in Week 1 using `@qorechain/pqc` test vectors |
| Scoped EVM window expires during live demo | Medium | Show window status & renewal flow clearly in dashboard; keep generous demo block window |
| Scope creep delays core demo | High | Freeze feature list after Day 10; `QoreSeal` is strictly optional |
| Public testnet faucet/rate limits during demo | Medium | Pre-fund demo accounts and add clear UI loading/tx-pending states |
