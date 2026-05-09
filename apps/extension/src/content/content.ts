import type { PaidFetchPayload, PaidFetchResult } from "../lib/types";

const REQUEST_TYPE = "ROFL_X402_FETCH";
const RESPONSE_TYPE = "ROFL_X402_FETCH_RESULT";
const WALLET_REQUEST_TYPE = "ROFL_X402_WALLET_REQUEST";
const WALLET_RESPONSE_TYPE = "ROFL_X402_WALLET_RESPONSE";

injectProvider();

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const data = event.data as { type?: string; requestId?: string; payload?: PaidFetchPayload };
  if (data?.type !== REQUEST_TYPE) return;

  const requestId = typeof data.requestId === "string" ? data.requestId : crypto.randomUUID();
  const validation = validatePayload(data.payload);
  if (!validation.ok) {
    postResult(requestId, validation);
    return;
  }

  chrome.runtime.sendMessage({ type: "PAID_FETCH", payload: data.payload }, (response: PaidFetchResult) => {
    if (chrome.runtime.lastError) {
      postResult(requestId, {
        ok: false,
        error: chrome.runtime.lastError.message ?? "Extension background worker unavailable."
      });
      return;
    }

    postResult(requestId, response);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isWalletRequest(message)) return false;

  void forwardWalletRequest(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Wallet bridge failed."
      });
    });

  return true;
});

function forwardWalletRequest(message: WalletRuntimeRequest): Promise<unknown> {
  const requestId = crypto.randomUUID();

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ ok: false, error: "Wallet request timed out on the active tab." });
    }, 60_000);

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;

      const data = event.data as { type?: string; requestId?: string; result?: unknown };
      if (data.type !== WALLET_RESPONSE_TYPE || data.requestId !== requestId) return;

      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(data.result);
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        type: WALLET_REQUEST_TYPE,
        requestId,
        request: message
      },
      window.location.origin
    );
  });
}

function postResult(requestId: string, result: PaidFetchResult) {
  window.postMessage(
    {
      type: RESPONSE_TYPE,
      requestId,
      result
    },
    window.location.origin
  );
}

function validatePayload(payload: unknown): PaidFetchResult | { ok: true } {
  if (!payload || typeof payload !== "object") return { ok: false, error: "Missing paid fetch payload." };
  const candidate = payload as Partial<PaidFetchPayload>;

  if (typeof candidate.url !== "string") return { ok: false, error: "Paid fetch URL is required." };

  try {
    const url = new URL(candidate.url);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { ok: false, error: "Only http and https paid fetch URLs are allowed." };
    }
  } catch {
    return { ok: false, error: "Invalid paid fetch URL." };
  }

  if (candidate.method !== undefined && typeof candidate.method !== "string") {
    return { ok: false, error: "Paid fetch method must be a string." };
  }

  if (candidate.headers !== undefined) {
    if (!candidate.headers || typeof candidate.headers !== "object" || Array.isArray(candidate.headers)) {
      return { ok: false, error: "Paid fetch headers must be an object." };
    }

    if (Object.values(candidate.headers).some((value) => typeof value !== "string")) {
      return { ok: false, error: "Paid fetch headers must contain only strings." };
    }
  }

  if (candidate.body !== undefined && typeof candidate.body !== "string") {
    return { ok: false, error: "Paid fetch body must be a string when provided." };
  }

  if (candidate.maxAmountUsd !== undefined && typeof candidate.maxAmountUsd !== "number") {
    return { ok: false, error: "maxAmountUsd must be a number." };
  }

  return { ok: true };
}

function injectProvider() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("assets/injectedProvider.js");
  script.async = false;
  script.onload = () => script.remove();
  (document.documentElement || document.head).appendChild(script);
}

type WalletRuntimeRequest =
  | { type: "CONNECT_WALLET_IN_PAGE"; provider: "phantom" | "backpack" | "solflare" }
  | { type: "DISCONNECT_WALLET_IN_PAGE"; provider: "phantom" | "backpack" | "solflare" }
  | {
      type: "SIGN_X402_PAYMENT_IN_PAGE";
      provider: "phantom" | "backpack" | "solflare";
      message: string;
    };

function isWalletRequest(message: unknown): message is WalletRuntimeRequest {
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  return (
    type === "CONNECT_WALLET_IN_PAGE" ||
    type === "DISCONNECT_WALLET_IN_PAGE" ||
    type === "SIGN_X402_PAYMENT_IN_PAGE"
  );
}
