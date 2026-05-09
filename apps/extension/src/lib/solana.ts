import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DEVNET_USDC_MINT, SOLANA_RPC_BY_NETWORK } from "./constants";
import type { SolanaNetwork } from "./types";

export function getConnection(network: SolanaNetwork) {
  return new Connection(SOLANA_RPC_BY_NETWORK[network], "confirmed");
}

export async function getSolBalance(address: string, network: SolanaNetwork) {
  const lamports = await getConnection(network).getBalance(new PublicKey(address));
  return lamports / LAMPORTS_PER_SOL;
}

export async function getUsdcBalance(address: string, network: SolanaNetwork) {
  if (network !== "solana-devnet") return null;

  const owner = new PublicKey(address);
  const mint = new PublicKey(DEVNET_USDC_MINT);
  const accounts = await getConnection(network).getParsedTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID
  });

  let total = 0;
  for (const account of accounts.value) {
    const info = account.account.data.parsed.info;
    if (info.mint === mint.toBase58()) {
      total += Number(info.tokenAmount.uiAmount ?? 0);
    }
  }

  return total;
}
