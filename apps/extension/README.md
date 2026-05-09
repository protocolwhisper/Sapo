# ROFL x402 Solana Chrome Extension

Chrome Manifest V3 extension for paying x402 HTTP 402 routes on Solana with local spend policy enforcement.

## Setup

```bash
bun install
bun run typecheck
bun run build
```

Load `apps/extension/dist` in Chrome via `chrome://extensions` with Developer Mode enabled.

## Development

```bash
bun run dev
```

For gateway demos that use the local facilitator signature shape, enable mock payments:

```bash
VITE_MOCK_PAYMENTS=true bun run build
```

## Browser Agent API

Webpages can call:

```js
const result = await window.roflX402.paidFetch({
  url: "http://localhost:3000/proxy",
  method: "GET",
  headers: {},
  maxAmountUsd: 0.01,
  requireTrustedProvider: true
});
```

The page never receives wallet APIs. Requests are validated in the content script and enforced again in the background service worker before any payment proof is created.

## Security Notes

- Private keys and seed phrases are never stored or requested.
- `chrome.storage.local` stores only public wallet metadata, spend policy, session spend, and request history.
- Auto-pay is disabled by default.
- Domains and providers must pass the background worker policy checks.
- TODO: replace popup-only signing with a durable MV3 approval queue or offscreen document for production-grade wallet approval.
