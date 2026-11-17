# 20-Phase Execution Prompt Playbook: QoreGuardian

> **How to use:** Run each phase prompt sequentially with your coding agent. Do not advance to the next phase until the **Verification Gate** passes. Keep `docs/memory.md` and `docs/TODO.md` updated as you go.

---

## Phase 1: Repository & `create-qorechain-dapp` Scaffold
**Prompt:**
> Initialize a clean Git repository for `QoreGuardian` in the workspace (preserving `plan.md` and `docs/`). Scaffold the starter app using `npm create qorechain-dapp@latest` into `web/` (or root monorepo structure matching `docs/architecture.md`). Inspect all generated QoreChain skill files, `.env.example`, and package versions (`@qorechain/sdk`, `@qorechain/pqc`, `@qorechain/evm`). Summarize what was scaffolded and update `docs/TODO.md`.

**Verification Gate:** Repo initialized, `create-qorechain-dapp` files present, dependencies installed cleanly.

---

## Phase 2: QoreChain CLI, MCP & Foundry Setup
**Prompt:**
> Install and verify `@qorechain/qore-cli` (`qore --json`) and Foundry (`forge`, `cast`). Create `contracts/` as a Foundry project targeting Solidity `0.8.28`. Configure `foundry.toml` with QoreChain Testnet (`qorechain-diana`, EVM Chain ID `9800`, RPC `https://evm-testnet.qore.host`). Verify connectivity to the testnet RPC.

**Verification Gate:** `forge --version` works and `cast block-number --rpc-url https://evm-testnet.qore.host` returns a live block number.

---

## Phase 3: Testnet Wallet Setup & `pqcVerify` Precompile Probe
**Prompt:**
> Generate dedicated **testnet-only** accounts for Deployer, Owner (with `ML-DSA-87` keypair via `@qorechain/pqc`), Guardian Agent, and the Q-Day Throwaway Classical Key. Fund them via the QoreChain Testnet faucet. Write a small script/test to confirm calling the `pqcVerify` precompile at `0x0000000000000000000000000000000000000A01` with a real `ML-DSA-87` signature from `@qorechain/pqc` returns `true` on `qorechain-diana`.

**Verification Gate:** Live testnet `pqcVerify` call succeeds with a real `ML-DSA-87` signature; exact byte encoding is documented in `docs/memory.md`.

---

## Phase 4: `IPQCVerify.sol` & `RecoveryVault.sol`
**Prompt:**
> Implement `contracts/src/interfaces/IPQCVerify.sol` (for `0x0000000000000000000000000000000000000A01`) and `contracts/src/RecoveryVault.sol` per `docs/architecture.md`. Ensure `RecoveryVault` supports `depositFor(address account)` and `withdrawWithPQC(recipient, amount, nonce, pqcPubKey, pqcSig)` with strict `keccak256(pqcPubKey)` owner matching, replay-protected nonce, and zero classical withdrawal paths.

**Verification Gate:** `forge build` compiles cleanly with zero warnings.

---

## Phase 5: `GuardianAccount.sol` Core & Hard Limits
**Prompt:**
> Implement `contracts/src/GuardianAccount.sol` per `docs/architecture.md` with `perTxLimit`, `dailyLimit`, `spentToday`, `lastResetTimestamp`, `allowlist`, and `isFrozen`. Enforce strict privilege separation: `guardianAgent` can call `reduceLimits`, `freeze`, and `forceMoveToVault`, but **cannot** call `unfreeze`, `setLimits`, or `setAllowlist` (strictly `onlyOwner`).

**Verification Gate:** `forge build` compiles cleanly; privilege separation is explicit on every state-mutating function.

---

## Phase 6: Post-Quantum Dead-Man's Switch (`emergencyEvacuate`)
**Prompt:**
> Add `emergencyEvacuate(bytes calldata pqcPubKey, bytes calldata pqcSig, bytes calldata message)` to `GuardianAccount.sol`. Anyone presenting a valid `ML-DSA-87` signature from the registered owner (verified via `pqcVerify` `0x...0A01` with a replay nonce) must be able to freeze the account and evacuate 100% of funds to `RecoveryVault.sol` even if the AI agent is offline.

**Verification Gate:** `forge build` compiles cleanly and `emergencyEvacuate` emits a clear `EmergencyEvacuated` event.

---

## Phase 7: Comprehensive Foundry Unit & Fuzz Tests
**Prompt:**
> Write thorough Foundry tests in `contracts/test/GuardianAccount.t.sol` and `RecoveryVault.t.sol` (mocking `0x...0A01` via `vm.etch` for local fast tests). Test: (1) per-tx, daily, and allowlist enforcement, (2) agent cannot raise limits or unfreeze, (3) `forceMoveToVault` freezes and transfers 100% balance, (4) `emergencyEvacuate` works when agent is offline, (5) `RecoveryVault` rejects invalid/replayed PQC signatures. Run `forge test -vvv`.

**Verification Gate:** 100% of unit and fuzz tests pass with `forge test -vvv`.

---

## Phase 8: Scoped EVM Window Verification
**Prompt:**
> Create a TypeScript script using `@qorechain/sdk` and `@qorechain/pqc` that opens a Scoped EVM Window (`openEvmWindowMsg`) for the Guardian Agent with `allowedTargets` locked strictly to `GuardianAccount.sol` and bounded block/tx/fee caps. Verify on `qorechain-diana` testnet that calls to `GuardianAccount` succeed while calls to any other address are rejected by the protocol.

**Verification Gate:** Protocol-level `allowedTargets` scoping verified on `qorechain-diana`.

---

## Phase 9: Deploy & Verify Contracts on QoreChain Testnet
**Prompt:**
> Write `contracts/script/Deploy.s.sol` and deploy `RecoveryVault.sol` and `GuardianAccount.sol` to `qorechain-diana` (`https://evm-testnet.qore.host`). Fund the deployed `GuardianAccount` with testnet `QOR`. Verify contracts if supported on `explore.qore.network`. Record all deployed addresses and explorer links in `docs/memory.md` and `docs/TODO.md`.

**Verification Gate:** Live contract addresses confirmed on `https://explore.qore.network` and funded with testnet `QOR`.

---

## Phase 10: Off-Chain Agent Scaffold (`agent/`)
**Prompt:**
> Scaffold `agent/` with Node.js, TypeScript, `viem`, `@qorechain/sdk`, and `@qorechain/evm`. Configure typed contract ABIs for `GuardianAccount` and `RecoveryVault`, RPC client for `https://evm-testnet.qore.host` (Chain ID `9800`), and a clean `.env.example`.

**Verification Gate:** `agent/` builds with `tsc --noEmit` and reads live `GuardianAccount` state from `qorechain-diana`.

---

## Phase 11: Explainable AI Risk Engine & `simulateWithRiskScore`
**Prompt:**
> Implement `agent/src/riskEngine.ts`. Integrate QoreChain's `simulateWithRiskScore` pre-flight check alongside contextual anomaly scoring (amount vs. baseline, unknown recipient, velocity spike, leaked-key signal, prompt-injection patterns). Output a deterministic JSON verdict with `riskScore` (0–100), `action` (`ALLOW`, `REDUCE_LIMITS`, `FREEZE`, `FREEZE_AND_FORCE_MOVE`), and plain-English `reasons[]`.

**Verification Gate:** Unit tests verify deterministic scoring across normal, suspicious, prompt-injection, and key-leak scenarios.

---

## Phase 12: Automated Defender Loop & Telemetry Server
**Prompt:**
> Implement `agent/src/monitor.ts`, `agent/src/defender.ts`, and `agent/src/server.ts`. Watch `GuardianAccount` events and incoming simulation requests, execute `reduceLimits` / `freeze` / `forceMoveToVault` automatically when thresholds are crossed, and stream real-time telemetry (Risk Score, reasons, tx hashes) over SSE/WebSocket + REST to the frontend.

**Verification Gate:** Triggering a high-risk event in a test script automatically executes `forceMoveToVault()` on `qorechain-diana` and logs the explorer tx hash.

---

## Phase 13: Dashboard Core & QoreX Wallet Integration
**Prompt:**
> In `web/`, configure Next.js 15 + Tailwind + RainbowKit / QoreX wallet adapter for Chain ID `9800` (`qorechain-diana`). Build the **Treasury Status Card** showing live `GuardianAccount` balance, `RecoveryVault` balance, `isFrozen` status, `perTxLimit`, `dailyLimit`, and active Scoped EVM Window status.

**Verification Gate:** Dashboard loads cleanly, connects to `qorechain-diana`, and displays live on-chain balances and limits.

---

## Phase 14: Explainable AI Live Feed UI
**Prompt:**
> Build the **Explainable AI Feed** component in `web/` connected to `agent/`'s live stream. Display an animated Risk Score gauge (0–100), plain-English reasoning bullets for every evaluation, defensive action badges (`REDUCED_LIMITS`, `FROZEN`, `EVACUATED`), and clickable `https://explore.qore.network/tx/...` links.

**Verification Gate:** Every agent evaluation and defensive action appears in the UI within 2 seconds with clickable explorer links.

---

## Phase 15: Q-Day Attacker Panel ("Try to Drain Wallet with Leaked Key")
**Prompt:**
> Build the **Q-Day Attacker Panel** in `web/`. Display the dedicated throwaway classical testnet private key openly on-screen with a **"Try to Drain Wallet with Leaked Key"** button. Clicking it fires real testnet drain transactions using that leaked key—proving on-chain limits bound the initial attempt while the AI Guardian freezes the account and evacuates remaining funds to `RecoveryVault`.

**Verification Gate:** Clicking the button executes real testnet transactions, triggers automatic evacuation, and leaves `GuardianAccount` empty & frozen while funds sit safely in `RecoveryVault`.

---

## Phase 16: Prompt Injection Lab & Post-Quantum Recovery Panel
**Prompt:**
> Build two panels in `web/`: (1) **"Simulate Prompt Injection Attack"** sending a malicious payload trying to trick the agent into draining 100% of funds—showing both AI rejection and on-chain cap enforcement; (2) **Post-Quantum Recovery Panel** allowing the human owner to sign a fresh `ML-DSA-87` proof and call `RecoveryVault.withdrawWithPQC()` to reclaim rescued funds.

**Verification Gate:** Prompt injection is blocked and logged; `ML-DSA-87` withdrawal from `RecoveryVault` succeeds on `qorechain-diana`.

---

## Phase 17: End-to-End Testnet Dress Rehearsal & Optional Stretch
**Prompt:**
> Run 3 full end-to-end drills on `qorechain-diana` (Reset/Fund → Prompt Injection → Classical Key Leak → Auto-Evacuate → `ML-DSA-87` Recovery → Dead-Man's Switch test). Fix any UX friction, loading states, or RPC retry issues. *(Only if ahead of schedule: optionally add `QoreSeal` encrypted threat log export).*

**Verification Gate:** 3 consecutive drills succeed with zero manual database/contract hacks.

---

## Phase 18: Public Hosting & Zero-Setup Demo Readiness
**Prompt:**
> Deploy `web/` (e.g., Vercel) and `agent/` publicly, pointing to the live `qorechain-diana` contracts. Test the public URL in an incognito browser to confirm any judge or QoreX *People's Choice* voter can run the **"Try to Drain Wallet with Leaked Key"** drill in under 10 seconds without local setup.

**Verification Gate:** Public URL works end-to-end from a clean browser with zero console errors.

---

## Phase 19: Documentation (`README.md`, `AI_USAGE.md`) & ≤ 3-Min Demo Video
**Prompt:**
> Write a polished root `README.md` (with the positioning statement, 4-layer architecture diagram, deployed contract addresses + `explore.qore.network` links, live demo URL, and local quickstart) and `AI_USAGE.md` (documenting both the in-product explainable risk engine and AI build workflow for *Best AI-Native Build*). Prepare the ≤ 3-minute video script following `plan.md` Section 8.

**Verification Gate:** `README.md` and `AI_USAGE.md` are complete, accurate, and all links resolve.

---

## Phase 20: Final Integrity Check & Hackathon Submission
**Prompt:**
> Run a final pre-submission audit across the entire repository: verify zero real private keys or secrets are committed, all commits fall within Nov 4 – Dec 2, 2026, `forge test` passes, `web/` and `agent/` build cleanly, and the live testnet demo + ≤ 3-minute video are attached. Update `docs/TODO.md` and `docs/handoff.md` with final submission details.

**Verification Gate:** Ready to submit to **QoreChain Developer Fest 2026** (Post-Quantum AI Agents Track) and share for **QoreX People's Choice** voting.
