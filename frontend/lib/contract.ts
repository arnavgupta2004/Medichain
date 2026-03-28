import { ethers } from "ethers";
import { getReadOnlyProvider, getSigner } from "./web3";
import type {
  MedicineBatch,
  TransferRecord,
  VerifyResult,
  GenuineResult,
} from "./types";

// ============================================================
// ABI — minimal subset needed by frontend
// ============================================================
// The full ABI is in public/abi/MediChain.json (written by deploy.js).
// We inline the fragment ABI here for type-safe calls.

const MEDICHAIN_ABI = [
  // Read functions
  "function verifyBatch(string batchId) view returns (tuple(string batchId,string medicineName,string manufacturer,address manufacturerAddr,uint256 manufactureDate,uint256 expiryDate,uint256 quantity,string ipfsHash,uint8 status,bool exists) batch, tuple(address from,address to,string role,uint256 timestamp,string location,string notes)[] history)",
  "function isBatchGenuine(string batchId) view returns (bool genuine, string status, uint256 lastUpdated)",
  "function getBatchHistory(string batchId) view returns (tuple(address from,address to,string role,uint256 timestamp,string location,string notes)[])",
  "function batchExists(string batchId) view returns (bool)",
  "function getRecallReason(string batchId) view returns (string)",
  "function getBatchOwner(string batchId) view returns (address)",
  "function getStats() view returns (uint256 totalBatches, uint256 totalTransfers, uint256 totalRecalls)",
  "function getAllBatchIds() view returns (string[])",
  "function totalBatches() view returns (uint256)",
  "function totalTransfers() view returns (uint256)",
  "function totalRecalls() view returns (uint256)",
  "function paused() view returns (bool)",
  // Write functions
  "function registerBatch(string batchId, string medicineName, string manufacturer, uint256 expiryDate, uint256 quantity, string ipfsHash) external",
  "function transferToDistributor(string batchId, address distributor, string location, string notes) external",
  "function transferToPharmacy(string batchId, address pharmacy, string location, string notes) external",
  "function markAsSold(string batchId) external",
  "function recallBatch(string batchId, string reason) external",
  // Events
  "event BatchRegistered(string indexed batchId, address indexed manufacturer, uint256 timestamp)",
  "event BatchTransferred(string indexed batchId, address indexed from, address indexed to, uint8 newStatus)",
  "event BatchRecalled(string indexed batchId, string reason, uint256 timestamp)",
  "event BatchSold(string indexed batchId, address indexed pharmacy, uint256 timestamp)",
];

const ROLE_MANAGER_ABI = [
  "function isManufacturer(address) view returns (bool)",
  "function isDistributor(address) view returns (bool)",
  "function isPharmacy(address) view returns (bool)",
  "function isAdmin(address) view returns (bool)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function MANUFACTURER_ROLE() view returns (bytes32)",
  "function DISTRIBUTOR_ROLE() view returns (bytes32)",
  "function PHARMACY_ROLE() view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function grantRole(bytes32 role, address account) external",
  "function revokeRole(bytes32 role, address account) external",
  "event RoleGrantedTo(bytes32 indexed role, address indexed account, address indexed admin, uint256 timestamp)",
  "event RoleRevokedFrom(bytes32 indexed role, address indexed account, address indexed admin, uint256 timestamp)",
];

// ─── Address resolution ──────────────────────────────────────────

function getMedichainAddress(): string {
  // Try runtime ABI file first (written by deploy.js after deployment)
  const envAddr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (envAddr && envAddr.startsWith("0x")) return envAddr;
  // Demo placeholder
  return "0x0000000000000000000000000000000000000000";
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function getRoleManagerAddress(): string {
  const envAddr = process.env.NEXT_PUBLIC_ROLE_MANAGER_ADDRESS;
  if (envAddr && envAddr.startsWith("0x") && envAddr !== ZERO_ADDRESS) return envAddr;
  return ZERO_ADDRESS;
}

/** Returns true only when both contract addresses are properly configured */
export function isContractDeployed(): boolean {
  const mc = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const rm = process.env.NEXT_PUBLIC_ROLE_MANAGER_ADDRESS;
  return !!(
    mc && mc.startsWith("0x") && mc !== ZERO_ADDRESS &&
    rm && rm.startsWith("0x") && rm !== ZERO_ADDRESS
  );
}

// ─── Contract factory helpers ────────────────────────────────────

export function getMedichainReadOnly(): ethers.Contract {
  return new ethers.Contract(
    getMedichainAddress(),
    MEDICHAIN_ABI,
    getReadOnlyProvider()
  );
}

export async function getMedichainSigner(): Promise<ethers.Contract> {
  const signer = await getSigner();
  return new ethers.Contract(getMedichainAddress(), MEDICHAIN_ABI, signer);
}

export function getRoleManagerReadOnly(): ethers.Contract {
  return new ethers.Contract(
    getRoleManagerAddress(),
    ROLE_MANAGER_ABI,
    getReadOnlyProvider()
  );
}

export async function getRoleManagerSigner(): Promise<ethers.Contract> {
  const signer = await getSigner();
  return new ethers.Contract(getRoleManagerAddress(), ROLE_MANAGER_ABI, signer);
}

// ============================================================
// High-level contract calls
// ============================================================

/** Verify batch — works read-only, no wallet required */
export async function verifyBatch(batchId: string): Promise<VerifyResult> {
  const contract = getMedichainReadOnly();
  const [batch, history] = await contract.verifyBatch(batchId);
  return {
    batch: batch as MedicineBatch,
    history: history as TransferRecord[],
  };
}

/** Quick genuineness check */
export async function isBatchGenuine(batchId: string): Promise<GenuineResult> {
  const contract = getMedichainReadOnly();
  const [genuine, status, lastUpdated] = await contract.isBatchGenuine(batchId);
  return { genuine, status, lastUpdated };
}

/** Get full transfer history */
export async function getBatchHistory(batchId: string): Promise<TransferRecord[]> {
  const contract = getMedichainReadOnly();
  return contract.getBatchHistory(batchId) as Promise<TransferRecord[]>;
}

/** Check if batch ID is already taken */
export async function batchExists(batchId: string): Promise<boolean> {
  const contract = getMedichainReadOnly();
  return contract.batchExists(batchId) as Promise<boolean>;
}

/** Get recall reason */
export async function getRecallReason(batchId: string): Promise<string> {
  const contract = getMedichainReadOnly();
  return contract.getRecallReason(batchId) as Promise<string>;
}

/** Get global contract stats */
export async function getStats(): Promise<{
  totalBatches: bigint;
  totalTransfers: bigint;
  totalRecalls: bigint;
}> {
  const contract = getMedichainReadOnly();
  const [totalBatches, totalTransfers, totalRecalls] = await contract.getStats();
  return { totalBatches, totalTransfers, totalRecalls };
}

// ─── Role checks ─────────────────────────────────────────────────

export async function getUserRole(address: string): Promise<string[]> {
  // If RoleManager address isn't configured, skip the on-chain call entirely.
  // This prevents false "Access Restricted" when contracts aren't deployed yet.
  if (getRoleManagerAddress() === "0x0000000000000000000000000000000000000000") {
    return [];
  }
  const rm = getRoleManagerReadOnly();
  const [isMfr, isDist, isPharm, isAdm] = await Promise.all([
    rm.isManufacturer(address),
    rm.isDistributor(address),
    rm.isPharmacy(address),
    rm.isAdmin(address),
  ]);
  const roles: string[] = [];
  if (isAdm)   roles.push("ADMIN");
  if (isMfr)   roles.push("MANUFACTURER");
  if (isDist)  roles.push("DISTRIBUTOR");
  if (isPharm) roles.push("PHARMACY");
  return roles;
}

// ─── Write transactions ──────────────────────────────────────────

export async function registerBatch(params: {
  batchId:      string;
  medicineName: string;
  manufacturer: string;
  expiryDate:   number; // unix timestamp
  quantity:     number;
  ipfsHash:     string;
}): Promise<ethers.TransactionResponse> {
  const contract = await getMedichainSigner();
  return contract.registerBatch(
    params.batchId,
    params.medicineName,
    params.manufacturer,
    params.expiryDate,
    params.quantity,
    params.ipfsHash
  ) as Promise<ethers.TransactionResponse>;
}

export async function transferToDistributor(params: {
  batchId:     string;
  distributor: string;
  location:    string;
  notes:       string;
}): Promise<ethers.TransactionResponse> {
  const contract = await getMedichainSigner();
  return contract.transferToDistributor(
    params.batchId,
    params.distributor,
    params.location,
    params.notes
  ) as Promise<ethers.TransactionResponse>;
}

export async function transferToPharmacy(params: {
  batchId:  string;
  pharmacy: string;
  location: string;
  notes:    string;
}): Promise<ethers.TransactionResponse> {
  const contract = await getMedichainSigner();
  return contract.transferToPharmacy(
    params.batchId,
    params.pharmacy,
    params.location,
    params.notes
  ) as Promise<ethers.TransactionResponse>;
}

export async function markAsSold(
  batchId: string
): Promise<ethers.TransactionResponse> {
  const contract = await getMedichainSigner();
  return contract.markAsSold(batchId) as Promise<ethers.TransactionResponse>;
}

export async function recallBatch(
  batchId: string,
  reason: string
): Promise<ethers.TransactionResponse> {
  const contract = await getMedichainSigner();
  return contract.recallBatch(batchId, reason) as Promise<ethers.TransactionResponse>;
}

export async function grantRole(
  role: string,
  address: string
): Promise<ethers.TransactionResponse> {
  const contract = await getRoleManagerSigner();
  return contract.grantRole(role, address) as Promise<ethers.TransactionResponse>;
}

export async function revokeRole(
  role: string,
  address: string
): Promise<ethers.TransactionResponse> {
  const contract = await getRoleManagerSigner();
  return contract.revokeRole(role, address) as Promise<ethers.TransactionResponse>;
}
