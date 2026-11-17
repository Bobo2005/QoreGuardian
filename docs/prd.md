# Product Requirements Document (PRD): QoreGuardian

**Version:** 1.0  
**Last Updated:** 15 November 2026  
**Event:** QoreChain Developer Fest 2026 — *"Build Before Q-Day"* (Nov 4 – Dec 2, 2026)  
**Track:** Post-Quantum AI Agents (Advanced Track A)  
**Special Awards Targeted:** Q-Day Survivor, Best AI-Native Build, Top Quality, People's Choice  

---

## 1. Executive Summary & Positioning

**QoreGuardian** is an autonomous, defensive-first **Post-Quantum Treasury Guardian**.  

> *"While other agents are put on a leash so they can spend safely, QoreGuardian is built as a bodyguard. Its main job is to lock down and protect your funds when threats appear — especially on Q-Day."*

Instead of optimizing for autonomous spending, QoreGuardian optimizes for **autonomous protection**: continuous threat monitoring, explainable AI risk scoring, hard on-chain spending caps that the AI cannot raise, automatic account freezing, and emergency fund evacuation into a post-quantum (`ML-DSA-87`) `RecoveryVault`.

---

## 2. Problem Statement

1. **Prompt Injection & Model Misbehavior:** AI agents with wallet access can be manipulated by malicious payloads, memos, or reasoning failures. Soft off-chain guardrails are routinely bypassed.
2. **Classical Key Compromise:** If an EVM/ECDSA classical private key is leaked, phished, or cracked, attackers can drain funds before a human can react.
3. **The Q-Day Threat:** Future quantum computers will break classical elliptic-curve cryptography (ECDSA/RSA), rendering standard wallets defenseless unless protected by NIST-standardized post-quantum cryptography (`ML-DSA-87`).
4. **Market Gap:** Existing Web3 AI agents focus on *spending* (invoices, vendor payments, trading). Almost none are built as dedicated *defensive bodyguards* that detect danger and evacuate funds automatically.

---

## 3. Target Users & Personas

| Persona | Needs | How QoreGuardian Helps |
|---|---|---|
| **Treasury Manager / DAO Operator** | Prevent catastrophic drains from compromised keys or rogue automation | Hard on-chain per-tx/daily/allowlist caps + automated emergency evacuation to cold PQC vault |
| **Individual Crypto Holder** | Sleep-safe wallet protection against key leaks and Q-Day threats | 24/7 AI bodyguard + one-signature `ML-DSA-87` recovery |
| **Hackathon Jury & Community Voters (QoreX)** | Clear, verifiable, memorable proof of QoreChain's PQC + AI-native capabilities | Live public testnet demo with one-click Key Leak & Prompt Injection simulations |

---

## 4. Core Functional Requirements

### FR-1: Hard On-Chain Spending Limits (`GuardianAccount.sol`)
- Enforce **per-transaction limit**, **daily spending cap**, **allowlisted target addresses**, and **time-bound execution**.
- **Strict Privilege Separation:** The AI agent role can *reduce* limits, *freeze* the account, or *force-move* funds to `RecoveryVault`, but **can NEVER raise limits, bypass allowlists, or withdraw to arbitrary addresses**.

### FR-2: Explainable AI Risk Engine (Off-Chain Agent + On-Chain Pre-Flight)
- Evaluate transaction context (amount vs. baseline, unknown recipient, rapid velocity, leaked-key signal, prompt-injection patterns).
- Integrate QoreChain's native `simulateWithRiskScore` pre-flight check where applicable alongside LLM/rule-based risk scoring.
- Output a deterministic **Risk Score (0–100)** and a **plain-English explanation** streamed live to the dashboard.

### FR-3: Automated Defensive Escalation
When Risk Score crosses configured thresholds:
1. **Medium Risk (e.g., 50–74):** Automatically call `reduceLimits()` on `GuardianAccount.sol`.
2. **High Risk (e.g., 75–89):** Automatically call `freeze()` to halt all classical outflows.
3. **Critical Risk (e.g., 90–100 / Key Leak):** Automatically call `forceMoveToVault()` to evacuate 100% of remaining funds to `RecoveryVault.sol`.

### FR-4: Post-Quantum Recovery Vault (`RecoveryVault.sol`)
- Accepts emergency deposits from `GuardianAccount.sol`.
- **Zero classical withdrawal path:** Funds can **only** be unlocked by the human owner submitting a fresh **`ML-DSA-87`** signature verified on-chain via QoreChain's `pqcVerify` precompile (`0x0000000000000000000000000000000000000A01`).

### FR-5: Post-Quantum Dead-Man's Switch
- Expose `emergencyEvacuate()` on `GuardianAccount.sol` callable directly by the human owner (using an `ML-DSA-87` proof / owner-scoped authorization) so funds can be evacuated even if the off-chain AI agent is offline or compromised.

### FR-6: Interactive Dashboard & Live Q-Day Simulations (Next.js)
- **Live Telemetry:** Account balance, current spending limits, freeze status, AI Risk Score gauge, and real-time explanation feed.
- **Simulation 1 — "Try to Drain Wallet with Leaked Key" (Q-Day Drill):** Displays an openly published classical testnet private key; clicking triggers real testnet drain attempts that are bounded by on-chain caps and interrupted by automatic AI freeze + `forceMoveToVault()`.
- **Simulation 2 — "Simulate Prompt Injection Attack":** Sends a malicious instruction attempting to override limits and drain funds; demonstrates AI detection + on-chain enforcement blocking the exploit.
- **Recovery Panel:** Allows the human owner to sign with `ML-DSA-87` (via QoreX / `@qorechain/pqc`) to unlock rescued funds from `RecoveryVault.sol`.

---

## 5. Non-Functional Requirements

- **Network:** Deployed and verified on **QoreChain Testnet (`qorechain-diana`, EVM Chain ID `9800`)**.
- **Protocol Integration:** Uses QoreChain Scoped EVM Windows (`openEvmWindowMsg` with `allowedTargets`), `pqcVerify` (`0x...0A01`), `@qorechain/sdk`, `@qorechain/pqc`, `@qorechain/evm`, and `create-qorechain-dapp`.
- **Security & Integrity:** Zero real secrets committed; clean git history within Nov 4 – Dec 2, 2026; comprehensive Foundry unit & fuzz tests.
- **Usability:** Publicly hosted dashboard usable in <10 seconds without local setup (critical for Jury & QoreX *People's Choice* voting).

---

## 6. Out of Scope (Ruthless Scope Control)
- Multi-chain bridging or non-QoreChain deployments.
- Complex DeFi yield strategies or autonomous trading.
- Multi-tenant SaaS billing or enterprise RBAC beyond Owner + Guardian Agent.
- `QoreSeal` encrypted threat logs (strictly an optional Week 2 stretch goal only if core is 100% complete).
