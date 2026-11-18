# QoreGuardian Demo Video Script (≤ 3 Minutes)

**Target Runtime:** 2:45 – 2:55  
**Core Tagline:** *"They leash agents so they can spend. We built a guardian that protects."*

---

### 0:00 – 0:25 | Hook & Problem
- **Visual:** Split-screen or slide showing typical "spending AI agents" vs. QoreGuardian's 4-layer architecture.
- **Voiceover:**
  > "Most Web3 AI agents are built to spend money on a leash. QoreGuardian is built as an always-on **bodyguard**. Even if a classical private key is leaked on Q-Day, or an attacker hits your agent with prompt injection, QoreGuardian bounds the damage, freezes the account, and evacuates funds into a post-quantum `RecoveryVault`."

### 0:25 – 1:30 | Hero Moment: Q-Day Classical Key Leak Drill
- **Visual:** Live `QoreGuardian` dashboard showing `TreasuryStatusCard` (`GuardianAccount` funded, `ACTIVE`, Scoped EVM Window `LIVE`), then scroll to **Q-Day Attacker Panel**.
- **Action:** Point to the openly published throwaway testnet private key, click **"Try to Drain Wallet with Leaked Key"**.
- **Visual:** Attack log shows `GuardianAccount.sol` blocking the classical drain, **Explainable AI Live Feed** gauge animates to `100/100` (`EVACUATED`) with plain-English reasons, and `TreasuryStatusCard` flips to `FROZEN — FUNDS PROTECTED` (`0 QOR` in `GuardianAccount`, funds safely in `RecoveryVault`). Click the `explore.qore.network/tx/...` link.
- **Voiceover:**
  > "Here is a real classical private key published openly on screen. When an attacker tries to drain the treasury, `GuardianAccount.sol` blocks the bypass, our AI Guardian spikes the Risk Score to 100 with plain-English reasoning, and autonomously executes `forceMoveToVault()`—moving 100% of funds to `RecoveryVault` on `qorechain-diana`."

### 1:30 – 2:15 | Post-Quantum `ML-DSA-87` Recovery
- **Visual:** Scroll to **Post-Quantum Recovery Panel** (with QoreX wallet connected on Chain ID `9800`).
- **Action:** Click **"Sign ML-DSA-87 & Withdraw from Vault"**. Show the 4,627-byte `ML-DSA-87` signature and the confirmed `explore.qore.network` transaction.
- **Voiceover:**
  > "`RecoveryVault` has zero classical withdrawal paths. To reclaim rescued funds, the human owner signs a fresh post-quantum `ML-DSA-87` proof, verified directly on-chain by QoreChain's `pqcVerify` precompile at `0x...0A01`."

### 2:15 – 2:45 | Prompt Injection Lab & Dead-Man's Switch
- **Visual:** Briefly trigger **"Simulate Prompt Injection Attack"** showing AI rejection (`100/100`) + on-chain revert, and highlight `emergencyEvacuate()` in `GuardianAccount.sol` (Dead-Man's Switch when the AI is offline).
- **Voiceover:**
  > "Even against prompt injection, both the AI engine and hard on-chain caps reject the drain. And if the AI agent ever goes offline, `emergencyEvacuate()` lets the owner evacuate funds directly with an `ML-DSA-87` signature."

### 2:45 – 3:00 | Close
- **Visual:** Full dashboard + `README.md` / `explore.qore.network` links.
- **Voiceover:**
  > "QoreGuardian: 4 layers of defense-in-depth, live on `qorechain-diana`. They leash agents so they can spend—we built a guardian that protects."
