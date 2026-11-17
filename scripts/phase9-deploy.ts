import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const require = createRequire(path.join(rootDir, "web", "package.json"));

const {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEther,
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const EVM_CHAIN_ID = 9800;
const EVM_RPC_URL = "https://evm-testnet.qore.host";
const EXPLORER_URL = "https://explore.qore.network";

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

function upsertEnvVar(filePath: string, key: string, value: string): void {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx !== -1) {
    lines[idx] = `${key}=${value}`;
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  } else {
    const suffix = content.endsWith("\n") ? "" : "\n";
    fs.writeFileSync(filePath, `${content}${suffix}${key}=${value}\n`, "utf8");
  }
}

function loadArtifact(relPath: string): { abi: unknown[]; bytecode: `0x${string}` } {
  const fullPath = path.join(rootDir, "contracts", "out", relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing Foundry artifact ${fullPath} — run 'forge build' in contracts/ first.`);
  }
  const raw = JSON.parse(fs.readFileSync(fullPath, "utf8")) as {
    abi: unknown[];
    bytecode: { object: `0x${string}` };
  };
  return { abi: raw.abi, bytecode: raw.bytecode.object };
}

const envPath = path.join(rootDir, ".env.testnet.local");
if (!fs.existsSync(envPath)) {
  throw new Error("Missing .env.testnet.local");
}
const env = parseEnvFile(envPath);

const deployerKey = env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
const ownerKey = (env.OWNER_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY) as `0x${string}` | undefined;
const guardianKey = env.GUARDIAN_PRIVATE_KEY as `0x${string}` | undefined;
const ownerPqcKeyHash = env.OWNER_PQC_PUBKEY_HASH as `0x${string}` | undefined;

if (!deployerKey || !ownerKey || !guardianKey || !ownerPqcKeyHash) {
  throw new Error("Missing required keys in .env.testnet.local");
}

const deployerAccount = privateKeyToAccount(deployerKey);
const ownerAccount = privateKeyToAccount(ownerKey);
const guardianAccountEvm = privateKeyToAccount(guardianKey);

const chain = {
  id: EVM_CHAIN_ID,
  name: "QoreChain Testnet",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC_URL] } },
};

const publicClient = createPublicClient({ chain, transport: http(EVM_RPC_URL) });
const deployerWallet = createWalletClient({ account: deployerAccount, chain, transport: http(EVM_RPC_URL) });
const ownerWallet = createWalletClient({ account: ownerAccount, chain, transport: http(EVM_RPC_URL) });

const deployerBalance = await publicClient.getBalance({ address: deployerAccount.address });
console.log("=== Phase 9: Deploy QoreGuardian Contracts to qorechain-diana ===");
console.log(`Deployer: ${deployerAccount.address} (balance: ${formatEther(deployerBalance)} QOR)`);
console.log(`Owner:    ${ownerAccount.address}`);
console.log(`Guardian: ${guardianAccountEvm.address}`);

const recoveryVaultArt = loadArtifact("RecoveryVault.sol/RecoveryVault.json");
const guardianAccountArt = loadArtifact("GuardianAccount.sol/GuardianAccount.json");

let nonce = await publicClient.getTransactionCount({
  address: deployerAccount.address,
  blockTag: "pending",
});
console.log(`\nStarting EVM nonce (pending): ${nonce}`);

// 1. Deploy RecoveryVault
console.log("1/4 Deploying RecoveryVault...");
const vaultTxHash = await deployerWallet.deployContract({
  abi: recoveryVaultArt.abi,
  bytecode: recoveryVaultArt.bytecode,
  nonce: nonce++,
});
const vaultReceipt = await publicClient.waitForTransactionReceipt({ hash: vaultTxHash });
const vaultAddress = vaultReceipt.contractAddress;
if (!vaultAddress) throw new Error("RecoveryVault deployment failed (no contractAddress)");
console.log(`  RecoveryVault: ${vaultAddress}`);
console.log(`  Tx: ${EXPLORER_URL}/tx/${vaultTxHash}`);

// 2. Deploy GuardianAccount
console.log("2/4 Deploying GuardianAccount...");
const perTxLimit = parseEther("0.5");
const dailyLimit = parseEther("2");
const gaTxHash = await deployerWallet.deployContract({
  abi: guardianAccountArt.abi,
  bytecode: guardianAccountArt.bytecode,
  args: [
    ownerAccount.address,
    guardianAccountEvm.address,
    vaultAddress,
    ownerPqcKeyHash,
    perTxLimit,
    dailyLimit,
  ],
  nonce: nonce++,
});
const gaReceipt = await publicClient.waitForTransactionReceipt({ hash: gaTxHash });
const guardianAccountAddress = gaReceipt.contractAddress;
if (!guardianAccountAddress) throw new Error("GuardianAccount deployment failed (no contractAddress)");
console.log(`  GuardianAccount: ${guardianAccountAddress}`);
console.log(`  Tx: ${EXPLORER_URL}/tx/${gaTxHash}`);

// 3. Fund GuardianAccount with 0.1 QOR
const initialFund = parseEther("0.1");
console.log("3/4 Funding GuardianAccount with 0.1 QOR...");
const fundTxHash = await deployerWallet.sendTransaction({
  to: guardianAccountAddress,
  value: initialFund,
  nonce: nonce++,
});
await publicClient.waitForTransactionReceipt({ hash: fundTxHash });
const gaBalance = await publicClient.getBalance({ address: guardianAccountAddress });
console.log(`  GuardianAccount balance: ${formatEther(gaBalance)} QOR`);
console.log(`  Tx: ${EXPLORER_URL}/tx/${fundTxHash}`);

// 4. Register Owner ML-DSA-87 pubkey hash on RecoveryVault
console.log("4/4 Registering Owner PQC key hash on RecoveryVault...");
const ownerNonce =
  ownerAccount.address.toLowerCase() === deployerAccount.address.toLowerCase()
    ? nonce++
    : await publicClient.getTransactionCount({ address: ownerAccount.address, blockTag: "pending" });
const regTxHash = await ownerWallet.writeContract({
  address: vaultAddress,
  abi: recoveryVaultArt.abi,
  functionName: "registerPqcKey",
  args: [ownerPqcKeyHash],
  nonce: ownerNonce,
});
await publicClient.waitForTransactionReceipt({ hash: regTxHash });
console.log(`  Registered PQC hash: ${ownerPqcKeyHash}`);
console.log(`  Tx: ${EXPLORER_URL}/tx/${regTxHash}`);

upsertEnvVar(envPath, "RECOVERY_VAULT_ADDRESS", vaultAddress);
upsertEnvVar(envPath, "GUARDIAN_ACCOUNT_ADDRESS", guardianAccountAddress);
console.log("\nSaved RECOVERY_VAULT_ADDRESS and GUARDIAN_ACCOUNT_ADDRESS to .env.testnet.local");
console.log(`Explorer RecoveryVault:   ${EXPLORER_URL}/address/${vaultAddress}`);
console.log(`Explorer GuardianAccount: ${EXPLORER_URL}/address/${guardianAccountAddress}`);
