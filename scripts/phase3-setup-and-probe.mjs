import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const require = createRequire(path.join(rootDir, "web", "package.json"));

const { mldsa87 } = require("@qorechain/pqc");
const { bech32ToHex } = require("@qorechain/sdk");
const { createPublicClient, formatEther, getAddress, http, keccak256, toHex } = require("viem");
const { generatePrivateKey, privateKeyToAccount } = require("viem/accounts");

function toEvmAddress(addr) {
  if (!addr) return addr;
  return addr.startsWith("0x") ? getAddress(addr) : getAddress(bech32ToHex(addr));
}

const RPC_URL = "https://evm-testnet.qore.host";
const CHAIN_ID = 9800;
const PQC_VERIFY_ADDRESS = getAddress("0x0000000000000000000000000000000000000a01");

const IQORE_PQC_ABI = [
  {
    type: "function",
    name: "pqcVerify",
    stateMutability: "view",
    inputs: [
      { name: "pubkey", type: "bytes" },
      { name: "signature", type: "bytes" },
      { name: "message", type: "bytes" },
    ],
    outputs: [{ name: "valid", type: "bool" }],
  },
];

const envPath = path.join(rootDir, ".env.testnet.local");
const shouldRegen = process.argv.includes("--regen");

function parseEnvFile(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

let env;
if (fs.existsSync(envPath) && !shouldRegen) {
  env = parseEnvFile(envPath);
  console.log("Loaded existing testnet wallets from .env.testnet.local");
} else {
  const deployerPk = generatePrivateKey();
  const ownerPk = generatePrivateKey();
  const guardianPk = generatePrivateKey();
  const qdayThrowawayPk = generatePrivateKey();

  const deployer = privateKeyToAccount(deployerPk);
  const owner = privateKeyToAccount(ownerPk);
  const guardian = privateKeyToAccount(guardianPk);
  const qdayThrowaway = privateKeyToAccount(qdayThrowawayPk);

  const ownerPqc = mldsa87.keygen();
  const ownerPqcPubHex = toHex(ownerPqc.publicKey);
  const ownerPqcSecHex = toHex(ownerPqc.secretKey);
  const ownerPqcPubHash = keccak256(ownerPqcPubHex);

  env = {
    QORE_RPC_URL: RPC_URL,
    QORE_CHAIN_ID: String(CHAIN_ID),
    DEPLOYER_PRIVATE_KEY: deployerPk,
    DEPLOYER_ADDRESS: deployer.address,
    OWNER_PRIVATE_KEY: ownerPk,
    OWNER_ADDRESS: owner.address,
    OWNER_PQC_PUBLIC_KEY: ownerPqcPubHex,
    OWNER_PQC_SECRET_KEY: ownerPqcSecHex,
    OWNER_PQC_PUBKEY_HASH: ownerPqcPubHash,
    GUARDIAN_PRIVATE_KEY: guardianPk,
    GUARDIAN_ADDRESS: guardian.address,
    QDAY_THROWAWAY_PRIVATE_KEY: qdayThrowawayPk,
    QDAY_THROWAWAY_ADDRESS: qdayThrowaway.address,
  };

  const lines = [
    "# QoreGuardian Testnet-Only Wallets (qorechain-diana, Chain ID 9800)",
    "# NEVER use these keys on mainnet or with real funds.",
    ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
    "",
  ];
  fs.writeFileSync(envPath, lines.join("\n"), "utf8");
  console.log("Generated new testnet-only wallets in .env.testnet.local");
}

console.log("\n=== Testnet Wallet Addresses (Fund via QoreChain Faucet) ===");
console.log(`Deployer:        ${env.DEPLOYER_ADDRESS}`);
console.log(`Owner (EVM):     ${env.OWNER_ADDRESS}`);
console.log(`Owner PQC Hash:  ${env.OWNER_PQC_PUBKEY_HASH}`);
console.log(`Guardian Agent:  ${env.GUARDIAN_ADDRESS}`);
console.log(`Q-Day Throwaway: ${env.QDAY_THROWAWAY_ADDRESS}`);

const pubkeyBytes = hexToBytes(env.OWNER_PQC_PUBLIC_KEY);
const secretBytes = hexToBytes(env.OWNER_PQC_SECRET_KEY);
const messageBytes = new TextEncoder().encode("QoreGuardian Phase 3 pqcVerify probe");
const sigBytes = mldsa87.sign(secretBytes, messageBytes);

const localValid = mldsa87.verify(pubkeyBytes, messageBytes, sigBytes);
console.log("\n=== Local @qorechain/pqc (ML-DSA-87) Check ===");
console.log(`pubkey bytes:    ${pubkeyBytes.length}`);
console.log(`signature bytes: ${sigBytes.length}`);
console.log(`message bytes:   ${messageBytes.length}`);
console.log(`local verify:    ${localValid}`);

if (!localValid) {
  throw new Error("Local mldsa87.verify failed");
}

if (process.argv.includes("--offline")) {
  console.log("\nSkipping live RPC probe (--offline).");
  process.exit(0);
}

const client = createPublicClient({
  transport: http(RPC_URL),
});

console.log("\n=== Live Testnet pqcVerify Probe (0x...0A01) ===");
const valid = await client.readContract({
  address: PQC_VERIFY_ADDRESS,
  abi: IQORE_PQC_ABI,
  functionName: "pqcVerify",
  args: [toHex(pubkeyBytes), toHex(sigBytes), toHex(messageBytes)],
});
console.log(`on-chain pqcVerify: ${valid}`);

if (!valid) {
  throw new Error("On-chain pqcVerify returned false");
}

console.log("\n=== Testnet QOR Balances ===");
for (const [label, addr] of [
  ["Deployer", env.DEPLOYER_ADDRESS],
  ["Owner", env.OWNER_ADDRESS],
  ["Guardian", env.GUARDIAN_ADDRESS],
  ["Q-Day Throwaway", env.QDAY_THROWAWAY_ADDRESS],
]) {
  const evmAddr = toEvmAddress(addr);
  const bal = await client.getBalance({ address: evmAddr });
  console.log(`${label.padEnd(16)} ${evmAddr} -> ${formatEther(bal)} QOR`);
}
