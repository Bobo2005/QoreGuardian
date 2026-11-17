import { formatEther } from "viem";
import { GUARDIAN_ACCOUNT_ABI, RECOVERY_VAULT_ABI } from "./abis.ts";
import {
  GUARDIAN_ACCOUNT_ADDRESS,
  QORE_CHAIN_ID,
  QORE_RPC_URL,
  RECOVERY_VAULT_ADDRESS,
  publicClient,
} from "./config.ts";

export interface GuardianAccountSnapshot {
  address: string;
  balanceWei: bigint;
  owner: string;
  guardianAgent: string;
  recoveryVault: string;
  ownerPqcKeyHash: string;
  perTxLimit: bigint;
  dailyLimit: bigint;
  spentToday: bigint;
  lastResetTimestamp: bigint;
  emergencyNonce: bigint;
  isFrozen: boolean;
  vaultBalanceForOwner: bigint;
  vaultPqcKeyHashForOwner: string;
  vaultNonceForOwner: bigint;
}

export async function readGuardianSnapshot(): Promise<GuardianAccountSnapshot> {
  const [
    balanceWei,
    owner,
    guardianAgent,
    recoveryVault,
    ownerPqcKeyHash,
    perTxLimit,
    dailyLimit,
    spentToday,
    lastResetTimestamp,
    emergencyNonce,
    isFrozen,
  ] = await Promise.all([
    publicClient.getBalance({ address: GUARDIAN_ACCOUNT_ADDRESS }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "OWNER" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "guardianAgent" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "RECOVERY_VAULT" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "OWNER_PQC_KEY_HASH" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "perTxLimit" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "dailyLimit" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "spentToday" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "lastResetTimestamp" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "emergencyNonce" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "isFrozen" }),
  ]);

  const [vaultBalanceForOwner, vaultPqcKeyHashForOwner, vaultNonceForOwner] = await Promise.all([
    publicClient.readContract({
      address: RECOVERY_VAULT_ADDRESS,
      abi: RECOVERY_VAULT_ABI,
      functionName: "balances",
      args: [owner],
    }),
    publicClient.readContract({
      address: RECOVERY_VAULT_ADDRESS,
      abi: RECOVERY_VAULT_ABI,
      functionName: "registeredOwnerPqcKeyHash",
      args: [owner],
    }),
    publicClient.readContract({
      address: RECOVERY_VAULT_ADDRESS,
      abi: RECOVERY_VAULT_ABI,
      functionName: "nonces",
      args: [owner],
    }),
  ]);

  return {
    address: GUARDIAN_ACCOUNT_ADDRESS,
    balanceWei,
    owner,
    guardianAgent,
    recoveryVault,
    ownerPqcKeyHash,
    perTxLimit,
    dailyLimit,
    spentToday,
    lastResetTimestamp,
    emergencyNonce,
    isFrozen,
    vaultBalanceForOwner,
    vaultPqcKeyHashForOwner,
    vaultNonceForOwner,
  };
}

const isEntrypoint = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isEntrypoint) {
  const snap = await readGuardianSnapshot();
  console.log(`=== QoreGuardian Live State (Chain ${QORE_CHAIN_ID} @ ${QORE_RPC_URL}) ===`);
  console.log(`GuardianAccount: ${snap.address}`);
  console.log(`Balance:         ${formatEther(snap.balanceWei)} QOR`);
  console.log(`Owner:           ${snap.owner}`);
  console.log(`Guardian Agent:  ${snap.guardianAgent}`);
  console.log(`RecoveryVault:   ${snap.recoveryVault}`);
  console.log(`Per-Tx Limit:    ${formatEther(snap.perTxLimit)} QOR`);
  console.log(`Daily Limit:     ${formatEther(snap.dailyLimit)} QOR`);
  console.log(`Spent Today:     ${formatEther(snap.spentToday)} QOR`);
  console.log(`Frozen:          ${snap.isFrozen}`);
  console.log(`Emergency Nonce: ${snap.emergencyNonce}`);
  console.log(`Vault Balance:   ${formatEther(snap.vaultBalanceForOwner)} QOR`);
  console.log(`Vault PQC Hash:  ${snap.vaultPqcKeyHashForOwner}`);
  console.log(`Vault Nonce:     ${snap.vaultNonceForOwner}`);
}
