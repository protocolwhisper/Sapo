import type { ProviderInfo, SpendPolicy, StoredSession, WalletState } from "./types";

export const DEFAULT_NETWORK = "solana-devnet" as const;

export const DEFAULT_SPEND_POLICY: SpendPolicy = {
  enabled: true,
  maxPerRequestUsd: 0.01,
  maxSessionUsd: 0.25,
  allowedDomains: ["localhost", "dev3pack-demo.xyz"],
  requireConfirmationAboveUsd: 0.05,
  autoPayEnabled: false
};

export const DEFAULT_WALLET_STATE: WalletState = {
  connected: false,
  provider: null,
  address: null,
  network: DEFAULT_NETWORK,
  solBalance: null,
  usdcBalance: null,
  updatedAt: null
};

export const DEFAULT_SESSION: StoredSession = {
  spentUsd: 0,
  startedAt: Date.now()
};

export const STORAGE_KEYS = {
  spendPolicy: "rofl_x402_spend_policy",
  requestHistory: "rofl_x402_request_history",
  walletState: "rofl_x402_wallet_state",
  session: "rofl_x402_session"
} as const;

export const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:3000";

export const TRUSTED_PROVIDERS: ProviderInfo[] = [
  {
    id: "demo-data",
    name: "Dev3Pack Demo VPN",
    status: "trusted",
    priceUsd: 0.005,
    location: "Madrid, Spain",
    region: "EU West",
    endpoint: `${GATEWAY_URL.replace(/\/$/, "")}/proxy?providerId=demo-data&exit=mad`,
    sessionSeconds: 10 * 60,
    network: "solana-devnet",
    asset: "USDC-SPL",
    roflAppId: "dev3pack-demo"
  },
  {
    id: "provider-1",
    name: "Atlantic Relay",
    status: "trusted",
    priceUsd: 0.01,
    location: "New York, United States",
    region: "US East",
    endpoint: `${GATEWAY_URL.replace(/\/$/, "")}/proxy?providerId=provider-1&exit=nyc`,
    sessionSeconds: 15 * 60,
    network: "solana-devnet",
    asset: "USDC",
    roflAppId: "provider-1"
  }
];

export const SOLANA_RPC_BY_NETWORK = {
  "solana-devnet": "https://api.devnet.solana.com",
  "solana-mainnet": "https://api.mainnet-beta.solana.com"
} as const;

export const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const MOCK_PAYMENTS = import.meta.env.VITE_MOCK_PAYMENTS === "true";
