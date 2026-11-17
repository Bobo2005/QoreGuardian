# Handoff Document: QoreGuardian

**Date:** 17 November 2026  
**Current Status:** Phases 1–13 Complete → Ready for Phase 14 (Explainable AI Feed & Real-Time Telemetry UI)

---

## 1. What Has Been Completed
- **Planning & Documentation:** Core hackathon strategy & docs in `plan.md` and `docs/*`.
- **Phases 1–2 (Scaffold & Tooling):**
  - `web/` scaffolded with `create-qorechain-dapp` (`@qorechain/sdk`, `@qorechain/pqc`, `@qorechain/evm`, `viem`).
  - `contracts/` Foundry project configured for `qorechain-diana` (EVM Chain ID `9800`, RPC `https://evm-testnet.qore.host`).
- **Phase 3 (Testnet Wallets & `pqcVerify` Probe):**
  - `scripts/phase3-setup-and-probe.mjs` generated testnet-only keys in `.env.testnet.local` and verified `pqcVerify` (`0x0000000000000000000000000000000000000A01`).
- **Phases 4–7 (Smart Contracts & Tests):**
  - `contracts/src/interfaces/IPQCVerify.sol`
  - `contracts/src/RecoveryVault.sol`
  - `contracts/src/GuardianAccount.sol` (hard limits, privilege separation, `emergencyEvacuate` Dead-Man's Switch)
  - `contracts/test/GuardianAccount.t.sol` and `contracts/test/RecoveryVault.t.sol`
- **Phase 8 (Scoped EVM Window Verification):**
  - `scripts/phase8-scoped-window.ts` registered the Guardian ML-DSA-87 key on-chain, opened a Scoped EVM Window (`openedHeight=10155557`, `expiryHeight=10155857`), confirmed an allowed target tx (`0x6a237ad98cc5245b98b1a3640d032fa74737c961284770946c211aeedc7c1007`), and confirmed protocol rejection for a disallowed target (`0x...dEaD`).

- **Phase 9 (Testnet Deployment & Funding):**
  - `scripts/open-deployer-evm-window.ts` registered Deployer PQC key and opened an EVM window.
  - `scripts/phase9-deploy.ts` deployed `RecoveryVault` (`0xc02bfd69e71054b7aca6a14f9ffb177de4ed1f3e`) and `GuardianAccount` (`0x30dee7f6fc99d5c0596db47daac68b61e36bd21c`) to `qorechain-diana`, funded `GuardianAccount` with `0.1 QOR`, and registered `OWNER_PQC_PUBKEY_HASH` on `RecoveryVault`.

- **Phase 10 (Off-Chain Agent Scaffold):**
  - `agent/` scaffolded with `viem`, `@qorechain/sdk`, typed `GUARDIAN_ACCOUNT_ABI` / `RECOVERY_VAULT_ABI`, and `.env.example`. `tsc --noEmit` and `npm run check:live` verified against `qorechain-diana`.

- **Phase 11 (Explainable AI Risk Engine):**
  - `agent/src/riskEngine.ts` integrates `simulateWithRiskScore` from `@qorechain/sdk` with deterministic contextual scoring (`ALLOW`, `REDUCE_LIMITS`, `FREEZE`, `FREEZE_AND_FORCE_MOVE`) and plain-English `reasons[]`.
  - `agent/src/riskEngine.test.ts` verifies normal, suspicious, prompt-injection, and key-leak scenarios (5/5 passing).

- **Phase 12 (Automated Defender Loop & Telemetry Server):**
  - `agent/src/defender.ts`, `agent/src/monitor.ts`, `agent/src/server.ts`, and `agent/src/verify-phase12.ts` implemented and verified live on `qorechain-diana`.
  - High-risk simulation triggered `forceMoveToVault()` ([Tx](https://explore.qore.network/tx/0x783c14e7707f3bf502960a3d359925d2fb7d1475112eed34abfb1fb3a5582253)), freezing `GuardianAccount` (`0 QOR`) and moving `0.1 QOR` to `RecoveryVault`, with SSE telemetry verified.

- **Phase 13 (Dashboard Core & QoreX Wallet Integration):**
  - `web/src/lib/qore.ts`, `web/src/components/TreasuryStatusCard.tsx`, `web/src/App.tsx`, and `web/src/styles.css` wired to `qorechain-diana` (`9800`) and QoreX/EIP-1193 wallet switching.
  - `tsc --noEmit && vite build` passed.

---

## 2. Current Workspace State
- Root directory: `c:\Users\USER\Downloads\QoreGuardian`
- Present directories: `agent/`, `contracts/`, `docs/`, `scripts/`, `web/`
- Local testnet config: `.env.testnet.local` (gitignored; includes `RECOVERY_VAULT_ADDRESS` and `GUARDIAN_ACCOUNT_ADDRESS`)

---

## 3. Immediate Next Actions (Start Here)
1. **Phase 14:** Build the Explainable AI Feed in `web/` subscribed to `agent/` SSE (`/api/events`).
2. **Phase 15+:** Continue sequentially through `docs/20-phase-prompts.md`.

---

## 4. Critical Guardrails for Next Session
- **Never** commit real private keys or mainnet seeds. The "published classical key" for the Q-Day Drill must remain the dedicated, throwaway `qorechain-diana` testnet key (`QDAY_THROWAWAY_PRIVATE_KEY`) holding only testnet `QOR`.
- **Update `docs/memory.md`** with deployed contract addresses and explorer links immediately after Phase 9.
- **Keep scope tight:** Core contracts + testnet deployment must be locked by **21 Nov 2026**.
