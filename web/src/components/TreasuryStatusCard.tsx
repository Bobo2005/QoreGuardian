import {
  EXPLORER_URL,
  GUARDIAN_ACCOUNT_ADDRESS,
  GUARDIAN_COSMOS_ADDRESS,
  RECOVERY_VAULT_ADDRESS,
  type TreasuryStatus,
} from "../lib/qore";

interface Props {
  status: TreasuryStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function TreasuryStatusCard({ status, loading, error, onRefresh }: Props) {
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Treasury Status</h2>
          <p className="muted">
            Live on-chain state from <code>qorechain-diana</code> (Chain ID <code>9800</code>)
          </p>
        </div>
        <div className="header-actions">
          {status && (
            <span className={`badge ${status.isFrozen ? "badge-danger" : "badge-ok"}`}>
              {status.isFrozen ? "FROZEN — FUNDS PROTECTED" : "ACTIVE"}
            </span>
          )}
          <button className="btn-secondary" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {status && (
        <>
          <div className="stats-grid">
            <div className="stat-box">
              <span className="stat-label">GuardianAccount Balance</span>
              <span className="stat-value">{status.guardianBalanceQor} QOR</span>
              <a
                className="explorer-link"
                href={`${EXPLORER_URL}/address/${GUARDIAN_ACCOUNT_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
              >
                {GUARDIAN_ACCOUNT_ADDRESS.slice(0, 10)}…{GUARDIAN_ACCOUNT_ADDRESS.slice(-8)} ↗
              </a>
            </div>

            <div className="stat-box">
              <span className="stat-label">RecoveryVault Balance (PQC-Only)</span>
              <span className="stat-value accent">{status.vaultBalanceQor} QOR</span>
              <a
                className="explorer-link"
                href={`${EXPLORER_URL}/address/${RECOVERY_VAULT_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
              >
                {RECOVERY_VAULT_ADDRESS.slice(0, 10)}…{RECOVERY_VAULT_ADDRESS.slice(-8)} ↗
              </a>
            </div>

            <div className="stat-box">
              <span className="stat-label">Per-Tx Limit</span>
              <span className="stat-value">{status.perTxLimitQor} QOR</span>
              <span className="muted-sm">Hard on-chain cap</span>
            </div>

            <div className="stat-box">
              <span className="stat-label">Daily Limit / Spent Today</span>
              <span className="stat-value">
                {status.spentTodayQor} / {status.dailyLimitQor} QOR
              </span>
              <span className="muted-sm">24h rolling window</span>
            </div>
          </div>

          <div className="window-panel">
            <div className="window-header">
              <div>
                <strong>Protocol Scoped EVM Window</strong>{" "}
                <span className="muted-sm">({GUARDIAN_COSMOS_ADDRESS})</span>
              </div>
              <span className={`badge ${status.evmWindow.live ? "badge-ok" : "badge-warn"}`}>
                {status.evmWindow.live ? "WINDOW LIVE" : "NO ACTIVE WINDOW"}
              </span>
            </div>
            {status.evmWindow.error ? (
              <p className="muted-sm">Window query note: {status.evmWindow.error}</p>
            ) : (
              <div className="window-meta">
                <span>
                  Remaining Blocks: <code>{status.evmWindow.remainingBlocks}</code>
                </span>
                <span>
                  Remaining Txs: <code>{status.evmWindow.remainingTxs}</code> /{" "}
                  <code>{status.evmWindow.maxTxs}</code>
                </span>
                <span>
                  Allowed Targets:{" "}
                  <code>
                    {status.evmWindow.allowedTargets.length > 0
                      ? status.evmWindow.allowedTargets.join(", ")
                      : "none"}
                  </code>
                </span>
              </div>
            )}
          </div>

          <div className="meta-footer">
            <span>
              Owner: <code>{status.owner}</code>
            </span>
            <span>
              Guardian Agent: <code>{status.guardianAgent}</code>
            </span>
            <span>Updated: {status.fetchedAt}</span>
          </div>
        </>
      )}
    </section>
  );
}
