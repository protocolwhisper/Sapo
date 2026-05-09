import { useEffect, useState } from "react";
import type { SpendPolicy } from "../lib/types";

type Props = {
  policy: SpendPolicy;
  onSave(policy: SpendPolicy): void;
};

export default function SpendPolicyView({ policy, onSave }: Props) {
  const [draft, setDraft] = useState(policy);
  const [domains, setDomains] = useState(policy.allowedDomains.join("\n"));

  useEffect(() => {
    setDraft(policy);
    setDomains(policy.allowedDomains.join("\n"));
  }, [policy]);

  return (
    <section className="view">
      <div className="panel">
        <div className="panelHeader">
          <h2>Spend Policy</h2>
          <label className="switch">
            <input
              checked={draft.autoPayEnabled}
              onChange={(event) => setDraft({ ...draft, autoPayEnabled: event.target.checked })}
              type="checkbox"
            />
            <span>Auto-pay</span>
          </label>
        </div>

        <label className="field">
          <span>Max per request USD</span>
          <input
            min="0"
            step="0.001"
            type="number"
            value={draft.maxPerRequestUsd}
            onChange={(event) => setDraft({ ...draft, maxPerRequestUsd: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>Max session USD</span>
          <input
            min="0"
            step="0.001"
            type="number"
            value={draft.maxSessionUsd}
            onChange={(event) => setDraft({ ...draft, maxSessionUsd: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>Confirm above USD</span>
          <input
            min="0"
            step="0.001"
            type="number"
            value={draft.requireConfirmationAboveUsd}
            onChange={(event) =>
              setDraft({ ...draft, requireConfirmationAboveUsd: Number(event.target.value) })
            }
          />
        </label>

        <label className="field">
          <span>Allowed domains</span>
          <textarea rows={4} value={domains} onChange={(event) => setDomains(event.target.value)} />
        </label>

        <button
          className="primaryButton"
          onClick={() =>
            onSave({
              ...draft,
              enabled: true,
              allowedDomains: domains
                .split(/\n|,/)
                .map((domain) => domain.trim())
                .filter(Boolean)
            })
          }
          type="button"
        >
          Save Policy
        </button>
      </div>
    </section>
  );
}
