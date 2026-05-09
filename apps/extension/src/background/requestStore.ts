import { getRequestHistory, getSession, saveRequestHistory, saveSession } from "../lib/storage";
import type { RequestHistoryItem } from "../lib/types";

export async function addHistoryItem(item: RequestHistoryItem) {
  const current = await getRequestHistory();
  await saveRequestHistory([item, ...current]);
}

export async function clearHistory() {
  await saveRequestHistory([]);
  const session = await getSession();
  await saveSession({ ...session, spentUsd: 0, startedAt: Date.now() });
}

export async function addSessionSpend(amountUsd: number) {
  const session = await getSession();
  await saveSession({
    ...session,
    spentUsd: Number((session.spentUsd + amountUsd).toFixed(6))
  });
}
