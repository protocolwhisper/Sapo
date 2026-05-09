import type { PaidFetchPayload, PaidFetchResult } from "../lib/types";

const REQUEST_TYPE = "ROFL_X402_FETCH";
const RESPONSE_TYPE = "ROFL_X402_FETCH_RESULT";
const WALLET_REQUEST_TYPE = "ROFL_X402_WALLET_REQUEST";
const WALLET_RESPONSE_TYPE = "ROFL_X402_WALLET_RESPONSE";

type RoflX402Provider = {
  paidFetch(payload: PaidFetchPayload): Promise<PaidFetchResult>;
};

declare global {
  interface Window {
    roflX402?: RoflX402Provider;
  }
}

window.roflX402 = {
  paidFetch(payload: PaidFetchPayload) {
    const requestId = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        resolve({ ok: false, error: "ROFL x402 fetch timed out." });
      }, 60_000);

      function onMessage(event: MessageEvent) {
        if (event.source !== window) return;
        if (event.origin !== window.location.origin) return;

        const data = event.data as {
          type?: string;
          requestId?: string;
          result?: PaidFetchResult;
        };

        if (data.type !== RESPONSE_TYPE || data.requestId !== requestId) return;

        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        resolve(data.result ?? { ok: false, error: "Missing paid fetch result." });
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ type: REQUEST_TYPE, requestId, payload }, window.location.origin);
    });
  }
};

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const data = event.data as {
    type?: string;
    requestId?: string;
    request?: WalletBridgeRequest;
  };

  if (data.type !== WALLET_REQUEST_TYPE || !data.requestId || !data.request) return;

  void handleWalletRequest(data.request)
    .then((result) => postWalletResult(data.requestId!, result))
    .catch((error: unknown) => {
      postWalletResult(data.requestId!, {
        ok: false,
        error: error instanceof Error ? error.message : "Wallet request failed."
      });
    });
});

async function handleWalletRequest(request: WalletBridgeRequest) {
  const provider = getProvider(request.provider);
  if (!provider) return { ok: false, error: `${request.provider} wallet provider was not found on this page.` };

  if (request.type === "CONNECT_WALLET_IN_PAGE") {
    const connected = await provider.connect();
    return {
      ok: true,
      address: connected.publicKey.toString()
    };
  }

  if (request.type === "DISCONNECT_WALLET_IN_PAGE") {
    await provider.disconnect?.();
    return { ok: true };
  }

  if (!provider.signMessage) {
    return { ok: false, error: "Connected wallet does not support signMessage." };
  }

  const signed = await provider.signMessage(new TextEncoder().encode(request.message), "utf8");
  return {
    ok: true,
    address: signed.publicKey.toString(),
    signature: bytesToBase64(signed.signature)
  };
}

function postWalletResult(requestId: string, result: unknown) {
  window.postMessage(
    {
      type: WALLET_RESPONSE_TYPE,
      requestId,
      result
    },
    window.location.origin
  );
}

function getProvider(provider: "phantom" | "backpack" | "solflare") {
  if (provider === "phantom") return window.phantom?.solana;
  if (provider === "backpack") return window.backpack?.solana;
  return window.solflare;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

type InjectedWalletProvider = {
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect?(): Promise<void>;
  signMessage?(
    message: Uint8Array,
    display?: "utf8" | "hex"
  ): Promise<{ signature: Uint8Array; publicKey: { toString(): string } }>;
};

type WalletBridgeRequest =
  | { type: "CONNECT_WALLET_IN_PAGE"; provider: "phantom" | "backpack" | "solflare" }
  | { type: "DISCONNECT_WALLET_IN_PAGE"; provider: "phantom" | "backpack" | "solflare" }
  | {
      type: "SIGN_X402_PAYMENT_IN_PAGE";
      provider: "phantom" | "backpack" | "solflare";
      message: string;
    };

declare global {
  interface Window {
    phantom?: { solana?: InjectedWalletProvider };
    backpack?: { solana?: InjectedWalletProvider };
    solflare?: InjectedWalletProvider;
  }
}
