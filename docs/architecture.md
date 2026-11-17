# Technical Architecture: QoreGuardian

**Version:** 1.0  
**Last Updated:** 15 November 2026  
**Target Network:** QoreChain Testnet (`qorechain-diana`)  

---

## 1. Network & QoreChain Primitives Reference

| Parameter | Verified Value |
|---|---|
| **Cosmos Chain ID** | `qorechain-diana` |
| **EVM Chain ID (EIP-155)** | `9800` (`0x2648`) |
| **Native Currency** | `QOR` (Testnet assets: `fUSD`, `fETH`, `fBTC`) |
| **EVM JSON-RPC** | `https://evm-testnet.qore.host` |
| **Consensus RPC** | `https://rpc-testnet.qore.host` |
| **Block Explorer** | `https://explore.qore.network` |
| **`pqcVerify` Precompile** | `0x0000000000000000000000000000000000000A01` |
| **AI Pre-Flight Precompile** | `simulateWithRiskScore` (via `@qorechain/sdk` / `@qorechain/evm`) |
| **Scoped EVM Window** | `MsgOpenEVMWindow` / `openEvmWindowMsg` (`allowedTargets`, `nativeOnly`, block/tx/fee caps) |

---

## 2. 4-Layer Defense-in-Depth Architecture

```text
+-------------------------------------------------------------------------+
|  LAYER 1: PROTOCOL (QoreChain Scoped EVM Window)                        |
|  - Owner opens EVM window via ML-DSA-87 (`MsgOpenEVMWindow`)            |
|  - `allowedTargets`: [GuardianAccount.sol] ONLY                         |
|  - Bounded block duration, tx count, and fee/value caps                 |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|  LAYER 2: SMART ACCOUNT (`GuardianAccount.sol`)                         |
|  - Hard on-chain caps: perTxLimit, dailyLimit, allowlist, timeWindow    |
|  - Guardian Agent role: CAN reduceLimits, freeze, forceMoveToVault      |
|  - Guardian Agent role: CANNOT raiseLimits, unfreeze, or edit allowlist |
|  - Dead-Man's Switch: Owner-only `emergencyEvacuate()`                  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|  LAYER 3: EXPLAINABLE AI AGENT BRAIN (Node.js / TypeScript + viem)      |
|  - Monitors mempool / account events & runs `simulateWithRiskScore`     |
|  - Computes Risk Score (0-100) + plain-English reason                   |
|  - Escalates automatically: reduceLimits -> freeze -> forceMoveToVault  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|  LAYER 4: POST-QUANTUM RECOVERY (`RecoveryVault.sol`)                   |
|  - Receives evacuated funds from GuardianAccount.sol                    |
|  - Withdrawals require fresh human `ML-DSA-87` signature                |
|  - Verified on-chain via `pqcVerify` (0x...0A01)                        |
+-------------------------------------------------------------------------+
```

---

## 3. Smart Contract Specifications

### 3.1 `GuardianAccount.sol`
- **State Variables:**
  - `address public immutable owner` (or owner PQC public key hash)
  - `address public guardianAgent`
  - `address public immutable recoveryVault`
  - `uint256 public perTxLimit`
  - `uint256 public dailyLimit`
  - `uint256 public spentToday`
  - `uint256 public lastResetTimestamp`
  - `bool public isFrozen`
  - `mapping(address => bool) public allowlist`
- **Key Functions:**
  - `execute(address target, uint256 value, bytes calldata data)`: Checks `!isFrozen`, `allowlist[target]`, `value <= perTxLimit`, and `spentToday + value <= dailyLimit`.
  - `reduceLimits(uint256 newPerTx, uint256 newDaily)`: Callable by `guardianAgent` or `owner`. Reverts if `newPerTx > perTxLimit` or `newDaily > dailyLimit`.
  - `freeze()`: Callable by `guardianAgent` or `owner`. Sets `isFrozen = true`.
  - `forceMoveToVault()`: Callable by `guardianAgent` or `owner`. Sets `isFrozen = true` and transfers entire native `QOR` (and configured ERC-20) balance to `recoveryVault`.
  - `emergencyEvacuate(bytes calldata pqcPubKey, bytes calldata pqcSig, bytes calldata message)`: Dead-Man's Switch callable by anyone presenting a valid owner `ML-DSA-87` signature verified via `pqcVerify` (`0x...0A01`), bypassing the AI agent if it is offline.
  - `unfreeze()` / `setLimits()` / `setAllowlist()`: **Strictly `onlyOwner` (never callable by `guardianAgent`).**

### 3.2 `RecoveryVault.sol`
- **Precompile Interface:**
  - Calls `0x0000000000000000000000000000000000000A01` (`pqcVerify`) with concatenated `(pqcPubKey, signature, messageHash/payload)` and verifies the returned boolean status word.
- **Key Functions:**
  - `depositFor(address account) payable`: Records evacuated funds per protected account.
  - `withdrawWithPQC(address recipient, uint256 amount, uint256 nonce, bytes calldata pqcPubKey, bytes calldata pqcSig)`:
    1. Verifies `keccak256(pqcPubKey) == registeredOwnerPqcKeyHash[msg.sender/account]`.
    2. Reconstructs replay-protected message `(chainId, address(this), recipient, amount, nonce)`.
    3. Calls `pqcVerify` (`0x...0A01`) on-chain.
    4. Increments `nonce` and transfers `amount` to `recipient`.

---

## 4. Off-Chain AI Agent & Simulation Engine

- **Stack:** Node.js + TypeScript + `viem` + `@qorechain/sdk` + `@qorechain/evm` + `@qorechain/pqc`.
- **Event Loop:**
  1. Subscribes to `GuardianAccount` events and pending/simulated actions.
  2. Runs pre-flight analysis (`simulateWithRiskScore` + AI Risk Scorer).
  3. Produces structured verdict:
     ```json
     {
       "riskScore": 94,
       "action": "FREEZE_AND_FORCE_MOVE",
       "reasons": [
         "Classical key leak signal detected",
         "Attempted transfer (100% of balance) exceeds baseline by 12x",
         "Unrecognized destination address"
       ],
       "timestamp": "2026-11-22T14:00:00Z"
     }
     ```
  4. Signs & broadcasts defensive transaction to `GuardianAccount.sol` within the scoped EVM window.
  5. Streams live telemetry to the Next.js dashboard via SSE / WebSocket / polling API.

---

## 5. Frontend Dashboard (Next.js 15)

- **Scaffolded with:** `npm create qorechain-dapp@latest` (Next.js 15, TypeScript, Tailwind, RainbowKit / QoreX wallet adapter).
- **Views & Panels:**
  1. **Treasury Status Card:** Live `GuardianAccount` balance, `RecoveryVault` balance, `isFrozen` badge, current `perTxLimit` & `dailyLimit`.
  2. **Explainable AI Feed:** Live Risk Score gauge (0–100) + plain-English reasoning log + on-chain tx links to `https://explore.qore.network`.
  3. **Q-Day Attacker Panel:** Displays the openly published classical testnet private key + **"Try to Drain Wallet with Leaked Key"** button.
  4. **Prompt Injection Lab:** **"Simulate Prompt Injection Attack"** button testing malicious instructions against the AI + on-chain caps.
  5. **Post-Quantum Recovery Panel:** Owner signs fresh `ML-DSA-87` payload to unlock funds from `RecoveryVault.sol` via `pqcVerify`.

---

## 6. Recommended Repository Layout

```text
qoreguardian/
├── contracts/                  # Foundry project (Solidity 0.8.28)
│   ├── src/
│   │   ├── GuardianAccount.sol
│   │   ├── RecoveryVault.sol
│   │   └── interfaces/IPQCVerify.sol
│   ├── test/
│   │   ├── GuardianAccount.t.sol
│   │   └── RecoveryVault.t.sol
│   └── script/Deploy.s.sol
├── agent/                      # Off-chain Explainable AI Guardian (Node/TS)
│   ├── src/
│   │   ├── monitor.ts
│   │   ├── riskEngine.ts
│   │   ├── defender.ts
│   │   └── server.ts
├── web/                        # Next.js 15 Dashboard (create-qorechain-dapp)
├── docs/                       # PRD, Architecture, Plan, Memory, Handoff, TODO, Prompts
├── AI_USAGE.md                 # Required for Best AI-Native Build
└── README.md                   # Architecture, explorer links, quickstart
```
