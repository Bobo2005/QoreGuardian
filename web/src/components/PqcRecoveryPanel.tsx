import { useState } from "react";
import { pqcSign } from "@qorechain/sdk";
import { encodeFunctionData, getAddress, hexToBytes, parseEther, toHex, type Address, type Hex } from "viem";
import {
  EXPLORER_URL,
  RECOVERY_VAULT_ADDRESS,
  publicClient,
  type ConnectedWallet,
  type TreasuryStatus,
} from "../lib/qore";

const VAULT_ABI = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "buildWithdrawMessage",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
  {
    type: "function",
    name: "withdrawWithPQC",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "pqcPubKey", type: "bytes" },
      { name: "pqcSig", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

interface Props {
  wallet: ConnectedWallet | null;
  status: TreasuryStatus | null;
  onComplete?: () => void;
}

export function PqcRecoveryPanel({ wallet, status, onComplete }: Props) {
  const [recipient, setRecipient] = useState("");
  const [amountQor, setAmountQor] = useState("0.05");
  const [pqcPubHex, setPqcPubHex] = useState(
    (import.meta.env.VITE_OWNER_PQC_PUBLIC_KEY as string | undefined) ?? ""
  );
  const [pqcSecHex, setPqcSecHex] = useState(
    (import.meta.env.VITE_OWNER_PQC_SECRET_KEY as string | undefined) ?? ""
  );
  const [running, setRunning] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [sigPreview, setSigPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw(): Promise<void> {
    setError(null);
    setTxHash(null);
    setSigPreview(null);

    if (!wallet) {
      setError("Connect the Owner wallet (QoreX / EIP-1193) in the top bar first.");
      return;
    }
    if (!pqcPubHex.startsWith("0x") || !pqcSecHex.startsWith("0x")) {
      setError("Provide 0x-prefixed ML-DSA-87 public and secret keys.");
      return;
    }

    setRunning(true);
    try {
      const targetRecipient = getAddress(recipient.trim() || wallet.address) as Address;
      const amountWei = parseEther(amountQor || "0.05");

      const nonce = await publicClient.readContract({
        address: RECOVERY_VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "nonces",
        args: [wallet.address],
      });

      const messageHex = await publicClient.readContract({
        address: RECOVERY_VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "buildWithdrawMessage",
        args: [wallet.address, targetRecipient, amountWei, nonce],
      });

      const sigBytes = pqcSign(hexToBytes(pqcSecHex as Hex), hexToBytes(messageHex));
      const pqcSigHex = toHex(sigBytes);
      setSigPreview(`${pqcSigHex.slice(0, 26)}… (${sigBytes.length} bytes ML-DSA-87)`);

      const data = encodeFunctionData({
        abi: VAULT_ABI,
        functionName: "withdrawWithPQC",
        args: [targetRecipient, amountWei, nonce, pqcPubHex as Hex, pqcSigHex],
      });

      const hash = (await wallet.provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: wallet.address,
            to: RECOVERY_VAULT_ADDRESS,
            data,
          },
        ],
      })) as Hex;

      await publicClient.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: "1.25rem" }}>
      <div className="card-header">
        <div>
          <h2>Post-Quantum Recovery Panel</h2>
          <p className="muted">
            Sign a fresh <code>ML-DSA-87</code> proof and call{" "}
            <code>RecoveryVault.withdrawWithPQC()</code> (verified on-chain by <code>0x...0A01</code>).
          </p>
        </div>
        <span className="badge badge-ok">ML-DSA-87 ONLY</span>
      </div>

      <div className="form-stack">
        <div className="muted-sm">
          Vault Balance for Owner: <strong>{status?.vaultBalanceQor ?? "—"} QOR</strong> · Next
          Replay Nonce: <code>{status?.vaultNonce ?? "0"}</code>
        </div>

        <div className="attacker-controls">
          <label className="input-group" style={{ flex: 1, minWidth: 220 }}>
            <span className="stat-label">Recipient Address (defaults to connected wallet)</span>
            <input
              type="text"
              className="text-input"
              placeholder={wallet?.address ?? status?.owner ?? "0x..."}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </label>
          <label className="input-group">
            <span className="stat-label">Withdraw Amount (QOR)</span>
            <input
              type="number"
              min="0.001"
              step="0.01"
              className="text-input"
              value={amountQor}
              onChange={(e) => setAmountQor(e.target.value)}
            />
          </label>
        </div>

        <label className="input-group">
          <span className="stat-label">Owner ML-DSA-87 Public Key (2,592 bytes hex)</span>
          <input
            type="password"
            className="text-input"
            placeholder="0x..."
            value={pqcPubHex}
            onChange={(e) => setPqcPubHex(e.target.value)}
          />
        </label>

        <label className="input-group">
          <span className="stat-label">Owner ML-DSA-87 Secret Key (4,896 bytes hex)</span>
          <input
            type="password"
            className="text-input"
            placeholder="0x..."
            value={pqcSecHex}
            onChange={(e) => setPqcSecHex(e.target.value)}
          />
        </label>

        <div>
          <button className="btn-success" onClick={() => void handleWithdraw()} disabled={running}>
            {running ? "Signing ML-DSA-87 & Submitting..." : "Sign ML-DSA-87 & Withdraw from Vault"}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-error" style={{ marginTop: "0.9rem" }}>
          {error}
        </div>
      )}

      {(sigPreview || txHash) && (
        <div className="feed-item" style={{ marginTop: "0.9rem" }}>
          {sigPreview && (
            <p className="feed-detail">
              Generated ML-DSA-87 Signature: <code>{sigPreview}</code>
            </p>
          )}
          {txHash && (
            <a
              className="explorer-link"
              href={`${EXPLORER_URL}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Withdrawal Confirmed on QoreScan: {txHash} ↗
            </a>
          )}
        </div>
      )}
    </section>
  );
}
