import { useCallback, useEffect, useState } from "react";
import { TreasuryStatusCard } from "./components/TreasuryStatusCard";
import {
  QORE_CHAIN_ID,
  connectQoreWallet,
  fetchTreasuryStatus,
  type ConnectedWallet,
  type TreasuryStatus,
} from "./lib/qore";
import "./styles.css";

export function App(): JSX.Element {
  const [status, setStatus] = useState<TreasuryStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchTreasuryStatus();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleConnect(): Promise<void> {
    setWalletError(null);
    try {
      const connected = await connectQoreWallet();
      setWallet(connected);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">QG</div>
          <div>
            <h1>QoreGuardian</h1>
            <p>Autonomous Post-Quantum Treasury Guardian · qorechain-diana (9800)</p>
          </div>
        </div>

        <div className="wallet-bar">
          {wallet ? (
            <>
              <span className={`badge ${wallet.chainId === QORE_CHAIN_ID ? "badge-ok" : "badge-warn"}`}>
                Chain {wallet.chainId}
              </span>
              <span className="btn-secondary">
                {wallet.providerName}: {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
              </span>
            </>
          ) : (
            <button className="btn-primary" onClick={handleConnect}>
              Connect QoreX / Wallet
            </button>
          )}
        </div>
      </header>

      {walletError && <div className="alert-error">{walletError}</div>}

      <main>
        <TreasuryStatusCard
          status={status}
          loading={loading}
          error={error}
          onRefresh={() => void refresh()}
        />
      </main>
    </div>
  );
}
