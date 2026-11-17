import {
  RISK_LEVEL_UNSAFE_THRESHOLD,
  simulateWithRiskScore,
  type PreflightResult,
  type PreflightTx,
} from "@qorechain/sdk";
import { formatEther, type Address, type Hex, type PublicClient } from "viem";

export type GuardianAction =
  | "ALLOW"
  | "REDUCE_LIMITS"
  | "FREEZE"
  | "FREEZE_AND_FORCE_MOVE";

export interface RiskContext {
  perTxLimitWei: bigint;
  dailyLimitWei: bigint;
  spentTodayWei: bigint;
  baselineTxWei: bigint;
  isAllowlisted: boolean;
  recentTxCountLastHour: number;
  leakedKeySignal: boolean;
}

export interface RiskAssessmentInput {
  from: Address;
  to: Address;
  valueWei: bigint;
  data?: Hex;
  promptText?: string;
  context: RiskContext;
  /** Optional pre-flight override for deterministic unit testing. */
  preflightOverride?: PreflightResult;
  /** Optional viem PublicClient to run live QoreChain `simulateWithRiskScore`. */
  client?: PublicClient;
}

export interface SerializedPreflight {
  available: boolean;
  safe?: boolean;
  gas?: string;
  riskLevel?: number;
  riskScore?: string;
  anomalyFlagged?: boolean;
  anomalyScore?: string;
  error?: string;
}

export interface RiskVerdict {
  riskScore: number;
  action: GuardianAction;
  reasons: string[];
  preflight: SerializedPreflight;
}

const PROMPT_INJECTION_RULES: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "instruction-override", pattern: /ignore\s+(all\s+)?(previous|prior)\s+instructions/i },
  { label: "security-bypass", pattern: /bypass\s+(limits?|guardian|freeze|security|allowlist)/i },
  { label: "drain-directive", pattern: /drain\s+(all|wallet|vault|treasury|funds)/i },
  { label: "policy-override", pattern: /override\s+(policy|allowlist|safety|limits?)/i },
  { label: "full-balance-exfil", pattern: /(send|transfer|sweep)\s+(all|100%|entire)\s+(balance|funds)/i },
  { label: "disable-guardian", pattern: /disable\s+guardian/i },
  { label: "system-prompt-probe", pattern: /(reveal|print|ignore)\s+system\s+prompt/i },
];

export function detectPromptInjection(text?: string): string[] {
  if (!text) return [];
  const matches: string[] = [];
  for (const rule of PROMPT_INJECTION_RULES) {
    if (rule.pattern.test(text)) {
      matches.push(rule.label);
    }
  }
  return matches;
}

export function actionForScore(score: number): GuardianAction {
  if (score >= 85) return "FREEZE_AND_FORCE_MOVE";
  if (score >= 65) return "FREEZE";
  if (score >= 35) return "REDUCE_LIMITS";
  return "ALLOW";
}

function serializePreflight(result: PreflightResult): SerializedPreflight {
  return {
    available: true,
    safe: result.safe,
    gas: result.gas.toString(),
    riskLevel: result.risk.level,
    riskScore: result.risk.score.toString(),
    anomalyFlagged: result.anomaly.flagged,
    anomalyScore: result.anomaly.anomalyScore.toString(),
  };
}

export async function assessTransactionRisk(
  input: RiskAssessmentInput
): Promise<RiskVerdict> {
  let score = 0;
  const reasons: string[] = [];

  // 1. Leaked-key / Q-Day compromise signal
  if (input.context.leakedKeySignal) {
    score += 90;
    reasons.push(
      "Critical: Transaction uses or is linked to a known leaked classical key (Q-Day compromise signal)."
    );
  }

  // 2. Prompt-injection detection on accompanying instruction/memo
  const injectionMatches = detectPromptInjection(input.promptText);
  if (injectionMatches.length > 0) {
    score += 60;
    reasons.push(
      `Prompt-injection pattern detected (${injectionMatches.join(", ")}).`
    );
  }

  // 3. Recipient allowlist check
  if (!input.context.isAllowlisted) {
    score += 25;
    reasons.push(`Recipient ${input.to} is not on the GuardianAccount allowlist.`);
  }

  // 4. Amount vs. per-tx limit, daily limit, and baseline
  if (input.valueWei > input.context.perTxLimitWei) {
    score += 30;
    reasons.push(
      `Value (${formatEther(input.valueWei)} QOR) exceeds per-tx limit (${formatEther(input.context.perTxLimitWei)} QOR).`
    );
  }

  const projectedDaily = input.context.spentTodayWei + input.valueWei;
  if (projectedDaily > input.context.dailyLimitWei) {
    score += 25;
    reasons.push(
      `Projected daily spend (${formatEther(projectedDaily)} QOR) exceeds daily limit (${formatEther(input.context.dailyLimitWei)} QOR).`
    );
  }

  if (input.context.baselineTxWei > 0n) {
    if (input.valueWei >= input.context.baselineTxWei * 10n) {
      score += 25;
      reasons.push(
        `Amount (${formatEther(input.valueWei)} QOR) is >=10x above baseline (${formatEther(input.context.baselineTxWei)} QOR).`
      );
    } else if (input.valueWei >= input.context.baselineTxWei * 3n) {
      score += 12;
      reasons.push(
        `Amount (${formatEther(input.valueWei)} QOR) is >=3x above baseline (${formatEther(input.context.baselineTxWei)} QOR).`
      );
    }
  }

  // 5. Velocity spike
  if (input.context.recentTxCountLastHour >= 10) {
    score += 25;
    reasons.push(
      `Severe velocity spike: ${input.context.recentTxCountLastHour} transactions in the last hour.`
    );
  } else if (input.context.recentTxCountLastHour >= 5) {
    score += 12;
    reasons.push(
      `Elevated velocity: ${input.context.recentTxCountLastHour} transactions in the last hour.`
    );
  }

  // 6. QoreChain `simulateWithRiskScore` pre-flight check
  let preflight: SerializedPreflight = { available: false };
  let preflightResult: PreflightResult | undefined = input.preflightOverride;

  if (!preflightResult && input.client) {
    const tx: PreflightTx = {
      from: input.from,
      to: input.to,
      value: input.valueWei,
      data: input.data,
    };
    try {
      preflightResult = await simulateWithRiskScore(input.client, tx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      score += 10;
      reasons.push(`Pre-flight simulation reverted or failed: ${msg}`);
      preflight = { available: false, error: msg };
    }
  }

  if (preflightResult) {
    preflight = serializePreflight(preflightResult);
    if (preflightResult.anomaly.flagged) {
      score += 25;
      reasons.push(
        `QoreChain aiAnomalyCheck flagged (from, value) as anomalous (anomalyScore=${preflightResult.anomaly.anomalyScore}).`
      );
    }
    if (preflightResult.risk.level >= RISK_LEVEL_UNSAFE_THRESHOLD) {
      score += 25;
      reasons.push(
        `QoreChain aiRiskScore reported unsafe level ${preflightResult.risk.level} (score=${preflightResult.risk.score}).`
      );
    } else if (preflightResult.risk.level >= 2) {
      score += 10;
      reasons.push(
        `QoreChain aiRiskScore reported elevated level ${preflightResult.risk.level} (score=${preflightResult.risk.score}).`
      );
    }
  }

  const clampedScore = Math.max(0, Math.min(100, score));
  const action = actionForScore(clampedScore);

  if (reasons.length === 0) {
    reasons.push("Transaction matches baseline behavior, allowlist, and pre-flight checks.");
  }

  return {
    riskScore: clampedScore,
    action,
    reasons,
    preflight,
  };
}
