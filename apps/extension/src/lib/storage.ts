import {
  DEFAULT_SESSION,
  DEFAULT_SPEND_POLICY,
  DEFAULT_WALLET_STATE,
  STORAGE_KEYS
} from "./constants";
import type { RequestHistoryItem, SpendPolicy, StoredSession, WalletState } from "./types";

type StorageShape = {
  [STORAGE_KEYS.spendPolicy]: SpendPolicy;
  [STORAGE_KEYS.requestHistory]: RequestHistoryItem[];
  [STORAGE_KEYS.walletState]: WalletState;
  [STORAGE_KEYS.session]: StoredSession;
};

function hasChromeStorage() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

export async function getStorageValue<K extends keyof StorageShape>(
  key: K,
  fallback: StorageShape[K]
): Promise<StorageShape[K]> {
  if (!hasChromeStorage()) return fallback;

  const result = await chrome.storage.local.get(key);
  return (result[key] as StorageShape[K] | undefined) ?? fallback;
}

export async function setStorageValue<K extends keyof StorageShape>(
  key: K,
  value: StorageShape[K]
): Promise<void> {
  if (!hasChromeStorage()) return;
  await chrome.storage.local.set({ [key]: value });
}

export function getSpendPolicy() {
  return getStorageValue(STORAGE_KEYS.spendPolicy, DEFAULT_SPEND_POLICY);
}

export function saveSpendPolicy(policy: SpendPolicy) {
  return setStorageValue(STORAGE_KEYS.spendPolicy, policy);
}

export function getWalletState() {
  return getStorageValue(STORAGE_KEYS.walletState, DEFAULT_WALLET_STATE);
}

export function saveWalletState(wallet: WalletState) {
  return setStorageValue(STORAGE_KEYS.walletState, wallet);
}

export function getRequestHistory() {
  return getStorageValue(STORAGE_KEYS.requestHistory, []);
}

export async function saveRequestHistory(history: RequestHistoryItem[]) {
  await setStorageValue(STORAGE_KEYS.requestHistory, history.slice(0, 100));
}

export function getSession() {
  return getStorageValue(STORAGE_KEYS.session, DEFAULT_SESSION);
}

export function saveSession(session: StoredSession) {
  return setStorageValue(STORAGE_KEYS.session, session);
}
