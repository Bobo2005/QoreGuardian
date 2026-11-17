import { formatEther, type Address, type Hex } from "viem";
import { GUARDIAN_ACCOUNT_ABI } from "./abis.ts";
import { EXPLORER_URL, GUARDIAN_ACCOUNT_ADDRESS, publicClient } from "./config.ts";
import type { DefenseExecutionResult, GuardianDefender } from "./defender.ts";
import { readGuardianSnapshot } from "./index.ts";
import { assessTransactionRisk, type RiskVerdict } from "./riskEngine.ts";

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  type: "state" | "assessment" | "defense" | "onchain_event" | "error";
  payload: Record<string, unknown>;
}

export type TelemetryListener = (event: TelemetryEvent) => void;

export class GuardianMonitor {
  private readonly defender?: GuardianDefender;
  private readonly listeners = new Set<TelemetryListener>();
  private readonly history: TelemetryEvent[] = [];
  private readonly recentTxTimestamps: number[] = [];
  private lastBlockChecked: bigint | null = null;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(defender?: GuardianDefender) {
    this.defender = defender;
  }

  subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getHistory(): TelemetryEvent[] {
    return [...this.history];
  }

  getRecentTxCountLastHour(): number {
    const cutoff = Date.now() - 3600_000;
    while (this.recentTxTimestamps.length > 0 && this.recentTxTimestamps[0] < cutoff) {
      this.recentTxTimestamps.shift();
    }
    return this.recentTxTimestamps.length;
  }

  emit(type: TelemetryEvent["type"], payload: Record<string, unknown>): TelemetryEvent {
    const event: TelemetryEvent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      type,
      payload,
    };
    this.history.push(event);
    if (this.history.length > 100) {
      this.history.shift();
    }
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  async evaluateAndDefend(params: {
    from?: Address;
    to: Address;
    valueWei: bigint;
    data?: Hex;
    promptText?: string;
    leakedKeySignal?: boolean;
    recentTxCountLastHour?: number;
    executeDefense?: boolean;
    useLivePreflight?: boolean;
  }): Promise<{ verdict: RiskVerdict; defense?: DefenseExecutionResult }> {
    this.recentTxTimestamps.push(Date.now());
    const snap = await readGuardianSnapshot();
    const isAllowlisted = await publicClient.readContract({
      address: GUARDIAN_ACCOUNT_ADDRESS,
      abi: GUARDIAN_ACCOUNT_ABI,
      functionName: "allowlist",
      args: [params.to],
    });

    const verdict = await assessTransactionRisk({
      from: params.from ?? (snap.owner as Address),
      to: params.to,
      valueWei: params.valueWei,
      data: params.data,
      promptText: params.promptText,
      context: {
        perTxLimitWei: snap.perTxLimit,
        dailyLimitWei: snap.dailyLimit,
        spentTodayWei: snap.spentToday,
        baselineTxWei: snap.perTxLimit / 10n > 0n ? snap.perTxLimit / 10n : 1n,
        isAllowlisted,
        recentTxCountLastHour: params.recentTxCountLastHour ?? this.getRecentTxCountLastHour(),
        leakedKeySignal: params.leakedKeySignal ?? false,
      },
      client: params.useLivePreflight === false ? undefined : publicClient,
    });

    this.emit("assessment", {
      to: params.to,
      valueQor: formatEther(params.valueWei),
      riskScore: verdict.riskScore,
      action: verdict.action,
      reasons: verdict.reasons,
      preflight: verdict.preflight,
    });

    let defense: DefenseExecutionResult | undefined;
    if (params.executeDefense !== false && verdict.action !== "ALLOW") {
      if (!this.defender) {
        defense = {
          executed: false,
          action: verdict.action,
          detail: "GuardianDefender not configured (missing GUARDIAN_PRIVATE_KEY or recovery code).",
        };
      } else {
        defense = await this.defender.executeDefense(verdict);
      }
      this.emit("defense", { ...defense });
    }

    return { verdict, defense };
  }

  async pollOnce(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const latestBlock = await publicClient.getBlockNumber();
      if (this.lastBlockChecked === null) {
        this.lastBlockChecked = latestBlock > 5n ? latestBlock - 5n : 0n;
      }
      if (latestBlock > this.lastBlockChecked) {
        const logs = await publicClient.getLogs({
          address: GUARDIAN_ACCOUNT_ADDRESS,
          fromBlock: this.lastBlockChecked + 1n,
          toBlock: latestBlock,
        });

        for (const log of logs) {
          this.emit("onchain_event", {
            blockNumber: log.blockNumber?.toString(),
            txHash: log.transactionHash,
            explorerUrl: log.transactionHash ? `${EXPLORER_URL}/tx/${log.transactionHash}` : undefined,
            topics: log.topics,
          });
        }
        this.lastBlockChecked = latestBlock;
      }
    } catch (err) {
      this.emit("error", {
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.polling = false;
    }
  }

  start(intervalMs = 5000): void {
    if (this.timer) return;
    void this.pollOnce();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
