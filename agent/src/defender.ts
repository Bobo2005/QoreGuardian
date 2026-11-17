import {
  CHAIN_UPGRADE_V3_2_3,
  EthNativeSigner,
  buildRegisterPqcKeyMsg,
  fetchEvmWindow,
  fetchPqcStatus,
  isUpgradeApplied,
  openEvmWindowMsg,
  signProofOfPossession,
  unifiedAccountFromSeed,
  waitForTx,
} from "@qorechain/sdk";
import { createWalletClient, getAddress, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GUARDIAN_ACCOUNT_ABI } from "./abis.ts";
import {
  EXPLORER_URL,
  GUARDIAN_ACCOUNT_ADDRESS,
  GUARDIAN_PQC_RECOVERY_CODE,
  GUARDIAN_PRIVATE_KEY,
  QORE_COSMOS_CHAIN_ID,
  QORE_REST_URL,
  QORE_RPC_URL,
  publicClient,
  qorechainDiana,
  sdkClient,
} from "./config.ts";
import type { GuardianAction, RiskVerdict } from "./riskEngine.ts";

export interface DefenseExecutionResult {
  executed: boolean;
  action: GuardianAction;
  method?: "reduceLimits" | "freeze" | "forceMoveToVault";
  txHash?: Hex;
  explorerUrl?: string;
  detail: string;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

async function fetchAuthAccount(cosmosAddress: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const res = await fetch(`${QORE_REST_URL}/cosmos/auth/v1beta1/accounts/${cosmosAddress}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch auth account (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    account?: { account_number?: string; sequence?: string; base_account?: { account_number?: string; sequence?: string } };
  };
  const acc = data.account?.base_account ?? data.account;
  return {
    accountNumber: BigInt(acc?.account_number ?? "0"),
    sequence: BigInt(acc?.sequence ?? "0"),
  };
}

const restTransport = {
  async broadcastTx(txRawBytes: Uint8Array) {
    const res = await fetch(`${QORE_REST_URL}/cosmos/tx/v1beta1/txs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_bytes: Buffer.from(txRawBytes).toString("base64"),
        mode: "BROADCAST_MODE_SYNC",
      }),
    });
    if (!res.ok) {
      throw new Error(`Broadcast failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as {
      tx_response?: { txhash?: string; code?: number; codespace?: string; raw_log?: string };
    };
    const txRes = data.tx_response;
    if (!txRes?.txhash) {
      throw new Error(`Unexpected broadcast response: ${JSON.stringify(data)}`);
    }
    if (txRes.code && txRes.code !== 0) {
      return {
        transactionHash: txRes.txhash,
        code: txRes.code,
        codespace: txRes.codespace,
        rawLog: txRes.raw_log ?? "",
      };
    }
    const included = await waitForTx(sdkClient.rest, txRes.txhash);
    return {
      code: included.code,
      transactionHash: included.txHash ?? txRes.txhash,
      height: included.height,
      gasUsed: included.gasUsed,
      gasWanted: included.gasWanted,
      rawLog: included.rawLog,
    };
  },
};

export class GuardianDefender {
  private readonly privateKey: `0x${string}`;
  private readonly recoveryCode: string;
  private readonly account;
  private readonly walletClient;

  constructor(opts?: { privateKey?: `0x${string}`; recoveryCode?: string }) {
    const pk = opts?.privateKey ?? GUARDIAN_PRIVATE_KEY;
    const rc = opts?.recoveryCode ?? GUARDIAN_PQC_RECOVERY_CODE;
    if (!pk || pk === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      throw new Error("GUARDIAN_PRIVATE_KEY is required to run GuardianDefender");
    }
    if (!rc) {
      throw new Error("GUARDIAN_PQC_RECOVERY_CODE is required to open/renew Scoped EVM Windows");
    }
    this.privateKey = pk;
    this.recoveryCode = rc;
    this.account = privateKeyToAccount(pk);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: qorechainDiana,
      transport: http(QORE_RPC_URL),
    });
  }

  get address(): Address {
    return this.account.address;
  }

  /**
   * Ensures the Guardian Agent has a live Scoped EVM Window locked strictly to
   * `GUARDIAN_ACCOUNT_ADDRESS` before sending a defensive EVM transaction.
   */
  async ensureScopedEvmWindow(): Promise<void> {
    const guardianUnified = unifiedAccountFromSeed(hexToBytes(this.privateKey), {
      recoveryCode: this.recoveryCode,
    });

    const currentWindow = await fetchEvmWindow({
      rest: QORE_REST_URL,
      address: guardianUnified.cosmos,
    });

    const targetLower = GUARDIAN_ACCOUNT_ADDRESS.toLowerCase();
    const hasMatchingTarget =
      currentWindow.live &&
      Number(currentWindow.remainingBlocks ?? 0) > 5 &&
      Number(currentWindow.remainingTxs ?? 0) > 0 &&
      (currentWindow.allowedTargets ?? []).some((t) => t.toLowerCase() === targetLower);

    if (hasMatchingTarget) {
      return;
    }

    const fee = {
      amount: [{ denom: "uqor", amount: "100000" }],
      gas: "400000",
    };

    const pqcStatus = await fetchPqcStatus({
      rest: QORE_REST_URL,
      address: guardianUnified.cosmos,
    });

    if (!pqcStatus.registered) {
      const { accountNumber, sequence } = await fetchAuthAccount(guardianUnified.cosmos);
      const popApplied = await isUpgradeApplied({
        rest: QORE_REST_URL,
        upgrade: CHAIN_UPGRADE_V3_2_3,
      });
      const proofOfPossession = popApplied
        ? signProofOfPossession({
            chainId: QORE_COSMOS_CHAIN_ID,
            account: guardianUnified.cosmos,
            keypair: guardianUnified.pqc,
          })
        : undefined;
      const regMsg = buildRegisterPqcKeyMsg(guardianUnified.cosmos, {
        pqcKeypair: guardianUnified.pqc,
        ecdsaPubkey: hexToBytes(guardianUnified.publicKey),
        proofOfPossession,
      });
      const classicalSigner = new EthNativeSigner(guardianUnified, {
        rest: QORE_REST_URL,
        signMode: "classical",
      });
      const regRes = await classicalSigner.signAndBroadcast(restTransport, {
        chainId: QORE_COSMOS_CHAIN_ID,
        accountNumber,
        sequence,
        fee,
        messages: [regMsg],
      });
      if (regRes.code !== 0) {
        throw new Error(`Failed to register Guardian PQC key: ${regRes.rawLog}`);
      }
    }

    const { accountNumber, sequence } = await fetchAuthAccount(guardianUnified.cosmos);
    const signer = new EthNativeSigner(guardianUnified, { rest: QORE_REST_URL });
    const openMsg = openEvmWindowMsg({
      sender: guardianUnified.cosmos,
      blocks: 600,
      maxTxs: 20,
      maxValue: "5000000",
      nativeOnly: false,
      allowedTargets: [getAddress(GUARDIAN_ACCOUNT_ADDRESS)],
    });
    const openRes = await signer.signAndBroadcast(restTransport, {
      chainId: QORE_COSMOS_CHAIN_ID,
      accountNumber,
      sequence,
      fee,
      messages: [openMsg],
    });
    if (openRes.code !== 0) {
      throw new Error(`Failed to open Scoped EVM Window: ${openRes.rawLog}`);
    }
  }

  /**
   * Executes the autonomous defense recommended by `RiskVerdict` on `GuardianAccount.sol`.
   */
  async executeDefense(verdict: RiskVerdict): Promise<DefenseExecutionResult> {
    if (verdict.action === "ALLOW") {
      return {
        executed: false,
        action: verdict.action,
        detail: "Risk score below threshold; no on-chain action taken.",
      };
    }

    const [isFrozen, balance] = await Promise.all([
      publicClient.readContract({
        address: GUARDIAN_ACCOUNT_ADDRESS,
        abi: GUARDIAN_ACCOUNT_ABI,
        functionName: "isFrozen",
      }),
      publicClient.getBalance({ address: GUARDIAN_ACCOUNT_ADDRESS }),
    ]);

    if (verdict.action === "FREEZE_AND_FORCE_MOVE") {
      if (balance === 0n) {
        if (isFrozen) {
          return {
            executed: false,
            action: verdict.action,
            detail: "GuardianAccount is already frozen with 0 QOR balance.",
          };
        }
        await this.ensureScopedEvmWindow();
        const txHash = await this.writeGuardian("freeze", []);
        return {
          executed: true,
          action: verdict.action,
          method: "freeze",
          txHash,
          explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
          detail: "Account balance is 0 QOR; executed freeze() on GuardianAccount.",
        };
      }

      await this.ensureScopedEvmWindow();
      const txHash = await this.writeGuardian("forceMoveToVault", []);
      return {
        executed: true,
        action: verdict.action,
        method: "forceMoveToVault",
        txHash,
        explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
        detail: "Executed forceMoveToVault(): account frozen and 100% of funds evacuated to RecoveryVault.",
      };
    }

    if (verdict.action === "FREEZE") {
      if (isFrozen) {
        return {
          executed: false,
          action: verdict.action,
          detail: "GuardianAccount is already frozen.",
        };
      }
      await this.ensureScopedEvmWindow();
      const txHash = await this.writeGuardian("freeze", []);
      return {
        executed: true,
        action: verdict.action,
        method: "freeze",
        txHash,
        explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
        detail: "Executed freeze() on GuardianAccount.",
      };
    }

    // REDUCE_LIMITS
    const [perTxLimit, dailyLimit] = await Promise.all([
      publicClient.readContract({
        address: GUARDIAN_ACCOUNT_ADDRESS,
        abi: GUARDIAN_ACCOUNT_ABI,
        functionName: "perTxLimit",
      }),
      publicClient.readContract({
        address: GUARDIAN_ACCOUNT_ADDRESS,
        abi: GUARDIAN_ACCOUNT_ABI,
        functionName: "dailyLimit",
      }),
    ]);

    const newPerTx = perTxLimit > 1n ? perTxLimit / 2n : perTxLimit;
    const newDaily = dailyLimit > 1n ? dailyLimit / 2n : dailyLimit;
    const clampedPerTx = newPerTx > newDaily ? newDaily : newPerTx;

    await this.ensureScopedEvmWindow();
    const txHash = await this.writeGuardian("reduceLimits", [clampedPerTx, newDaily]);
    return {
      executed: true,
      action: verdict.action,
      method: "reduceLimits",
      txHash,
      explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
      detail: `Reduced limits to perTx=${clampedPerTx.toString()} wei, daily=${newDaily.toString()} wei.`,
    };
  }

  private async writeGuardian(
    functionName: "reduceLimits" | "freeze" | "forceMoveToVault",
    args: readonly [] | readonly [bigint, bigint]
  ): Promise<Hex> {
    const nonce = await publicClient.getTransactionCount({
      address: this.account.address,
      blockTag: "pending",
    });
    const txHash = await this.walletClient.writeContract({
      address: GUARDIAN_ACCOUNT_ADDRESS,
      abi: GUARDIAN_ACCOUNT_ABI,
      functionName,
      args: args as never,
      nonce,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`Guardian tx ${txHash} reverted`);
    }
    return txHash;
  }
}
