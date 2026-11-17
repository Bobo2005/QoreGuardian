import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@qorechain/sdk";
import { createPublicClient, defineChain, getAddress, http, type Address } from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
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

const fileEnv = {
  ...loadEnvFile(path.join(repoRoot, ".env.testnet.local")),
  ...loadEnvFile(path.join(repoRoot, "agent", ".env")),
};

function getEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fileEnv[key] ?? fallback;
  if (val === undefined || val === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

function getOptionalEnv(key: string): string | undefined {
  const val = process.env[key] ?? fileEnv[key];
  return val === "" ? undefined : val;
}

export const QORE_RPC_URL = getEnv("QORE_RPC_URL", "https://evm-testnet.qore.host");
export const QORE_REST_URL = getEnv("QORE_REST_URL", "https://api-testnet.qore.host");
export const QORE_CHAIN_ID = Number(getEnv("QORE_CHAIN_ID", "9800"));
export const QORE_COSMOS_CHAIN_ID = getEnv("QORE_COSMOS_CHAIN_ID", "qorechain-diana");
export const EXPLORER_URL = getEnv("EXPLORER_URL", "https://explore.qore.network");
export const AGENT_PORT = Number(getEnv("AGENT_PORT", "8787"));

export const GUARDIAN_PRIVATE_KEY = getOptionalEnv("GUARDIAN_PRIVATE_KEY") as `0x${string}` | undefined;
export const GUARDIAN_PQC_RECOVERY_CODE = getOptionalEnv("GUARDIAN_PQC_RECOVERY_CODE");

export const GUARDIAN_ACCOUNT_ADDRESS: Address = getAddress(
  getEnv("GUARDIAN_ACCOUNT_ADDRESS", "0x30dee7f6fc99d5c0596db47daac68b61e36bd21c")
);
export const RECOVERY_VAULT_ADDRESS: Address = getAddress(
  getEnv("RECOVERY_VAULT_ADDRESS", "0xc02bfd69e71054b7aca6a14f9ffb177de4ed1f3e")
);

export const qorechainDiana = defineChain({
  id: QORE_CHAIN_ID,
  name: "QoreChain Testnet (qorechain-diana)",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: {
    default: { http: [QORE_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "QoreScan", url: "https://explore.qore.network" },
  },
});

export const publicClient = createPublicClient({
  chain: qorechainDiana,
  transport: http(QORE_RPC_URL),
});

export const sdkClient = createClient({
  network: "testnet",
  endpoints: {
    rest: QORE_REST_URL,
    evmRpc: QORE_RPC_URL,
  },
});
