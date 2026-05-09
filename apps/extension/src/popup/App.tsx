import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SPEND_POLICY, DEFAULT_WALLET_STATE, TRUSTED_PROVIDERS } from "../lib/constants";
import { getSolBalance, getUsdcBalance } from "../lib/solana";
import type { PaidFetchResult, ProviderInfo, RequestHistoryItem, SpendPolicy, StoredSession, WalletState } from "../lib/types";
import ProviderSelector from "./ProviderSelector";
import RequestHistory from "./RequestHistory";
import SpendPolicyView from "./SpendPolicy";
import WalletConnect from "./WalletConnect";

type Tab = "vpn" | "policy" | "history";

type ExtensionState = {
  policy: SpendPolicy;
  wallet: WalletState;
  history: RequestHistoryItem[];
  session: StoredSession;
};

const DEFAULT_SESSION: StoredSession = { spentUsd: 0, startedAt: Date.now() };
const TAB_LABELS: Record<Tab, string> = {
  vpn: "VPN",
  policy: "Policy",
  history: "History"
};

export default function App() {
  const [tab, setTab] = useState<Tab>("vpn");
  const [state, setState] = useState<ExtensionState>({
    policy: DEFAULT_SPEND_POLICY,
    wallet: DEFAULT_WALLET_STATE,
    history: [],
    session: DEFAULT_SESSION
  });
  const [status, setStatus] = useState("");
  const [connectingProviderId, setConnectingProviderId] = useState<string | null>(null);
  const [activeVpn, setActiveVpn] = useState<{ provider: ProviderInfo; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void refreshState();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeVpn && activeVpn.expiresAt <= now) {
      setActiveVpn(null);
      setStatus("VPN session expired. Connect again to emit a new x402 payment.");
    }
  }, [activeVpn, now]);

  useEffect(() => {
    const listener = (
      message: { type?: string; payload?: { message?: string } },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (message.type !== "SIGN_X402_PAYMENT") return false;

      void signPaymentMessage(message.payload?.message ?? "")
        .then((signature) => sendResponse({ ok: true, signature }))
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Wallet signing failed."
          });
        });

      return true;
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [state.wallet.provider, state.wallet.address]);

  const totalSpent = useMemo(() => state.session.spentUsd.toFixed(3), [state.session.spentUsd]);
  const emitterReady = state.wallet.connected && state.policy.autoPayEnabled;
  const remainingMs = activeVpn ? Math.max(0, activeVpn.expiresAt - now) : 0;

  async function refreshState() {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    if (response?.ok) {
      setState({
        policy: response.policy ?? DEFAULT_SPEND_POLICY,
        wallet: response.wallet ?? DEFAULT_WALLET_STATE,
        history: response.history ?? [],
        session: response.session ?? DEFAULT_SESSION
      });
    }
  }

  async function connectWallet(providerName: "phantom" | "backpack" | "solflare") {
    setStatus("Checking active tab for Solana signer...");
    let connected: { ok: true; address: string } | { ok: false; error: string };

    try {
      connected = await sendWalletRequest<{ ok: true; address: string } | { ok: false; error: string }>({
        type: "CONNECT_WALLET_IN_PAGE",
        provider: providerName
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Signer bridge is unavailable on this tab.");
      return;
    }

    if (!connected.ok) {
      setStatus(connected.error);
      return;
    }

    const address = connected.address;
    const network = state.wallet.network;

    const [solBalance, usdcBalance] = await Promise.all([
      getSolBalance(address, network).catch(() => null),
      getUsdcBalance(address, network).catch(() => null)
    ]);

    const wallet: WalletState = {
      connected: true,
      provider: providerName,
      address,
      network,
      solBalance,
      usdcBalance,
      updatedAt: Date.now()
    };

    await chrome.runtime.sendMessage({ type: "WALLET_STATE", payload: wallet });
    setState((current) => ({ ...current, wallet }));
    setStatus("Solana signer connected. x402 emission is controlled by policy.");
  }

  async function disconnectWallet() {
    if (state.wallet.provider) {
      await sendWalletRequest({
        type: "DISCONNECT_WALLET_IN_PAGE",
        provider: state.wallet.provider
      }).catch(() => undefined);
    }

    const wallet = { ...DEFAULT_WALLET_STATE, network: state.wallet.network };
    await chrome.runtime.sendMessage({ type: "WALLET_STATE", payload: wallet });
    setState((current) => ({ ...current, wallet }));
    setStatus("Solana signer disconnected.");
  }

  async function updatePolicy(policy: SpendPolicy) {
    await chrome.runtime.sendMessage({ type: "UPDATE_POLICY", payload: policy });
    setState((current) => ({ ...current, policy }));
    setStatus("Spend policy saved.");
  }

  async function clearHistory() {
    await chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" });
    await refreshState();
    setStatus("History cleared.");
  }

  async function connectVpnProvider(provider: ProviderInfo) {
    setConnectingProviderId(provider.id);
    setStatus(`Requesting ${provider.location} access. Waiting for x402 challenge...`);

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "PAID_FETCH",
        payload: {
          url: provider.endpoint,
          method: "GET",
          maxAmountUsd: provider.priceUsd,
          requireTrustedProvider: true
        }
      })) as PaidFetchResult;

      if (!result.ok) {
        setStatus(result.error);
        return;
      }

      if (!result.payment) {
        setStatus("Provider responded without an x402 payment challenge. No VPN session was started.");
        return;
      }

      setActiveVpn({
        provider,
        expiresAt: Date.now() + provider.sessionSeconds * 1000
      });
      await refreshState();
      setStatus(`x402 emitted. ${provider.location} VPN session is active.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "VPN connection failed.");
    } finally {
      setConnectingProviderId(null);
    }
  }

  async function signPaymentMessage(message: string) {
    if (!message) throw new Error("Missing payment approval message.");

    if (!state.wallet.provider) throw new Error("No Solana signer is connected.");

    const response = await sendWalletRequest<{ ok: true; signature: string } | { ok: false; error: string }>({
      type: "SIGN_X402_PAYMENT_IN_PAGE",
      provider: state.wallet.provider,
      message
    });

    if (!response.ok) throw new Error(response.error);
    return response.signature;
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>ROFL x402</h1>
          <p>X-PAYMENT emitter on Solana {state.wallet.network === "solana-devnet" ? "Devnet" : "Mainnet"}</p>
        </div>
        <span className={emitterReady ? "status statusOn" : "status"} />
      </header>

      <nav className="tabs" aria-label="Extension views">
        {(["vpn", "policy", "history"] as Tab[]).map((item) => (
          <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} type="button">
            {TAB_LABELS[item]}
          </button>
        ))}
      </nav>

      {tab === "vpn" && (
        <section className="view">
          <section className="emitterPanel">
            <div className="panelHeader">
              <h2>{activeVpn ? activeVpn.provider.location : "Choose VPN Exit"}</h2>
              <span>{activeVpn ? "Connected" : emitterReady ? "Ready" : "Guarded"}</span>
            </div>
            {activeVpn ? (
              <div className="timerBlock">
                <strong>{formatRemaining(remainingMs)}</strong>
                <p>Paid time remaining from the last accepted x402 proof.</p>
              </div>
            ) : (
              <>
                <div className="flowLine" aria-label="x402 payment flow">
                  <span>Connect</span>
                  <span>402</span>
                  <span>Policy</span>
                  <strong>X-PAYMENT</strong>
                </div>
                <p>Select an exit provider. The extension emits the x402 proof only after policy and signer approval.</p>
              </>
            )}
          </section>

          <ProviderSelector
            activeProviderId={activeVpn?.provider.id}
            connectingProviderId={connectingProviderId}
            providers={TRUSTED_PROVIDERS}
            onConnect={connectVpnProvider}
          />

          <div className="metrics">
            <div>
              <span>Total spent</span>
              <strong>${totalSpent}</strong>
            </div>
            <div>
              <span>Signer</span>
              <strong>{state.wallet.connected ? state.wallet.provider ?? "Connected" : "Missing"}</strong>
            </div>
            <div>
              <span>Auto-pay policy</span>
              <strong>{state.policy.autoPayEnabled ? "Enabled" : "Off"}</strong>
            </div>
          </div>
          <div className="notice">
            <strong>x402 VPN flow</strong>
            <p>Connect emits X-PAYMENT for provider access. The timer starts after the paid proof is accepted.</p>
          </div>

          <WalletConnect wallet={state.wallet} onConnect={connectWallet} onDisconnect={disconnectWallet} />
        </section>
      )}

      {tab === "policy" && <SpendPolicyView policy={state.policy} onSave={updatePolicy} />}
      {tab === "history" && (
        <RequestHistory history={state.history} onRefresh={refreshState} onClear={clearHistory} />
      )}

      {status && <footer className="footerStatus">{status}</footer>}
    </main>
  );
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Open a normal http or https tab before connecting a wallet.");

  if (!tab.url || !/^https?:\/\//.test(tab.url)) {
    throw new Error("Open any normal http or https page first. Solana signers do not inject into brave://extensions.");
  }

  return tab.id;
}

async function sendWalletRequest<T>(message: unknown): Promise<T> {
  const tabId = await getActiveTabId();
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch {
    throw new Error("Reload the active page, then try again. The x402 content bridge is not present on this tab yet.");
  }
}
