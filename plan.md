# QoreGuardian
**Autonomous Post-Quantum Treasury Guardian**

**Build Before Q-Day · QoreChain Developer Fest 2026**
**Track:** Post-Quantum AI Agents
**Builder:** Solo
**Target:** 1st Place + Q-Day Survivor + Best AI-Native Build

---

## 1. Executive Summary

QoreGuardian is a defensive AI agent designed for the post-quantum era.

While most AI agents in 2026 are built to *spend* money under restrictions, QoreGuardian is built to **protect** money. Its primary mission is to act as an always-on bodyguard for a treasury or personal wallet. It continuously monitors for threats and can automatically:

- Reduce its own spending powers
- Freeze itself
- Force-move remaining funds into a protected Recovery Vault that requires a fresh human post-quantum signature to unlock

All critical limits are enforced on-chain via QoreChain’s scoped EVM authorization windows and smart-contract rules. Even if the AI is fully compromised or the classical private key is leaked, the damage remains strictly bounded.

---

## 2. Problem Statement

Autonomous AI agents that can move crypto create new risks:

- Prompt injection and model misbehavior
- Soft spending limits that AI agents have been shown to bypass
- Classical keys that will eventually be broken by quantum computers

Most current solutions focus only on controlling spending. Almost none are designed with the primary goal of **detecting danger and locking everything down**.

QoreGuardian fills this gap.

---

## 3. What We Are Building

An autonomous AI agent that sits on top of a smart account and acts as a **post-quantum treasury guardian**.

**Core Capabilities:**
- Hard on-chain spending limits (per-tx, daily, allowlist, time-bound)
- Explainable real-time AI risk monitoring (0–100 Risk Score + plain-English reasoning streamed to dashboard)
- Automatic defensive actions (reduce limits → freeze → force-move to Recovery Vault)
- Post-quantum Dead-Man's Switch (`emergencyEvacuate()`) so the human owner can evacuate funds directly with an `ML-DSA-87` proof even if the AI goes offline
- Recovery Vault that only the human owner can unlock with a fresh `ML-DSA-87` signature verified on-chain via `pqcVerify`
- Live Testnet Q-Day Attacker Panel ("Try to Drain Wallet with Leaked Key") + One-click Prompt Injection Attack simulation
- Agent cannot raise its own limits

---

## 4. Competitive Landscape

| Project     | Focus                     | Positioning                  |
|-------------|---------------------------|------------------------------|
| Sentinel    | Invoice-paying agent      | Safe spender                 |
| Leashed     | Vendor payment agent      | Agent on a post-quantum leash|
| **QoreGuardian** | **Treasury protection** | **Bodyguard / Defender**     |

**Our Positioning Statement:**
> “While other agents are put on a leash so they can spend safely, QoreGuardian is built as a bodyguard. Its main job is to lock down and protect your funds when threats appear — especially on Q-Day.”

---

## 5. Technical Architecture

**4-Layer Defense-in-Depth:**
1. **Protocol Layer (QoreChain Scoped EVM Window):** `openEvmWindowMsg` restricts the agent's window with `allowedTargets` set strictly to `GuardianAccount.sol` plus tight block/tx/fee caps.
2. **Smart Account Layer (`GuardianAccount.sol`):** Enforces hard per-tx, daily, and allowlist caps on-chain; supports `reduceLimits`, `freeze`, `forceMoveToVault`, and owner-triggered `emergencyEvacuate()` (Dead-Man's Switch).
3. **AI Brain Layer (Off-chain Node.js / TypeScript Agent):** Evaluates live transactions and threat signals, outputs a **Risk Score (0–100) + human-readable explanation**, and executes defensive escalation.
4. **Post-Quantum Recovery Layer (`RecoveryVault.sol`):** Emergency destination that calls QoreChain's native **`pqcVerify` precompile (`0x0000000000000000000000000000000000000A01`)** on-chain to verify the owner's fresh **`ML-DSA-87`** signature before unlocking funds.

User Dashboard (Next.js) ↓ Off-chain Explainable AI Agent Brain (Node.js / TypeScript) ↓ (Scoped EVM Window: `allowedTargets`) GuardianAccount.sol (Smart Account + Limits + Freeze + Dead-Man's Switch) ↓ RecoveryVault.sol (Emergency destination gated by `pqcVerify` `0x...0A01`)


---

## 6. Tech Stack

- Smart Contracts: Solidity 0.8.28 + Foundry
- Frontend: Next.js 15 + TypeScript + Tailwind + RainbowKit + QoreX
- Agent: Node.js + TypeScript + viem
- QoreChain: `@qorechain/sdk`, `@qorechain/pqc`, `@qorechain/evm`
- Scaffold: `create-qorechain-dapp`

---

## 7. Timeline

- **Week 1 (Now – 21 Nov):** Foundation & core contracts
- **Week 2 (22 – 28 Nov):** Defensive logic, dashboard, simulation
- **Week 3 (29 Nov – 2 Dec):** Polish, demo video, documentation, submission

---

## 8. Winning Playbook

This section is based on analysis of judging criteria and winner patterns from 15+ major Web3 hackathons (ETHGlobal, BNB Chain, Solana, Algorand, and others).

### What Judges Actually Reward (QoreChain Developer Fest 2026)
- **Judging Pipeline:** Automated & manual code/integrity checks → Jury scoring (Technical Execution, Originality & Innovation, Completeness & Usability, public GitHub + README, ≤ 3-minute demo video) → **People's Choice** community voting via QoreX on mainnet.
1. Clear originality / unique angle
2. Solid technical execution using QoreChain's native PQC & scoped EVM features
3. Strong, memorable live testnet demo
4. Real usefulness and narrative fit
5. Polish, public deployability, and documentation

### Our Specific Playbook to Win

**1. Narrative Domination**
Own the contrast ruthlessly:
“They leash agents so they can spend. We built a guardian that protects.”
Repeat this in the project page, README, demo, and dashboard.

**2. Make the Demo the Hero (≤ 3-Minute Video Storyboard)**
- **0:00–0:25 (Hook):** Contrast spending agents vs. QoreGuardian bodyguard.
- **0:25–1:30 (Q-Day Key Leak Hero Moment):** Show the openly published classical private key in the dashboard's **"Try to Drain Wallet with Leaked Key"** panel → attacker fires real testnet txs → on-chain cap blocks full drain → AI Risk Score spikes (e.g., 94/100 with explanation) → `GuardianAccount` freezes → **funds automatically force-move to `RecoveryVault`**.
- **1:30–2:15 (Post-Quantum Recovery):** Human owner unlocks `RecoveryVault` using a fresh **`ML-DSA-87`** signature verified on-chain via `pqcVerify` (`0x...0A01`).
- **2:15–2:50 (Prompt Injection + Architecture):** Trigger **"Simulate Prompt Injection Attack"** to prove both the AI and on-chain caps defeat manipulation, then flash the 4-layer Defense-in-Depth diagram.

**3. Maximize QoreChain-Native Features**
- Scoped EVM windows (`openEvmWindowMsg` with `allowedTargets` locked to `GuardianAccount.sol`)
- On-chain `pqcVerify` precompile (`0x0000000000000000000000000000000000000A01`) for `ML-DSA-87` verification in `RecoveryVault.sol`
- Post-quantum Dead-Man's Switch (`emergencyEvacuate()`)
- Clear Q-Day Drill readiness (openly published classical testnet key)
- *Optional Stretch (only if Week 2 is ahead of schedule):* Encrypt threat audit logs with `QoreSeal`

**4. Documentation & Public Testnet Polish (Jury + People's Choice)**
- Deploy and verify contracts on **QoreChain Testnet** early (within Week 1) with explorer links at the top of `README.md`
- Host a public live dashboard URL so judges and QoreX People's Choice voters can click **"Simulate Classical Key Leak"** in 10 seconds with zero setup
- Clean `AI_USAGE.md` documenting both the in-product explainable risk engine and AI build workflow (targets **Best AI-Native Build**)
- Clean git history within the Nov 4 – Dec 2 window with zero leaked real secrets to pass integrity checks cleanly

**5. Ruthless Scope Control**
Focus only on:
- Hard on-chain limits + Dead-Man's Switch
- Reliable defensive actions (especially force-move + `pqcVerify` recovery)
- Explainable AI Risk Score + smooth dashboard simulations (Key Leak & Prompt Injection)
- Rock-solid Q-Day survival on QoreChain Testnet

Do not dilute the core message with extra features.

### Success Formula for This Track
**Sharp unique positioning + Dramatic working demo + Deep use of QoreChain features + Clean documentation = Highest chance of 1st place**

---

## 9. Immediate Next Steps

1. Create / confirm GitHub repo: `qoreguardian`
2. Scaffold with `create-qorechain-dapp`
3. Prioritize `GuardianAccount.sol` + `RecoveryVault.sol` (force-move is the wow feature)
4. Storyboard the exact demo flow

---

## 10. Plain-English Overview

### What We Are Trying to Build
QoreGuardian is an **autonomous AI bodyguard for crypto wallets and treasuries**, built for the **QoreChain Developer Fest 2026** hackathon. Think of it like a smart home security system for your money: while most AI crypto tools are built to *spend* money for you, QoreGuardian is built to **protect** your money by watching for danger 24/7, locking everything down, and moving your funds to safety if something goes wrong.

### What the Product Is For
It protects against three major risks:
1. **AI mistakes or hacks:** AI agents can be tricked (e.g., prompt injection) or misbehave, and soft rules don't always stop them.
2. **Stolen keys:** If a regular ("classical") private key is leaked or stolen, hackers can drain the wallet.
3. **"Q-Day" (Quantum computers):** Future quantum computers will be able to crack today's standard crypto keys.

Even if the AI is compromised or a standard private key is leaked, QoreGuardian ensures your money stays safe and any damage is strictly limited.

### Who It Is For
- **Crypto treasury managers & organizations** holding larger pools of funds who want an always-on automated defense system.
- **Individual crypto wallet owners** who want protection against key leaks, AI mishaps, and future quantum-computing threats.
- **Hackathon judges** at QoreChain Developer Fest 2026, showcasing QoreChain's quantum-resistant security features in a clear, memorable demo.

### How It Works
1. **Protected Smart Account (`GuardianAccount.sol`):** Funds sit in a smart contract wallet with hard rules enforced on-chain (per-transaction caps, daily limits, allowlists, and time windows). **The AI cannot raise its own limits.**
2. **AI Bodyguard (Off-chain Agent):** A background service monitors activity 24/7 for signs of risk.
3. **Automatic Defense Mode:** When a threat is detected, the agent escalates automatically: shrinks its own spending limits → freezes the account → **force-moves** remaining funds into an emergency vault.
4. **Emergency Safe (`RecoveryVault.sol`):** Rescued funds are locked here. **Only the human owner** can unlock them using a fresh **post-quantum signature (`ML-DSA-87`)**.
5. **Control Dashboard:** A web interface where users monitor status and can trigger a one-click **"Simulate Classical Key Leak"** drill to see the funds automatically evacuate to safety.

---

**Status:** Locked & Ready to Execute
**Last Updated:** 15 November 2026
