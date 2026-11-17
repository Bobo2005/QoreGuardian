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

const CHAIN_ID = "qorechain-diana";
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
  throw new Error("Missing .env.testnet.local");
}

const env = parseEnvFile(envPath);
const deployerPrivateKey = env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!deployerPrivateKey) {
  throw new Error("DEPLOYER_PRIVATE_KEY is missing in .env.testnet.local");
}

let deployerRecoveryCode = env.DEPLOYER_PQC_RECOVERY_CODE;
if (!deployerRecoveryCode) {
  deployerRecoveryCode = generatePqcRecoveryCode();
  appendEnvVar(envPath, "DEPLOYER_PQC_RECOVERY_CODE", deployerRecoveryCode);
  console.log("Generated & saved DEPLOYER_PQC_RECOVERY_CODE to .env.testnet.local");
}

const deployerUnified = unifiedAccountFromSeed(hexToBytes(deployerPrivateKey), {
  recoveryCode: deployerRecoveryCode,
});

console.log("=== Deployer PQC & EVM Window Setup ===");
console.log(`Deployer Cosmos: ${deployerUnified.cosmos}`);
console.log(`Deployer EVM:    ${deployerUnified.evm}`);

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

const fee = {
  amount: [{ denom: "uqor", amount: "100000" }],
  gas: "400000",
};

const pqcStatus = await fetchPqcStatus({ rest: REST_URL, address: deployerUnified.cosmos });
console.log(`On-chain PQC registered: ${pqcStatus.registered}`);

if (!pqcStatus.registered) {
  console.log("Registering Deployer ML-DSA-87 key on-chain...");
  const { accountNumber, sequence } = await fetchAuthAccount(deployerUnified.cosmos);
  const popApplied = await isUpgradeApplied({ rest: REST_URL, upgrade: CHAIN_UPGRADE_V3_2_3 });
  const proofOfPossession = popApplied
    ? signProofOfPossession({
        chainId: CHAIN_ID,
        account: deployerUnified.cosmos,
        keypair: deployerUnified.pqc,
      })
    : undefined;
  const regMsg = buildRegisterPqcKeyMsg(deployerUnified.cosmos, {
    pqcKeypair: deployerUnified.pqc,
    ecdsaPubkey: hexToBytes(deployerUnified.publicKey),
    proofOfPossession,
  });
  const classicalSigner = new EthNativeSigner(deployerUnified, { rest: REST_URL, signMode: "classical" });
  const regRes = await classicalSigner.signAndBroadcast(restTransport, {
    chainId: CHAIN_ID,
    accountNumber,
    sequence,
    fee,
    messages: [regMsg],
  });
  console.log(`PQC key registered (code=${regRes.code})`);
  if (regRes.code !== 0) {
    throw new Error(`Failed to register PQC key: ${regRes.rawLog}`);
  }
}

console.log("Opening EVM Window for Deployer (unscoped for contract deployment)...");
const { accountNumber, sequence } = await fetchAuthAccount(deployerUnified.cosmos);
const signer = new EthNativeSigner(deployerUnified, { rest: REST_URL });
const openMsg = openEvmWindowMsg({
  sender: deployerUnified.cosmos,
  blocks: 1800,
  maxTxs: 20,
  maxValue: "10000000", // 10 QOR in uqor
  nativeOnly: false,
});

const openRes = await signer.signAndBroadcast(restTransport, {
  chainId: CHAIN_ID,
  accountNumber,
  sequence,
  fee,
  messages: [openMsg],
});
console.log(`MsgOpenEVMWindow (code=${openRes.code})`);
if (openRes.code !== 0) {
  throw new Error(`MsgOpenEVMWindow failed: ${openRes.rawLog}`);
}

const windowState = await fetchEvmWindow({ rest: REST_URL, address: deployerUnified.cosmos });
console.log("Live Deployer EVM Window:");
console.log(JSON.stringify(windowState, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
