import type { WalletState } from "../lib/types";

type Props = {
  wallet: WalletState;
  onConnect(provider: "phantom" | "backpack" | "solflare"): void;
  onDisconnect(): void;
};

export default function WalletConnect({ wallet, onConnect, onDisconnect }: Props) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h2>Solana Signer</h2>
        <span>{wallet.connected ? "Available" : "Required for real proofs"}</span>
      </div>

      {wallet.connected && wallet.address ? (
        <>
          <dl className="details">
            <div>
              <dt>Signer address</dt>
              <dd title={wallet.address}>{shorten(wallet.address)}</dd>
            </div>
            <div>
              <dt>Signer rail</dt>
              <dd>{wallet.provider ?? "External wallet"}</dd>
            </div>
            <div>
              <dt>SOL</dt>
              <dd>{wallet.solBalance === null ? "Unavailable" : wallet.solBalance.toFixed(4)}</dd>
            </div>
            <div>
              <dt>USDC</dt>
              <dd>{wallet.usdcBalance === null ? "Unavailable" : wallet.usdcBalance.toFixed(4)}</dd>
            </div>
          </dl>
          <button className="secondaryButton" onClick={onDisconnect} type="button">
            Disconnect Signer
          </button>
        </>
      ) : (
        <div className="buttonStack">
          <button className="primaryButton" onClick={() => onConnect("phantom")} type="button">
            Authorize Solana Signer
          </button>
          <button className="secondaryButton" onClick={() => onConnect("backpack")} type="button">
            Use Backpack signer
          </button>
          <button className="secondaryButton" onClick={() => onConnect("solflare")} type="button">
            Use Solflare signer
          </button>
        </div>
      )}
    </section>
  );
}

function shorten(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
