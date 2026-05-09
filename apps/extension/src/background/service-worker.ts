import { DEFAULT_NETWORK, MOCK_PAYMENTS } from "../lib/constants";
import {
  getRequestHistory,
  getSession,
  getSpendPolicy,
  getWalletState,
  saveSpendPolicy,
  saveWalletState
} from "../lib/storage";
import type {
  PaidFetchPayload,
  PaidFetchResult,
  PaymentProof,
  RequestHistoryItem,
  SpendPolicy,
  X402PaymentRequirement
} from "../lib/types";
import { addHistoryItem, addSessionSpend, clearHistory } from "./requestStore";
import { evaluateSpendPolicy, getRequestDomain, isAllowedDomain } from "./policyEngine";
import { parseX402Requirement, retryWithPayment } from "./x402Client";

type RuntimeMessage =
  | { type: "PAID_FETCH"; payload: PaidFetchPayload }
  | { type: "GET_STATE" }
  | { type: "UPDATE_POLICY"; payload: unknown }
  | { type: "WALLET_STATE"; payload: unknown }
  | { type: "CLEAR_HISTORY" };

export async function paidFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 402) return response;

  const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
  const requirement = await parseX402Requirement(response);
  const policy = await getSpendPolicy();
  const session = await getSession();

  if (!isAllowedDomain(getRequestDomain(url), policy.allowedDomains)) {
    throw new Error("Domain is not allowed by spend policy.");
  }

  const decision = evaluateSpendPolicy({ policy, requirement, session });
  if (!decision.ok) throw new Error(decision.reason);

  const proof = await createPaymentProof(requirement);
  const paidResponse = await retryWithPayment(input, init, proof);
  await addSessionSpend(decision.amountUsd);

  return paidResponse;
}

chrome.runtime.onInstalled.addListener(async () => {
  const wallet = await getWalletState();
  if (!wallet.network) {
    await saveWalletState({ ...wallet, network: DEFAULT_NETWORK });
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (!isRuntimeMessage(message)) return false;

  void handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected extension error."
      });
    });

  return true;
});

function isRuntimeMessage(message: unknown): message is RuntimeMessage {
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  return (
    type === "PAID_FETCH" ||
    type === "GET_STATE" ||
    type === "UPDATE_POLICY" ||
    type === "WALLET_STATE" ||
    type === "CLEAR_HISTORY"
  );
}

async function handleMessage(message: RuntimeMessage) {
  switch (message.type) {
    case "PAID_FETCH":
      return handlePaidFetch(message.payload);
    case "GET_STATE":
      return {
        ok: true,
        policy: await getSpendPolicy(),
        wallet: await getWalletState(),
        history: await getRequestHistory(),
        session: await getSession()
      };
    case "UPDATE_POLICY":
      if (!isSpendPolicy(message.payload)) return { ok: false, error: "Invalid spend policy." };
      await saveSpendPolicy(message.payload);
      return { ok: true };
    case "WALLET_STATE":
      await saveWalletState(message.payload as never);
      return { ok: true };
    case "CLEAR_HISTORY":
      await clearHistory();
      return { ok: true };
    default:
      return { ok: false, error: "Unsupported runtime message." };
  }
}

function isSpendPolicy(value: unknown): value is SpendPolicy {
  if (!value || typeof value !== "object") return false;
  const policy = value as Partial<SpendPolicy>;
  return (
    typeof policy.enabled === "boolean" &&
    typeof policy.maxPerRequestUsd === "number" &&
    typeof policy.maxSessionUsd === "number" &&
    Array.isArray(policy.allowedDomains) &&
    policy.allowedDomains.every((domain) => typeof domain === "string") &&
    typeof policy.requireConfirmationAboveUsd === "number" &&
    typeof policy.autoPayEnabled === "boolean"
  );
}

async function handlePaidFetch(payload: PaidFetchPayload): Promise<PaidFetchResult> {
  const validation = validatePaidFetchPayload(payload);
  if (!validation.ok) return validation;

  const url = payload.url;
  const domain = getRequestDomain(url);
  const method = payload.method ?? "GET";
  let requirement: X402PaymentRequirement | undefined;
  let status = 0;

  try {
    const policy = await getSpendPolicy();
    if (!isAllowedDomain(domain, policy.allowedDomains)) {
      throw new Error("Domain is not allowed by spend policy.");
    }

    const init: RequestInit = {
      method,
      headers: payload.headers,
      body: payload.body
    };

    const response = await fetch(url, init);
    status = response.status;

    if (response.status !== 402) {
      const body = await response.text();
      await storeHistory({ payload, domain, status: response.status, paid: false });
      return { ok: true, status: response.status, body, headers: headersToRecord(response.headers) };
    }

    requirement = await parseX402Requirement(response);
    const session = await getSession();
    const decision = evaluateSpendPolicy({ payload, policy, requirement, session });
    if (!decision.ok) throw new Error(decision.reason);

    const proof = await createPaymentProof(requirement);
    const paidResponse = await retryWithPayment(url, init, proof);
    status = paidResponse.status;
    const body = await paidResponse.text();

    if (paidResponse.ok) {
      await addSessionSpend(decision.amountUsd);
    }

    await storeHistory({
      payload,
      domain,
      status,
      paid: paidResponse.ok,
      requirement,
      txSignature: proof.signature
    });

    return {
      ok: true,
      status,
      body,
      headers: headersToRecord(paidResponse.headers),
      payment: {
        amount: requirement.amount,
        asset: requirement.asset,
        txSignature: proof.signature,
        providerId: requirement.providerId
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Paid fetch failed.";
    await storeHistory({ payload, domain, status, paid: false, requirement, error: message });
    return { ok: false, status: status || undefined, error: message };
  }
}

async function createPaymentProof(requirement: X402PaymentRequirement): Promise<PaymentProof> {
  const wallet = await getWalletState();
  const nonce = crypto.randomUUID();
  const issuedAt = new Date().toISOString();

  if (MOCK_PAYMENTS) {
    return {
      x402Version: 1,
      scheme: "exact",
      network: requirement.network,
      amount: requirement.settlementAmount ?? requirement.amount,
      asset: requirement.asset,
      recipient: requirement.recipient,
      providerId: requirement.providerId,
      route: requirement.route,
      memo: requirement.memo,
      payer: wallet.address ?? "demo-payer",
      signature: `demo-paid-${nonce}`,
      nonce,
      issuedAt
    };
  }

  if (!wallet.connected || !wallet.address) {
    throw new Error("Connect a Solana wallet before paying.");
  }

  const message = buildPaymentMessage(requirement, wallet.address, nonce, issuedAt);
  const signature = await requestWalletSignature(message);

  return {
    x402Version: 1,
    scheme: "exact",
    network: requirement.network,
    amount: requirement.settlementAmount ?? requirement.amount,
    asset: requirement.asset,
    recipient: requirement.recipient,
    providerId: requirement.providerId,
    route: requirement.route,
    memo: requirement.memo,
    payer: wallet.address,
    signature,
    nonce,
    issuedAt
  };
}

function buildPaymentMessage(requirement: X402PaymentRequirement, payer: string, nonce: string, issuedAt: string) {
  return [
    "ROFL x402 payment approval",
    `payer=${payer}`,
    `network=${requirement.network}`,
    `asset=${requirement.asset}`,
    `amount=${requirement.amount}`,
    `recipient=${requirement.recipient}`,
    `providerId=${requirement.providerId ?? ""}`,
    `route=${requirement.route ?? ""}`,
    `nonce=${nonce}`,
    `issuedAt=${issuedAt}`
  ].join("\n");
}

async function requestWalletSignature(message: string): Promise<string> {
  // TODO: For production, move this through a durable MV3 offscreen document or explicit popup approval queue.
  const response = await chrome.runtime
    .sendMessage({ type: "SIGN_X402_PAYMENT", payload: { message } })
    .catch(() => undefined);

  if (!response?.ok || typeof response.signature !== "string") {
    throw new Error(response?.error ?? "Wallet approval is unavailable. Open the extension popup and retry.");
  }

  return response.signature;
}

function validatePaidFetchPayload(payload: PaidFetchPayload): PaidFetchResult | { ok: true } {
  try {
    const url = new URL(payload.url);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { ok: false, error: "Only http and https paid fetch URLs are allowed." };
    }
    if (payload.headers && Object.values(payload.headers).some((value) => typeof value !== "string")) {
      return { ok: false, error: "Headers must be a string map." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Invalid paid fetch URL." };
  }
}

async function storeHistory({
  payload,
  domain,
  status,
  paid,
  requirement,
  txSignature,
  error
}: {
  payload: PaidFetchPayload;
  domain: string;
  status: number;
  paid: boolean;
  requirement?: X402PaymentRequirement;
  txSignature?: string;
  error?: string;
}) {
  const item: RequestHistoryItem = {
    id: crypto.randomUUID(),
    url: payload.url,
    domain,
    method: payload.method ?? "GET",
    status,
    paid,
    amount: requirement?.amount,
    asset: requirement?.asset,
    network: requirement?.network,
    txSignature,
    providerId: requirement?.providerId,
    timestamp: Date.now(),
    error
  };

  await addHistoryItem(item);
}

function headersToRecord(headers: Headers) {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}
