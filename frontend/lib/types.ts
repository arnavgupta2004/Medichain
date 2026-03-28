// ============================================================
// MediChain — Shared TypeScript Types
// ============================================================

export enum BatchStatus {
  Manufactured = 0,
  InTransit    = 1,
  AtPharmacy   = 2,
  Sold         = 3,
  Recalled     = 4,
}

export interface MedicineBatch {
  batchId:         string;
  medicineName:    string;
  manufacturer:    string;
  manufacturerAddr: string;
  manufactureDate: bigint;
  expiryDate:      bigint;
  quantity:        bigint;
  ipfsHash:        string;
  status:          BatchStatus;
  exists:          boolean;
}

export interface TransferRecord {
  from:      string;
  to:        string;
  role:      string;
  timestamp: bigint;
  location:  string;
  notes:     string;
}

export interface VerifyResult {
  batch:   MedicineBatch;
  history: TransferRecord[];
}

export interface GenuineResult {
  genuine:     boolean;
  status:      string;
  lastUpdated: bigint;
}

// ─── UI-specific types ────────────────────────────────────────────

export type WalletState = {
  address:   string | null;
  chainId:   number | null;
  connected: boolean;
};

export type TxState = "idle" | "pending" | "success" | "error";

export interface TxStatus {
  state:   TxState;
  hash:    string | null;
  error:   string | null;
}

export type UserRole = "MANUFACTURER" | "DISTRIBUTOR" | "PHARMACY" | "ADMIN" | "NONE";

// ─── Lookup helpers ───────────────────────────────────────────────

export const STATUS_LABELS: Record<BatchStatus, string> = {
  [BatchStatus.Manufactured]: "Manufactured",
  [BatchStatus.InTransit]:    "In Transit",
  [BatchStatus.AtPharmacy]:   "At Pharmacy",
  [BatchStatus.Sold]:         "Sold",
  [BatchStatus.Recalled]:     "Recalled",
};

export const STATUS_ICONS: Record<BatchStatus, string> = {
  [BatchStatus.Manufactured]: "🏭",
  [BatchStatus.InTransit]:    "🚚",
  [BatchStatus.AtPharmacy]:   "💊",
  [BatchStatus.Sold]:         "🛒",
  [BatchStatus.Recalled]:     "⚠️",
};

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_HEX = "0xAA36A7";
