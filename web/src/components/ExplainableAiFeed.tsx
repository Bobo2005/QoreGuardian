import { useEffect, useState } from "react";
import { AGENT_URL, EXPLORER_URL } from "../lib/qore";

export interface FeedItem {
  id: string;
  timestamp: string;
  type: "state" | "assessment" | "defense" | "onchain_event" | "error";
  payload: Record<string, unknown>;
}

interface Props {
  onDefenseExecuted?: () => void;
}

function formatActionBadge(action: string | undefined, method?: string): { label: string; cls: string } {
  if (method === "forceMoveToVault" || action === "FREEZE_AND_FORCE_MOVE") {
    return { label: "EVACUATED", cls: "badge-danger" };
  }
  if (method === "freeze" || action === "FREEZE") {
    return { label: "FROZEN", cls: "badge-danger" };
  }
  if (method === "reduceLimits" || action === "REDUCE_LIMITS") {
    return { label: "REDUCED_LIMITS", cls: "badge-warn" };
  }
  if (action === "ALLOW") {
    return { label: "ALLOW", cls: "badge-ok" };
  }
  return { label: action ?? "EVENT", cls: "badge-warn" };
}

function scoreColor(score: number): string {
  if (score >= 85) return "#ef4444";
  if (score >= 65) return "#f97316";
  if (score >= 35) return "#f59e0b";
  return "#10b981";
}

function RiskGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const color = scoreColor(clamped);

  return (
    <div className="gauge-wrap" aria-label={`Risk Score ${clamped} out of 100`}>
      <svg className="gauge-svg" viewBox="0 0 130 130">
        <circle className="gauge-track" cx="65" cy="65" r={radius} />
        <circle
          className="gauge-fill"
          cx="65"
          cy="65"
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="gauge-center">
        <span className="gauge-score" style={{ color }}>
          {clamped}
        </span>
        <span className="gauge-label">/ 100 RISK</span>
      </div>
    </div>
  );
}

export function ExplainableAiFeed({ onDefenseExecuted }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [streamStatus, setStreamStatus] = useState<"connecting" | "live" | "offline">("connecting");

  useEffect(() => {
    let active = true;

    async function loadInitialHistory() {
      try {
        const res = await fetch(`${AGENT_URL}/api/state`);
        if (!res.ok) return;
        const data = (await res.json()) as { history?: FeedItem[] };
        if (active && Array.isArray(data.history)) {
          setItems([...data.history].reverse());
        }
      } catch {
        // SSE handler will reflect offline state
      }
    }

    void loadInitialHistory();

    const es = new EventSource(`${AGENT_URL}/api/events`);

    const handleEvent = (type: FeedItem["type"]) => (ev: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(ev.data) as FeedItem;
        const item: FeedItem = parsed.id
          ? parsed
          : {
              id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
              timestamp: new Date().toISOString(),
              type,
              payload: JSON.parse(ev.data) as Record<string, unknown>,
            };
        setItems((prev) => {
          if (prev.some((p) => p.id === item.id)) return prev;
          return [item, ...prev].slice(0, 50);
        });
        if (type === "defense" || type === "onchain_event") {
          onDefenseExecuted?.();
        }
      } catch {
        // Ignore malformed SSE frame
      }
    };

    es.addEventListener("connected", () => {
      if (active) setStreamStatus("live");
    });
    es.addEventListener("assessment", handleEvent("assessment"));
    es.addEventListener("defense", handleEvent("defense"));
    es.addEventListener("onchain_event", handleEvent("onchain_event"));
    es.addEventListener("error", () => {
      if (active) {
        setStreamStatus(es.readyState === EventSource.CLOSED ? "offline" : "connecting");
      }
    });

    return () => {
      active = false;
      es.close();
    };
  }, [onDefenseExecuted]);

  const latestAssessment = items.find((i) => i.type === "assessment");
  const latestScore =
    typeof latestAssessment?.payload.riskScore === "number"
      ? latestAssessment.payload.riskScore
      : 0;
  const latestAction =
    typeof latestAssessment?.payload.action === "string"
      ? latestAssessment.payload.action
      : undefined;
  const latestBadge = formatActionBadge(latestAction);

  return (
    <section className="card" style={{ marginTop: "1.25rem" }}>
      <div className="card-header">
        <div>
          <h2>Explainable AI Live Feed</h2>
          <p className="muted">
            Real-time telemetry from <code>{AGENT_URL}/api/events</code> (SSE)
          </p>
        </div>
        <div className="header-actions">
          <span
            className={`badge ${
              streamStatus === "live"
                ? "badge-ok"
                : streamStatus === "connecting"
                  ? "badge-warn"
                  : "badge-danger"
            }`}
          >
            {streamStatus === "live"
              ? "SSE LIVE"
              : streamStatus === "connecting"
                ? "CONNECTING..."
                : "AGENT OFFLINE"}
          </span>
        </div>
      </div>

      <div className="ai-overview">
        <RiskGauge score={latestScore} />
        <div className="ai-summary">
          <div className="ai-summary-top">
            <span className="stat-label">Latest Evaluation Verdict</span>
            <span className={`badge ${latestBadge.cls}`}>{latestBadge.label}</span>
          </div>
          {latestAssessment ? (
            <ul className="reason-list">
              {(Array.isArray(latestAssessment.payload.reasons)
                ? (latestAssessment.payload.reasons as string[])
                : []
              ).map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Waiting for transactions or simulation requests. Start the agent server (
              <code>cd agent && npm start</code>) and trigger a simulation to watch live scoring.
            </p>
          )}
        </div>
      </div>

      <div className="feed-list">
        {items.map((item) => {
          const action =
            typeof item.payload.action === "string" ? item.payload.action : undefined;
          const method =
            typeof item.payload.method === "string" ? item.payload.method : undefined;
          const badge = formatActionBadge(
            item.type === "onchain_event" ? "ONCHAIN_EVENT" : action,
            method
          );
          const txHash =
            typeof item.payload.txHash === "string" ? item.payload.txHash : undefined;
          const explorerUrl =
            typeof item.payload.explorerUrl === "string"
              ? item.payload.explorerUrl
              : txHash
                ? `${EXPLORER_URL}/tx/${txHash}`
                : undefined;
          const reasons = Array.isArray(item.payload.reasons)
            ? (item.payload.reasons as string[])
            : [];
          const detail =
            typeof item.payload.detail === "string" ? item.payload.detail : undefined;
          const riskScore =
            typeof item.payload.riskScore === "number" ? item.payload.riskScore : undefined;

          return (
            <article key={item.id} className="feed-item">
              <div className="feed-item-header">
                <div className="feed-item-left">
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                  <span className="feed-type">{item.type.toUpperCase()}</span>
                  {riskScore !== undefined && (
                    <span className="feed-score" style={{ color: scoreColor(riskScore) }}>
                      Score: {riskScore}/100
                    </span>
                  )}
                </div>
                <span className="muted-sm">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </span>
              </div>

              {detail && <p className="feed-detail">{detail}</p>}

              {reasons.length > 0 && (
                <ul className="reason-list">
                  {reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}

              {explorerUrl && (
                <a className="explorer-link" href={explorerUrl} target="_blank" rel="noreferrer">
                  View on QoreScan: {txHash ?? explorerUrl} ↗
                </a>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
