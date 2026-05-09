import type { ProviderInfo } from "../lib/types";

type Props = {
  providers: ProviderInfo[];
  activeProviderId?: string;
  connectingProviderId?: string | null;
  onConnect(provider: ProviderInfo): void;
};

export default function ProviderSelector({ providers, activeProviderId, connectingProviderId, onConnect }: Props) {
  return (
    <div className="list">
      {providers.map((provider) => {
        const active = activeProviderId === provider.id;
        const connecting = connectingProviderId === provider.id;

        return (
          <article className={active ? "providerCard providerActive" : "providerCard"} key={provider.id}>
            <div className="providerTop">
              <div>
                <h2>{provider.name}</h2>
                <p>{provider.location}</p>
              </div>
              <span>{provider.region}</span>
            </div>

            <dl className="compactDetails">
              <div>
                <dt>Price</dt>
                <dd>${provider.priceUsd.toFixed(3)}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{Math.round(provider.sessionSeconds / 60)} min</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{provider.status}</dd>
              </div>
            </dl>

            <button
              className={active ? "secondaryButton" : "primaryButton"}
              disabled={provider.status !== "trusted" || connecting}
              onClick={() => onConnect(provider)}
              type="button"
            >
              {active ? "Connected" : connecting ? "Emitting x402..." : "Connect with x402"}
            </button>
          </article>
        );
      })}
    </div>
  );
}
