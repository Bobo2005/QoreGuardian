import { useMemo, useState } from "react";
import { createWalletClient, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  AGENT_URL,
  EXPLORER_URL,
  GUARDIAN_ACCOUNT_ADDRESS,
  QORE_RPC_URL,
  publicClient,
  qorechainDiana,
} from "../lib/qore";

const EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

const DEFAULT_THROWAWAY_KEY =
  (import.meta.env.VITE_QDAY_THROWAWAY_PRIVATE_KEY as Hex | undefined) ??
  "0xa580e46e041730d112cf95c844ef18ece8e4c7d4186daf9c12612af10eebe5c2";

interface Props {
  onComplete?: () => void;
}

interface AttackStep {
  label: string;
  status: "info" | "blocked" | "defended" | "error";
  detail: string;
  explorerUrl?: string;
}

export function QDayAttackerPanel({ onComplete }: Props) {
  const [drainAmount, setDrainAmount] = useState("5");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AttackStep[]>([]);

  const attacker = useMemo(() => privateKeyToAccount(DEFAULT_THROWAWAY_KEY), []);

  async function handleDrainAttempt(): Promise<void> {
    setRunning(true);
    setSteps([]);
    const log: AttackStep[] = [];
    const pushStep = (step: AttackStep) => {
      log.push(step);
      setSteps([...log]);
    };

    try {
      const valueWei = parseEther(drainAmount || "5");
      pushStep({
        label: "1. Leaked Classical Key Armed",
        status: "info",
        detail: `Attacker derived ${attacker.address} from published throwaway key and targets GuardianAccount (${GUARDIAN_ACCOUNT_ADDRESS}).`,
      });

      // Step 1: Attempt on-chain execution / simulation with leaked classical key
      try {
        const attackerBalance = await publicClient.getBalance({ address: attacker.address });
        if (attackerBalance > parseEther("0.01")) {
          const attackerWallet = createWalletClient({
            account: attacker,
            chain: qorechainDiana,
            transport: http(QORE_RPC_URL),
          });
          const txHash = await attackerWallet.writeContract({
            address: GUARDIAN_ACCOUNT_ADDRESS,
            abi: EXECUTE_ABI,
            functionName: "execute",
            args: [attacker.address, valueWei, "0x"],
          });
          pushStep({
            label: "2. On-Chain Drain Tx Sent",
            status: "blocked",
            detail: `Tx broadcast from leaked key (${txHash}); checking on-chain enforcement.`,
            explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
          });
        } else {
          await publicClient.simulateContract({
            account: attacker.address,
            address: GUARDIAN_ACCOUNT_ADDRESS,
            abi: EXECUTE_ABI,
            functionName: "execute",
            args: [attacker.address, valueWei, "0x"],
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
        pushStep({
          label: "2. On-Chain Guardrail Blocked Drain",
          status: "blocked",
          detail: `GuardianAccount.sol rejected direct classical drain: ${msg}`,
        });
      }

      // Step 2: Trigger AI Guardian evaluation & autonomous evacuation
      const res = await fetch(`${AGENT_URL}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: attacker.address,
          to: attacker.address,
          valueQor: drainAmount || "5",
          promptText: "Q-Day Drill: Drain entire treasury using leaked classical private key",
          leakedKeySignal: true,
          executeDefense: true,
        }),
      });

      if (!res.ok) {
        throw new Error(`Agent server returned ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as {
        verdict: { riskScore: number; action: string; reasons: string[] };
        defense?: { executed: boolean; method?: string; txHash?: string; explorerUrl?: string; detail: string };
      };

      pushStep({
        label: `3. AI Guardian Verdict (${data.verdict.riskScore}/100 · ${data.verdict.action})`,
        status: "defended",
        detail: data.defense?.detail ?? data.verdict.reasons.join(" "),
        explorerUrl: data.defense?.explorerUrl,
      });

      onComplete?.();
    } catch (err) {
      pushStep({
        label: "Simulation Error",
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="card attacker-card" style={{ marginTop: "1.25rem" }}>
      <div className="card-header">
        <div>
          <h2>Q-Day Attacker Panel</h2>
          <p className="muted">
            Simulates a compromised classical secp256k1 key attempting to drain the treasury.
          </p>
        </div>
        <span className="badge badge-danger">TESTNET-ONLY LEAKED KEY</span>
      </div>

      <div className="key-box">
        <div>
          <span className="stat-label">Published Throwaway Private Key (qorechain-diana only)</span>
          <div className="key-value">
            <code>{DEFAULT_THROWAWAY_KEY}</code>
          </div>
        </div>
        <div className="muted-sm">
          Derived Attacker Address: <code>{attacker.address}</code>
        </div>
      </div>

      <div className="attacker-controls">
        <label className="input-group">
          <span className="stat-label">Drain Amount (QOR)</span>
          <input
            type="number"
            min="0.01"
            step="0.05"
            value={drainAmount}
            onChange={(e) => setDrainAmount(e.target.value)}
            className="text-input"
          />
        </label>
        <button className="btn-danger" onClick={() => void handleDrainAttempt()} disabled={running}>
          {running ? "Executing Q-Day Attack..." : "Try to Drain Wallet with Leaked Key"}
        </button>
      </div>

      {steps.length > 0 && (
        <div className="feed-list" style={{ marginTop: "1rem" }}>
          {steps.map((s, i) => (
            <div key={i} className="feed-item">
              <div className="feed-item-header">
                <strong>{s.label}</strong>
                <span
                  className={`badge ${
                    s.status === "defended"
                      ? "badge-ok"
                      : s.status === "blocked"
                        ? "badge-warn"
                        : s.status === "error"
                          ? "badge-danger"
                          : "badge-warn"
                  }`}
                >
                  {s.status.toUpperCase()}
                </span>
              </div>
              <p className="feed-detail">{s.detail}</p>
              {s.explorerUrl && (
                <a className="explorer-link" href={s.explorerUrl} target="_blank" rel="noreferrer">
                  View on QoreScan ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
