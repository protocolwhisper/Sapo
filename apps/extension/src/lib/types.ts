export type SolanaNetwork = "solana-devnet" | "solana-mainnet";

export type SpendPolicy = {
  enabled: boolean;
  maxPerRequestUsd: number;
  maxSessionUsd: number;
  allowedDomains: string[];
  requireConfirmationAboveUsd: number;
  autoPayEnabled: boolean;
};

export type X402PaymentRequirement = {
  scheme: "exact";
  network: SolanaNetwork;
  asset: string;
  amount: string;
  settlementAmount?: string;
  recipient: string;
  memo?: string;
  expiresAt?: string;
  providerId?: string;
  resource?: string;
  description?: string;
  route?: string;
};

export type RequestHistoryItem = {
  id: string;
  url: string;
  domain: string;
  method: string;
  status: number;
  paid: boolean;
  amount?: string;
  asset?: string;
  network?: string;
  txSignature?: string;
  providerId?: string;
  timestamp: number;
  error?: string;
};

export type WalletState = {
  connected: boolean;
  provider: "phantom" | "backpack" | "solflare" | null;
  address: string | null;
  network: SolanaNetwork;
  solBalance: number | null;
  usdcBalance: number | null;
  updatedAt: number | null;
};

export type ProviderInfo = {
  id: string;
  name: string;
  status: "trusted" | "unknown" | "offline";
  priceUsd: number;
  location: string;
  region: string;
  endpoint: string;
  sessionSeconds: number;
  network: SolanaNetwork;
  asset: string;
  roflAppId?: string;
};

export type PaidFetchPayload = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  maxAmountUsd?: number;
  requireTrustedProvider?: boolean;
};

export type PaidFetchSuccess = {
  ok: true;
  status: number;
  body: string;
  headers: Record<string, string>;
  payment?: {
    amount: string;
    asset: string;
    txSignature: string;
    providerId?: string;
  };
};

export type PaidFetchFailure = {
  ok: false;
  status?: number;
  error: string;
};

export type PaidFetchResult = PaidFetchSuccess | PaidFetchFailure;

export type PaymentProof = {
  x402Version: 1;
  scheme: "exact";
  network: SolanaNetwork;
  amount: string;
  asset: string;
  recipient: string;
  providerId?: string;
  route?: string;
  memo?: string;
  payer?: string;
  signature: string;
  nonce: string;
  issuedAt: string;
};

export type StoredSession = {
  spentUsd: number;
  startedAt: number;
};
