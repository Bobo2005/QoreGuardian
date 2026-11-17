import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const require = createRequire(path.join(rootDir, "web", "package.json"));

const {
  CHAIN_UPGRADE_V3_2_3,
  EthNativeSigner,
  buildRegisterPqcKeyMsg,
  classifyEvmWindowRejection,
  createClient,
  fetchEvmWindow,
  fetchPqcStatus,
  generatePqcRecoveryCode,
  isUpgradeApplied,
  openEvmWindowMsg,
  signProofOfPossession,
  unifiedAccountFromSeed,
  waitForTx,
} = require("@qorechain/sdk");
const { mldsa87 } = require("@qorechain/pqc");
const {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const CHAIN_ID = "qorechain-diana";
const EVM_CHAIN_ID = 9800;
const REST_URL = "https://api-testnet.qore.host";
const EVM_RPC_URL = "https://evm-testnet.qore.host";

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

function appendEnvVar(filePath: string, key: string, value: string): void {
  const content = fs.readFileSync(filePath, "utf8");
  const suffix = content.endsWith("\n") ? "" : "\n";
  fs.writeFileSync(filePath, `${content}${suffix}${key}=${value}\n`, "utf8");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

async function fetchAuthAccount(cosmosAddress: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const res = await fetch(`${REST_URL}/cosmos/auth/v1beta1/accounts/${cosmosAddress}`);
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

const envPath = path.join(rootDir, ".env.testnet.local");
if (!fs.existsSync(envPath)) {
  throw new Error("Missing .env.testnet.local — run Phase 3 setup first.");
}

const env = parseEnvFile(envPath);
const guardianPrivateKey = env.GUARDIAN_PRIVATE_KEY as `0x${string}` | undefined;
if (!guardianPrivateKey) {
  throw new Error("GUARDIAN_PRIVATE_KEY is missing in .env.testnet.local");
}

let guardianRecoveryCode = env.GUARDIAN_PQC_RECOVERY_CODE;
if (!guardianRecoveryCode) {
  guardianRecoveryCode = generatePqcRecoveryCode();
  appendEnvVar(envPath, "GUARDIAN_PQC_RECOVERY_CODE", guardianRecoveryCode);
  console.log("Generated & saved GUARDIAN_PQC_RECOVERY_CODE to .env.testnet.local");
}

const seed32 = hexToBytes(guardianPrivateKey);
const guardianUnified = unifiedAccountFromSeed(seed32, { recoveryCode: guardianRecoveryCode });
const evmAccount = privateKeyToAccount(guardianPrivateKey);

// Target to allow in the scoped EVM window: GuardianAccount.sol once deployed, or OWNER_ADDRESS / fallback for pre-deploy probe.
const allowedTarget = getAddress(
  env.GUARDIAN_ACCOUNT_ADDRESS ||
    (env.OWNER_ADDRESS?.startsWith("0x") ? env.OWNER_ADDRESS : evmAccount.address)
);
const disallowedTarget = getAddress("0x000000000000000000000000000000000000dead");

console.log("=== Phase 8: Scoped EVM Window Verification ===");
console.log(`Guardian Cosmos:   ${guardianUnified.cosmos}`);
console.log(`Guardian EVM:      ${guardianUnified.evm}`);
console.log(`Allowed Target:    ${allowedTarget}`);
console.log(`Disallowed Target: ${disallowedTarget}`);

// Local PQC sanity check on the unified account
const probeMsg = new TextEncoder().encode("phase8-window-check");
const probeSig = mldsa87.sign(guardianUnified.pqc.secretKey, probeMsg);
if (!mldsa87.verify(guardianUnified.pqc.publicKey, probeMsg, probeSig)) {
  throw new Error("Local ML-DSA-87 verification failed for guardianUnified");
}

const sdkClient = createClient({
  network: "testnet",
  endpoints: { rest: REST_URL, evmRpc: EVM_RPC_URL },
});

const restTransport = {
  async broadcastTx(txRawBytes: Uint8Array) {
    const res = await fetch(`${REST_URL}/cosmos/tx/v1beta1/txs`, {
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
    return waitForTx(sdkClient.rest, txRes.txhash);
  },
};

const pqcStatus = await fetchPqcStatus({ rest: REST_URL, address: guardianUnified.cosmos });
console.log(`\nOn-chain PQC registered: ${pqcStatus.registered}`);

const signer = new EthNativeSigner(guardianUnified, { rest: REST_URL });
const fee = {
  amount: [{ denom: "uqor", amount: "100000" }],
  gas: "400000",
};

if (!pqcStatus.registered) {
  console.log("Registering Guardian ML-DSA-87 key on-chain...");
  const { accountNumber, sequence } = await fetchAuthAccount(guardianUnified.cosmos);
  const popApplied = await isUpgradeApplied({ rest: REST_URL, upgrade: CHAIN_UPGRADE_V3_2_3 });
  const proofOfPossession = popApplied
    ? signProofOfPossession({
        chainId: CHAIN_ID,
        account: guardianUnified.cosmos,
        keypair: guardianUnified.pqc,
      })
    : undefined;
  const regMsg = buildRegisterPqcKeyMsg(guardianUnified.cosmos, {
    pqcKeypair: guardianUnified.pqc,
    ecdsaPubkey: hexToBytes(guardianUnified.publicKey),
    proofOfPossession,
  });
  const classicalSigner = new EthNativeSigner(guardianUnified, { rest: REST_URL, signMode: "classical" });
  const regRes = await classicalSigner.signAndBroadcast(restTransport, {
    chainId: CHAIN_ID,
    accountNumber,
    sequence,
    fee,
    messages: [regMsg],
  });
  console.log(`PQC key registered tx: ${regRes.transactionHash} (code=${regRes.code})`);
  if (regRes.code !== 0) {
    throw new Error(`Failed to register PQC key: ${regRes.rawLog}`);
  }
}

console.log("\nOpening Scoped EVM Window (allowedTargets = [allowedTarget])...");
const { accountNumber, sequence } = await fetchAuthAccount(guardianUnified.cosmos);
const openMsg = openEvmWindowMsg({
  sender: guardianUnified.cosmos,
  blocks: 300,
  maxTxs: 10,
  maxValue: "5000000", // 5 QOR in uqor (value + max fee)
  nativeOnly: false,
  allowedTargets: [allowedTarget],
});

const openRes = await signer.signAndBroadcast(restTransport, {
  chainId: CHAIN_ID,
  accountNumber,
  sequence,
  fee,
  messages: [openMsg],
});
console.log(`MsgOpenEVMWindow tx: ${openRes.transactionHash} (code=${openRes.code})`);
if (openRes.code !== 0) {
  throw new Error(`MsgOpenEVMWindow failed: ${openRes.rawLog}`);
}

const windowState = await fetchEvmWindow({ rest: REST_URL, address: guardianUnified.cosmos });
console.log("\n=== Live On-Chain EVM Window State ===");
console.log(JSON.stringify(windowState, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));

const chain = {
  id: EVM_CHAIN_ID,
  name: "QoreChain Testnet",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC_URL] } },
};

const publicClient = createPublicClient({ chain, transport: http(EVM_RPC_URL) });
const walletClient = createWalletClient({ account: evmAccount, chain, transport: http(EVM_RPC_URL) });

// 1. Read fresh EVM nonce AFTER opening the window
const evmNonce = await publicClient.getTransactionCount({ address: evmAccount.address });
console.log(`\nEVM nonce after opening window: ${evmNonce}`);

// 2. Send to ALLOWED target (should succeed)
console.log(`Sending 1 wei to ALLOWED target (${allowedTarget})...`);
const allowedHash = await walletClient.sendTransaction({
  to: allowedTarget,
  value: 1n,
  nonce: evmNonce,
  gas: 25000n,
});
const allowedReceipt = await publicClient.waitForTransactionReceipt({ hash: allowedHash });
console.log(`Allowed target tx SUCCEEDED: ${allowedHash} (status=${allowedReceipt.status})`);

// 3. Send to DISALLOWED target (must be rejected by protocol)
console.log(`Sending 1 wei to DISALLOWED target (${disallowedTarget})...`);
try {
  const badHash = await walletClient.sendTransaction({
    to: disallowedTarget,
    value: 1n,
    nonce: evmNonce + 1,
    gas: 25000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: badHash });
  throw new Error(`SECURITY FAILURE: Disallowed target tx unexpectedly succeeded: ${badHash}`);
} catch (err) {
  const reason = classifyEvmWindowRejection(err);
  console.log(`Disallowed target REJECTED by protocol as expected! Classification: ${reason ?? "rejected"}`);
}

console.log("\nPhase 8 Scoped EVM Window Verification PASSED!");
