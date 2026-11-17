import { fetchEvmWindow, type Eip1193Provider } from "@qorechain/sdk";
import { createPublicClient, defineChain, formatEther, getAddress, http, type Address } from "viem";

export const QORE_CHAIN_ID = 9800;
export const QORE_RPC_URL =
  import.meta.env.VITE_QORE_EVM_RPC_URL ?? "https://evm-testnet.qore.host";
export const QORE_REST_URL = import.meta.env.VITE_QORE_REST_URL ?? "/lcd";
export const EXPLORER_URL = "https://explore.qore.network";
export const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? "http://localhost:8787";

export const GUARDIAN_ACCOUNT_ADDRESS: Address = getAddress(
  import.meta.env.VITE_GUARDIAN_ACCOUNT_ADDRESS ?? "0x30dee7f6fc99d5c0596db47daac68b61e36bd21c"
);
export const RECOVERY_VAULT_ADDRESS: Address = getAddress(
  import.meta.env.VITE_RECOVERY_VAULT_ADDRESS ?? "0xc02bfd69e71054b7aca6a14f9ffb177de4ed1f3e"
);
export const GUARDIAN_COSMOS_ADDRESS =
  import.meta.env.VITE_GUARDIAN_COSMOS_ADDRESS ?? "qor1gvecl29yg557c8ng76vl54nwzkrve0el3rlywv";

export const qorechainDiana = defineChain({
  id: QORE_CHAIN_ID,
  name: "QoreChain Testnet (qorechain-diana)",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [QORE_RPC_URL] } },
  blockExplorers: { default: { name: "QoreScan", url: EXPLORER_URL } },
});

export const publicClient = createPublicClient({
  chain: qorechainDiana,
  transport: http(QORE_RPC_URL),
});

export const GUARDIAN_ACCOUNT_ABI = [
  { type: "function", name: "OWNER", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "guardianAgent", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "RECOVERY_VAULT", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "perTxLimit", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "dailyLimit", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "spentToday", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "emergencyNonce", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "isFrozen", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
] as const;

export const RECOVERY_VAULT_ABI = [
  { type: "function", name: "balances", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "registeredOwnerPqcKeyHash", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "bytes32" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export interface EvmWindowSummary {
  found: boolean;
  live: boolean;
  remainingBlocks: string;
  remainingTxs: string;
  maxTxs: string;
  allowedTargets: string[];
  error?: string;
}

export interface TreasuryStatus {
  guardianBalanceQor: string;
  vaultBalanceQor: string;
  owner: Address;
  guardianAgent: Address;
  perTxLimitQor: string;
  dailyLimitQor: string;
  spentTodayQor: string;
  isFrozen: boolean;
  emergencyNonce: string;
  vaultNonce: string;
  ownerPqcKeyHash: string;
  evmWindow: EvmWindowSummary;
  fetchedAt: string;
}

export async function fetchTreasuryStatus(): Promise<TreasuryStatus> {
  const [
    guardianBalanceWei,
    owner,
    guardianAgent,
    perTxLimitWei,
    dailyLimitWei,
    spentTodayWei,
    isFrozen,
    emergencyNonce,
  ] = await Promise.all([
    publicClient.getBalance({ address: GUARDIAN_ACCOUNT_ADDRESS }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "OWNER" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "guardianAgent" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "perTxLimit" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "dailyLimit" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "spentToday" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "isFrozen" }),
    publicClient.readContract({ address: GUARDIAN_ACCOUNT_ADDRESS, abi: GUARDIAN_ACCOUNT_ABI, functionName: "emergencyNonce" }),
  ]);

  const [vaultBalanceWei, ownerPqcKeyHash, vaultNonce] = await Promise.all([
    publicClient.readContract({ address: RECOVERY_VAULT_ADDRESS, abi: RECOVERY_VAULT_ABI, functionName: "balances", args: [owner] }),
    publicClient.readContract({ address: RECOVERY_VAULT_ADDRESS, abi: RECOVERY_VAULT_ABI, functionName: "registeredOwnerPqcKeyHash", args: [owner] }),
    publicClient.readContract({ address: RECOVERY_VAULT_ADDRESS, abi: RECOVERY_VAULT_ABI, functionName: "nonces", args: [owner] }),
  ]);

  let evmWindow: EvmWindowSummary = {
    found: false,
    live: false,
    remainingBlocks: "0",
    remainingTxs: "0",
    maxTxs: "0",
    allowedTargets: [],
  };
  try {
    const win = await fetchEvmWindow({ rest: QORE_REST_URL, address: GUARDIAN_COSMOS_ADDRESS });
    evmWindow = {
      found: win.found,
      live: win.live,
      remainingBlocks: String(win.remainingBlocks ?? "0"),
      remainingTxs: String(win.remainingTxs ?? "0"),
      maxTxs: String(win.maxTxs ?? "0"),
      allowedTargets: win.allowedTargets ?? [],
    };
  } catch (err) {
    evmWindow = {
      ...evmWindow,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    guardianBalanceQor: formatEther(guardianBalanceWei),
    vaultBalanceQor: formatEther(vaultBalanceWei),
    owner,
    guardianAgent,
    perTxLimitQor: formatEther(perTxLimitWei),
    dailyLimitQor: formatEther(dailyLimitWei),
    spentTodayQor: formatEther(spentTodayWei),
    isFrozen,
    emergencyNonce: emergencyNonce.toString(),
    vaultNonce: vaultNonce.toString(),
    ownerPqcKeyHash,
    evmWindow,
    fetchedAt: new Date().toLocaleTimeString(),
  };
}

export interface ConnectedWallet {
  address: Address;
  chainId: number;
  providerName: string;
  provider: Eip1193Provider;
}

interface Eip6963Detail {
  info: { name: string };
  provider: Eip1193Provider;
}

function discoverInjectedProviders(): Promise<Eip6963Detail[]> {
  return new Promise((resolve) => {
    const found: Eip6963Detail[] = [];
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Detail>).detail;
      if (detail?.provider) found.push(detail);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve(found);
    }, 150);
  });
}

export async function connectQoreWallet(): Promise<ConnectedWallet> {
  const discovered = await discoverInjectedProviders();
  const qorex = discovered.find((d) => /qorex/i.test(d.info.name)) ?? discovered[0];
  const fallback = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  const provider = qorex?.provider ?? fallback;

  if (!provider) {
    throw new Error("No EVM/QoreX wallet detected. Install QoreX or an EIP-1193 browser wallet.");
  }

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
    params: [],
  })) as unknown as string[];
  if (!accounts || accounts.length === 0) {
    throw new Error("Wallet returned no accounts.");
  }

  const chainHexTarget = `0x${QORE_CHAIN_ID.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHexTarget }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainHexTarget,
          chainName: "QoreChain Testnet (qorechain-diana)",
          rpcUrls: [QORE_RPC_URL],
          nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
          blockExplorerUrls: [EXPLORER_URL],
        },
      ],
    });
  }

  const chainHex = (await provider.request({ method: "eth_chainId", params: [] })) as string;
  return {
    address: getAddress(accounts[0]),
    chainId: Number.parseInt(chainHex, 16),
    providerName: qorex?.info.name ?? "Injected Wallet",
    provider,
  };
}
