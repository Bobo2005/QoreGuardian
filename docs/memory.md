# Project Memory: QoreGuardian

> **Purpose:** Single source of truth for persistent decisions, verified QoreChain endpoints/addresses, constraints, and hackathon rules across sessions and agents.

---

## 1. Identity & Positioning
- **Project:** QoreGuardian — Autonomous Post-Quantum Treasury Guardian
- **Event:** QoreChain Developer Fest 2026 (*"Build Before Q-Day"*, Nov 4 – Dec 2, 2026)
- **Track:** Post-Quantum AI Agents (Advanced Track A)
- **Target Awards:** 1st Place + Q-Day Survivor + Best AI-Native Build + People's Choice
- **Core Tagline:** *"They leash agents so they can spend. We built a guardian that protects."*

---

## 2. Verified QoreChain Testnet Configuration
- **Cosmos Chain ID:** `qorechain-diana`
- **EVM Chain ID (EIP-155):** `9800` (`0x2648`)
- **Currency Symbol:** `QOR` (Testnet tokens: `fUSD`, `fETH`, `fBTC`)
- **EVM JSON-RPC:** `https://evm-testnet.qore.host`
- **Consensus RPC:** `https://rpc-testnet.qore.host`
- **Block Explorer:** `https://explore.qore.network`
- **Kits Portal:** `https://build.qorechain.io/kits`

---

## 3. Verified QoreChain Primitives & Tooling
- **Scaffolder:** `npm create qorechain-dapp@latest`
- **Packages:** `@qorechain/sdk`, `@qorechain/pqc`, `@qorechain/evm`, `@qorechain/qore-cli` (`qore`)
- **MCP Server:** `qorechain-mcp` (`pip install qorechain-mcp` / `uvx qorechain-mcp`)
- **`pqcVerify` Precompile Address:** `0x0000000000000000000000000000000000000A01` (verifies `ML-DSA-87` signatures on-chain)
  - **Solidity / ABI Signature:** `pqcVerify(bytes pubkey, bytes signature, bytes message) external view returns (bool valid)` (verified in `@qorechain/evm` `IQORE_PQC_ABI`)
  - **Byte Encoding (`@qorechain/pqc` `mldsa87`):** Standard ABI-encoded call with raw `bytes pubkey` (2,592 bytes), raw `bytes signature` (4,627 bytes), and raw `bytes message` (arbitrary length, e.g. ABI-encoded/packed payload or 32-byte digest). Returns ABI-encoded `bool`.
  - **Other Active Testnet Precompiles:** `pqcKeyStatus` (`0x...0A02`), `aiRiskScore` (`0x...0B01`), `aiAnomalyCheck` (`0x...0B02`), `rlConsensusParams` (`0x...0C01`).
- **AI Pre-Flight:** `simulateWithRiskScore` (returns gas estimate + AI anomaly/risk verdict)
- **Scoped EVM Windows:** `MsgOpenEVMWindow` / `openEvmWindowMsg` supporting `allowedTargets`, `nativeOnly`, and block/tx/fee caps

---

## 4. Locked Architectural Decisions
1. **4-Layer Defense-in-Depth:** Protocol Scoped EVM Window (`allowedTargets` = `[GuardianAccount]`) → `GuardianAccount.sol` hard caps → Explainable AI Agent Brain (0–100 Risk Score + reasoning) → `RecoveryVault.sol` gated by `pqcVerify` (`0x...0A01`).
2. **Strict Privilege Separation:** The Guardian Agent can *only* `reduceLimits`, `freeze`, or `forceMoveToVault`. It can **never** raise limits, unfreeze, or edit the allowlist.
3. **Dead-Man's Switch:** `emergencyEvacuate()` on `GuardianAccount.sol` allows the human owner to evacuate funds directly with an `ML-DSA-87` proof even if the AI agent is offline.
4. **Hero Demo Flow:** Published classical testnet key → **"Try to Drain Wallet with Leaked Key"** → spending cap bounds initial attempt → AI Risk Score spikes → `freeze()` + `forceMoveToVault()` → human owner unlocks `RecoveryVault` with fresh `ML-DSA-87` signature.
5. **Ruthless Scope Control:** Do not add multi-chain, trading, or DeFi yield features. `QoreSeal` encrypted logs are strictly optional if ahead of schedule in Week 2.

---

## 5. Deployed Contract Addresses & Testnet Wallets (Update When Deployed)
- `RecoveryVault.sol`: `0xc02bfd69e71054b7aca6a14f9ffb177de4ed1f3e` ([Explorer](https://explore.qore.network/address/0xc02bfd69e71054b7aca6a14f9ffb177de4ed1f3e) | [Deploy Tx](https://explore.qore.network/tx/0x780c6b996f9792d7c6f46ebbb8e28d6ba317969cdfe8fa6231f60c4273645993))
- `GuardianAccount.sol`: `0x30dee7f6fc99d5c0596db47daac68b61e36bd21c` ([Explorer](https://explore.qore.network/address/0x30dee7f6fc99d5c0596db47daac68b61e36bd21c) | [Deploy Tx](https://explore.qore.network/tx/0xb70dbd5d1f4acacfa2283ff60126456ccc9431497bec82131d433bb46a37c89a) | [Fund 0.1 QOR Tx](https://explore.qore.network/tx/0x477784c604d4cc7e3eb48c64a721b13f3faf7c0dcf33422c63ed5144786f2661))
- `Owner PQC Registration on RecoveryVault`: [Tx](https://explore.qore.network/tx/0xcfa46b3fb0da0fb4e992fb985d7edd5633f953a5df8f4ceb4f79b149f496d6ac)
- `Demo Treasury Address`: `0x30dee7f6fc99d5c0596db47daac68b61e36bd21c` (`GuardianAccount.sol`)
- **Testnet-Only Addresses** (keys stored locally in gitignored `.env.testnet.local`):
  - `Deployer`: `0xA7eAE1E5e2B25e921e6c5C63ea85D06B6eCB97b6` (`qor15l4wre0zkf0fy8nvt3374pwsddhvh9akqtq79s`)
  - `Owner (EVM)`: `0xA7eAE1E5e2B25e921e6c5C63ea85D06B6eCB97b6` (`qor15l4wre0zkf0fy8nvt3374pwsddhvh9akqtq79s`)
  - `Owner ML-DSA-87 PubKey Hash (keccak256)`: `0x49312976c8c3c2ae83ddcd9f93e8ecddcd2307eb8c16ac31803a3fea5e66162a`
  - `Guardian Agent`: `0x43338fa8A44529Ec1E68F699FA566e1586ccbF3F` (`qor1gvecl29yg557c8ng76vl54nwzkrve0el3rlywv`)
  - `Q-Day Throwaway Address (Testnet-Only)`: `0x50dD5f7A7Cb1978cd07f2687D36C2Ac4F2076c79` (`qor12rw477nukxtce5rly6raxmp2cneqwmrewhvy7x`)
- `Published Demo Classical Private Key (Testnet-Only!)`: `<Stored in .env.testnet.local as QDAY_THROWAWAY_PRIVATE_KEY — publish in UI/docs in Phase 15>`

---

## 6. Verified Phase Progress & SDK Quirks
- **Phases 1–2:** `web/` scaffolded (`create-qorechain-dapp`); `contracts/` Foundry project configured for `qorechain-diana` (`9800`).
- **Phase 3:** `scripts/phase3-setup-and-probe.mjs` generated testnet-only keys in `.env.testnet.local` and verified `pqcVerify` (`0x...0A01`).
- **Phases 4–7:** Implemented `contracts/src/interfaces/IPQCVerify.sol`, `contracts/src/RecoveryVault.sol`, `contracts/src/GuardianAccount.sol`, and Foundry test suites (`contracts/test/GuardianAccount.t.sol`, `contracts/test/RecoveryVault.t.sol`).
- **Phase 8:** Verified Scoped EVM Window live on `qorechain-diana` via `scripts/phase8-scoped-window.ts`:
  - Guardian ML-DSA-87 key registered on-chain (`qor1gvecl29yg557c8ng76vl54nwzkrve0el3rlywv`).
  - `MsgOpenEVMWindow` opened (`openedHeight=10155557`, `expiryHeight=10155857`, `maxTxs=10`, `maxValue=5000000`).
  - Allowed target tx succeeded: `0x6a237ad98cc5245b98b1a3640d032fa74737c961284770946c211aeedc7c1007`.
  - Disallowed target (`0x000000000000000000000000000000000000dEaD`) rejected by protocol.
  - **SDK (`@qorechain/sdk`) notes:** `buildRegisterPqcKeyMsg(sender, { pqcKeypair, ecdsaPubkey, proofOfPossession })` requires `ecdsaPubkey` as `Uint8Array` and `signProofOfPossession` when `CHAIN_UPGRADE_V3_2_3` is active; `EthNativeSigner.signAndBroadcast` requires a transport implementing `broadcastTx(txRawBytes)` (e.g. REST `POST /cosmos/tx/v1beta1/txs` + `waitForTx`, not `sdkClient.rest`).
- **Phase 9:** Deployed `RecoveryVault.sol` (`0xc02bfd69e71054b7aca6a14f9ffb177de4ed1f3e`) and `GuardianAccount.sol` (`0x30dee7f6fc99d5c0596db47daac68b61e36bd21c`) to `qorechain-diana` via `scripts/phase9-deploy.ts` (after opening an unscoped Deployer EVM window via `scripts/open-deployer-evm-window.ts`), funded `GuardianAccount` with `0.1 QOR`, and registered `OWNER_PQC_PUBKEY_HASH` on `RecoveryVault`.
- **Phase 10:** Scaffolded `agent/` (`viem`, `@qorechain/sdk`, TypeScript); `tsc --noEmit` passes and `npm run check:live` reads live `GuardianAccount` and `RecoveryVault` state from `qorechain-diana`.
- **Phase 11:** Implemented `agent/src/riskEngine.ts` (`simulateWithRiskScore` + deterministic contextual anomaly scoring + prompt-injection & leaked-key detection); 5/5 unit tests pass in `agent/src/riskEngine.test.ts`.
- **Phase 12:** Implemented `agent/src/defender.ts`, `agent/src/monitor.ts`, and `agent/src/server.ts`; verified live autonomous `forceMoveToVault()` on `qorechain-diana` via `agent/src/verify-phase12.ts` ([Tx](https://explore.qore.network/tx/0x783c14e7707f3bf502960a3d359925d2fb7d1475112eed34abfb1fb3a5582253)), freezing `GuardianAccount` and evacuating `0.1 QOR` to `RecoveryVault`.
- **Phase 13:** Built `web/` dashboard core (Vite + React + TypeScript) with QoreX / EIP-1193 wallet connection for `qorechain-diana` (`9800`) and live **Treasury Status Card** (`GuardianAccount`, `RecoveryVault`, `isFrozen`, limits, Scoped EVM Window); `tsc --noEmit && vite build` passes.
- **Phase 14:** Built `web/src/components/ExplainableAiFeed.tsx` with animated 0–100 Risk Score gauge, SSE `/api/events` subscription, plain-English `reasons[]`, action badges (`REDUCED_LIMITS`, `FROZEN`, `EVACUATED`), and `explore.qore.network` links; `tsc --noEmit && vite build` passes.
- **Phase 15:** Built `web/src/components/QDayAttackerPanel.tsx` displaying the dedicated throwaway testnet key (`0x50dD5f7A7Cb1978cd07f2687D36C2Ac4F2076c79`) and **"Try to Drain Wallet with Leaked Key"** trigger that probes/executes on-chain and triggers `agent/` autonomous evacuation; `tsc --noEmit && vite build` passes.
- **Phase 16:** Built `web/src/components/PromptInjectionPanel.tsx` (AI rejection + on-chain cap simulation) and `web/src/components/PqcRecoveryPanel.tsx` (fresh `ML-DSA-87` proof via `pqcSign` + `RecoveryVault.withdrawWithPQC()`); `tsc --noEmit && vite build` passes.
- **Phase 17:** Ran 3 consecutive end-to-end testnet drills on `qorechain-diana` via `agent/src/verify-phase17.ts` (Reset/Fund → Prompt Injection → Classical Key Leak → `forceMoveToVault()` → `ML-DSA-87` `withdrawWithPQC()` → `emergencyEvacuate()`); all 3 passed (`0x8f0b...`, `0x02de...`, `0x8f87...`).
