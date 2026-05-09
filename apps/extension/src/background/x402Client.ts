import type { PaymentProof, X402PaymentRequirement } from "../lib/types";

type X402Accept = {
  scheme?: string;
  network?: string;
  maxAmountRequired?: string;
  payTo?: string;
  asset?: string;
  resource?: string;
  description?: string;
  extra?: {
    providerId?: string;
    route?: string;
    amount?: string;
    token?: string;
  };
};

function decodeBase64Json(value: string) {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return JSON.parse(atob(padded)) as unknown;
}

function normalizeNetwork(network: unknown): X402PaymentRequirement["network"] | null {
  if (network === "solana-devnet") return "solana-devnet";
  if (network === "solana-mainnet" || network === "solana-mainnet-beta" || network === "mainnet-beta") {
    return "solana-mainnet";
  }
  return null;
}

function amountFromAccept(accept: X402Accept) {
  if (accept.extra?.amount) return accept.extra.amount;

  if (accept.maxAmountRequired && accept.asset) {
    const asset = accept.asset.toUpperCase();
    if (asset.includes("USDC") || accept.asset === "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU") {
      const atomic = Number(accept.maxAmountRequired);
      if (Number.isFinite(atomic)) return String(atomic / 1_000_000);
    }
  }

  return accept.maxAmountRequired ?? "";
}

export async function parseX402Requirement(response: Response): Promise<X402PaymentRequirement> {
  const encoded = response.headers.get("x-payment-required") ?? response.headers.get("payment-required");
  const payload = encoded ? decodeBase64Json(encoded) : await response.clone().json();

  if (isDirectRequirement(payload)) return payload;

  if (isAgent2Payload(payload)) {
    const accept = payload.accepts.find((candidate) => candidate.scheme === "exact");
    if (!accept) throw new Error("No exact x402 payment requirement found.");

    const network = normalizeNetwork(accept.network);
    if (!network) throw new Error("Unsupported x402 Solana network.");

    return {
      scheme: "exact",
      network,
      asset: accept.asset ?? accept.extra?.token ?? "USDC",
      amount: amountFromAccept(accept),
      settlementAmount: accept.maxAmountRequired,
      recipient: accept.payTo ?? "",
      providerId: accept.extra?.providerId,
      route: accept.extra?.route,
      resource: accept.resource,
      description: accept.description
    };
  }

  throw new Error("Unsupported x402 payment requirement payload.");
}

export function encodePaymentHeader(proof: PaymentProof) {
  return btoa(JSON.stringify(proof)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function retryWithPayment(input: RequestInfo | URL, init: RequestInit | undefined, proof: PaymentProof) {
  const headers = new Headers(init?.headers);
  headers.set("X-PAYMENT", encodePaymentHeader(proof));

  return fetch(input, {
    ...init,
    headers
  });
}

function isDirectRequirement(value: unknown): value is X402PaymentRequirement {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<X402PaymentRequirement>;
  return (
    candidate.scheme === "exact" &&
    Boolean(normalizeNetwork(candidate.network)) &&
    typeof candidate.asset === "string" &&
    typeof candidate.amount === "string" &&
    typeof candidate.recipient === "string"
  );
}

function isAgent2Payload(value: unknown): value is { accepts: X402Accept[] } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray((value as { accepts?: unknown }).accepts)
  );
}
