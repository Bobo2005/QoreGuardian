# TODO: QoreGuardian Execution Checklist

## Phase 1: Setup & Tooling (Week 1)
- [ ] Create public GitHub repository `qoreguardian`
- [x] Run `npm create qorechain-dapp@latest` and inspect generated skill files & templates
- [ ] Install QoreChain CLI (`@qorechain/qore-cli`) and/or `qorechain-mcp`
- [x] Configure Foundry (`contracts/`) for QoreChain Testnet (`qorechain-diana`, Chain ID `9800`, RPC `https://evm-testnet.qore.host`)
- [x] Fund deployer, owner, and demo treasury wallets with testnet `QOR`

## Phase 2: Smart Contracts (Week 1)
- [x] Create `IPQCVerify.sol` targeting `0x0000000000000000000000000000000000000A01`
- [x] Implement `RecoveryVault.sol` with `depositFor` and `withdrawWithPQC` (`ML-DSA-87` + replay nonce)
- [x] Implement `GuardianAccount.sol` with hard limits (`perTxLimit`, `dailyLimit`, `allowlist`), `reduceLimits`, `freeze`, `forceMoveToVault`, and `emergencyEvacuate` (Dead-Man's Switch)
- [x] Write Foundry tests covering:
  - [x] Agent cannot raise limits, unfreeze, or edit allowlist
  - [x] `forceMoveToVault` freezes & evacuates 100% of funds
  - [x] `RecoveryVault` accepts valid `ML-DSA-87` proof and rejects invalid/replayed proofs
  - [x] `emergencyEvacuate` works when AI agent is offline
- [x] Deploy & verify contracts on `qorechain-diana`; record addresses in `README.md` and `docs/memory.md` (`RecoveryVault`: `0xc02bfd69e71054b7aca6a14f9ffb177de4ed1f3e`, `GuardianAccount`: `0x30dee7f6fc99d5c0596db47daac68b61e36bd21c`)

## Phase 3: Off-Chain AI Guardian Agent (Week 2)
- [x] Scaffold `agent/` (Node.js + TypeScript + `viem` + `@qorechain/sdk`)
- [x] Verify Scoped EVM Window opener/validator on `qorechain-diana` ([scripts/phase8-scoped-window.ts](file:///c:/Users/USER/Downloads/QoreGuardian/scripts/phase8-scoped-window.ts)) (`allowedTargets` locking; wire to `GuardianAccount` address in `agent/`)
- [x] Implement Explainable Risk Engine (0–100 Risk Score + plain-English reasons + `simulateWithRiskScore`) ([agent/src/riskEngine.ts](file:///c:/Users/USER/Downloads/QoreGuardian/agent/src/riskEngine.ts))
- [x] Implement automated escalation (`reduceLimits` → `freeze` → `forceMoveToVault`) ([agent/src/defender.ts](file:///c:/Users/USER/Downloads/QoreGuardian/agent/src/defender.ts), [agent/src/monitor.ts](file:///c:/Users/USER/Downloads/QoreGuardian/agent/src/monitor.ts))
- [x] Expose REST/SSE endpoint for dashboard live feed & simulation triggers ([agent/src/server.ts](file:///c:/Users/USER/Downloads/QoreGuardian/agent/src/server.ts))

## Phase 4: Next.js Dashboard & Simulations (Week 2)
- [x] Connect QoreX / EIP-1193 wallet adapter on Chain ID `9800` ([web/src/lib/qore.ts](file:///c:/Users/USER/Downloads/QoreGuardian/web/src/lib/qore.ts))
- [x] Build Treasury Status Card (balances, limits, freeze badge, Scoped EVM Window) ([web/src/components/TreasuryStatusCard.tsx](file:///c:/Users/USER/Downloads/QoreGuardian/web/src/components/TreasuryStatusCard.tsx))
- [x] Build Explainable AI Feed (live Risk Score gauge + reasoning + `explore.qore.network` links) ([web/src/components/ExplainableAiFeed.tsx](file:///c:/Users/USER/Downloads/QoreGuardian/web/src/components/ExplainableAiFeed.tsx))
- [x] Build **"Try to Drain Wallet with Leaked Key"** attacker panel (displays published classical key + fires real testnet drain attempts) ([web/src/components/QDayAttackerPanel.tsx](file:///c:/Users/USER/Downloads/QoreGuardian/web/src/components/QDayAttackerPanel.tsx))
- [x] Build **"Simulate Prompt Injection Attack"** panel ([web/src/components/PromptInjectionPanel.tsx](file:///c:/Users/USER/Downloads/QoreGuardian/web/src/components/PromptInjectionPanel.tsx))
- [x] Build **Post-Quantum Recovery** panel (`ML-DSA-87` signature unlock from `RecoveryVault`) ([web/src/components/PqcRecoveryPanel.tsx](file:///c:/Users/USER/Downloads/QoreGuardian/web/src/components/PqcRecoveryPanel.tsx))

## Phase 5: Polish, Video & Submission (Week 3)
- [ ] Deploy live public dashboard & agent backend for zero-setup judging + QoreX *People's Choice*
- [ ] Write `README.md` with 4-layer architecture diagram, positioning statement, and testnet explorer links
- [ ] Write `AI_USAGE.md` for *Best AI-Native Build*
- [ ] Record & edit ≤ 3-minute demo video following storyboard
- [ ] Final integrity check (no real private keys, clean git history, all links live)
- [ ] Submit to QoreChain Developer Fest 2026 before Dec 2, 2026
