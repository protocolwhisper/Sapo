import { TRUSTED_PROVIDERS } from "../lib/constants";
import type { PaidFetchPayload, SpendPolicy, StoredSession, X402PaymentRequirement } from "../lib/types";

export type PolicyDecision =
  | { ok: true; amountUsd: number }
  | { ok: false; amountUsd: number; reason: string };

export function getRequestDomain(url: string) {
  return new URL(url).hostname.toLowerCase();
}

export function isAllowedDomain(hostname: string, allowedDomains: string[]) {
  const normalized = hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const allowed = domain.trim().toLowerCase();
    return normalized === allowed || normalized.endsWith(`.${allowed}`);
  });
}

export function isTrustedProvider(providerId?: string) {
  if (!providerId) return false;
  return TRUSTED_PROVIDERS.some((provider) => provider.id === providerId && provider.status === "trusted");
}

export function estimateUsdAmount(requirement: X402PaymentRequirement) {
  const direct = Number(requirement.amount);
  if (Number.isFinite(direct) && direct >= 0) return direct;

  return Number.POSITIVE_INFINITY;
}

export function evaluateSpendPolicy({
  payload,
  policy,
  requirement,
  session
}: {
  payload?: PaidFetchPayload;
  policy: SpendPolicy;
  requirement: X402PaymentRequirement;
  session: StoredSession;
}): PolicyDecision {
  const amountUsd = estimateUsdAmount(requirement);

  if (!policy.enabled) {
    return { ok: false, amountUsd, reason: "Spend policy is disabled." };
  }

  if (!policy.autoPayEnabled) {
    return { ok: false, amountUsd, reason: "Auto-pay is disabled in spend policy." };
  }

  if (!Number.isFinite(amountUsd)) {
    return { ok: false, amountUsd, reason: "Payment amount could not be interpreted safely." };
  }

  if (amountUsd > policy.maxPerRequestUsd) {
    return { ok: false, amountUsd, reason: "Payment exceeds max per request." };
  }

  if (payload?.maxAmountUsd !== undefined && amountUsd > payload.maxAmountUsd) {
    return { ok: false, amountUsd, reason: "Payment exceeds request maxAmountUsd." };
  }

  if (session.spentUsd + amountUsd > policy.maxSessionUsd) {
    return { ok: false, amountUsd, reason: "Payment would exceed session spend cap." };
  }

  if (!isTrustedProvider(requirement.providerId)) {
    return { ok: false, amountUsd, reason: "Payment provider is unknown or untrusted." };
  }

  if (payload?.requireTrustedProvider && !isTrustedProvider(requirement.providerId)) {
    return { ok: false, amountUsd, reason: "Trusted provider required." };
  }

  if (amountUsd >= policy.requireConfirmationAboveUsd) {
    // TODO: Add a durable MV3 confirmation UI before allowing payments above this threshold.
    return { ok: false, amountUsd, reason: "Payment requires explicit confirmation." };
  }

  return { ok: true, amountUsd };
}
