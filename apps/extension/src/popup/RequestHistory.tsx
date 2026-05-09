import type { RequestHistoryItem } from "../lib/types";

type Props = {
  history: RequestHistoryItem[];
  onRefresh(): void;
  onClear(): void;
};

export default function RequestHistory({ history, onRefresh, onClear }: Props) {
  return (
    <section className="view">
      <div className="historyActions">
        <button className="secondaryButton" onClick={onRefresh} type="button">
          Refresh
        </button>
        <button className="secondaryButton" onClick={onClear} type="button">
          Clear
        </button>
      </div>

      <div className="list">
        {history.length === 0 && <p className="empty">No x402 emissions yet.</p>}
        {history.map((item) => (
          <article className="listItem" key={item.id}>
            <div>
              <h2 title={item.url}>{new URL(item.url).pathname || item.domain}</h2>
              <p>{new Date(item.timestamp).toLocaleString()}</p>
            </div>
            <dl className="compactDetails">
              <div>
                <dt>Status</dt>
                <dd>{item.status || "Blocked"}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{item.amount ? `${item.amount} ${item.asset ?? ""}` : "None"}</dd>
              </div>
              <div>
                <dt>x402 proof</dt>
                <dd title={item.txSignature}>{item.txSignature ? short(item.txSignature) : item.error ?? "None"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function short(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}
