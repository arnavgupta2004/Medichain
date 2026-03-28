"use client";

import { useState } from "react";
import RoleBanner from "@/components/RoleBanner";
import TxButton from "@/components/TxButton";
import { markAsSold, verifyBatch } from "@/lib/contract";
import { decodeContractError, formatDate } from "@/lib/web3";
import { BatchStatus, STATUS_LABELS, STATUS_ICONS } from "@/lib/types";
import type { TxStatus, MedicineBatch } from "@/lib/types";

interface LookupState {
  kind: "idle" | "loading" | "found" | "not_found" | "error";
  batch?: MedicineBatch;
  error?: string;
}

function PharmacyContent() {
  const [batchId, setBatchId]     = useState("");
  const [lookup, setLookup]       = useState<LookupState>({ kind: "idle" });
  const [txStatus, setTxStatus]   = useState<TxStatus>({ state: "idle", hash: null, error: null });

  const handleLookup = async () => {
    const id = batchId.trim();
    if (!id) return;
    setLookup({ kind: "loading" });
    try {
      const { batch } = await verifyBatch(id);
      setLookup({ kind: "found", batch });
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? "";
      if (msg.includes("not found")) {
        setLookup({ kind: "not_found" });
      } else {
        setLookup({ kind: "error", error: decodeContractError(err) });
      }
    }
  };

  const handleMarkSold = async () => {
    const id = batchId.trim();
    if (!id) return;
    setTxStatus({ state: "pending", hash: null, error: null });
    try {
      const tx = await markAsSold(id);
      await tx.wait();
      setTxStatus({ state: "success", hash: tx.hash, error: null });
      // Update lookup state
      if (lookup.batch) {
        setLookup({ kind: "found", batch: { ...lookup.batch, status: BatchStatus.Sold } });
      }
    } catch (err) {
      setTxStatus({ state: "error", hash: null, error: decodeContractError(err) });
    }
  };

  const batch = lookup.batch;
  const canSell = batch?.status === BatchStatus.AtPharmacy;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">💊 Pharmacy Portal</h1>
        <p className="text-text-secondary text-sm">
          Look up batches in your inventory and mark them as dispensed to patients.
        </p>
      </div>

      <RoleBanner requiredRole="PHARMACY" />

      {/* Lookup */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Look Up Batch</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            placeholder="Enter Batch ID"
            className="input-field flex-1"
          />
          <button
            onClick={handleLookup}
            disabled={lookup.kind === "loading" || !batchId.trim()}
            className="btn-primary whitespace-nowrap px-5"
          >
            {lookup.kind === "loading" ? (
              <span className="spinner" />
            ) : (
              "Look Up"
            )}
          </button>
        </div>
      </div>

      {/* Batch details */}
      {lookup.kind === "found" && batch && (
        <div className="card mb-6 animate-slide-up">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <h3 className="text-lg font-bold text-text-primary">{batch.medicineName}</h3>
              <p className="text-xs text-muted font-mono mt-0.5">{batch.batchId}</p>
            </div>
            <span className={`${canSell ? "badge-success" : "badge-info"} flex-shrink-0`}>
              {STATUS_ICONS[batch.status]} {STATUS_LABELS[batch.status]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm mb-5">
            <div>
              <p className="text-xs text-muted mb-0.5">Manufacturer</p>
              <p className="text-text-primary font-medium">{batch.manufacturer}</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Quantity</p>
              <p className="text-text-primary">{Number(batch.quantity).toLocaleString()} units</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Manufactured</p>
              <p className="text-text-primary">{formatDate(batch.manufactureDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Expires</p>
              <p className="text-text-primary">{formatDate(batch.expiryDate)}</p>
            </div>
          </div>

          {/* Status messages */}
          {batch.status === BatchStatus.Recalled && (
            <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 mb-4">
              <p className="text-sm font-semibold text-danger">⚠ This batch has been RECALLED</p>
              <p className="text-xs text-text-secondary mt-1">Do not dispense. Contact manufacturer.</p>
            </div>
          )}
          {batch.status === BatchStatus.Sold && (
            <div className="bg-success/10 border border-success/20 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-success">✓ Already marked as sold</p>
            </div>
          )}
          {batch.status === BatchStatus.InTransit && (
            <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-secondary">📦 Batch is still in transit — not yet assigned to your pharmacy</p>
            </div>
          )}
          {batch.status === BatchStatus.Manufactured && (
            <div className="bg-muted/10 border border-border rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-text-secondary">🏭 Batch not yet dispatched from manufacturer</p>
            </div>
          )}

          {/* Mark as sold */}
          {canSell && (
            <TxButton
              txStatus={txStatus}
              onClick={handleMarkSold}
              label="✓ Mark as Dispensed to Patient"
              loadingLabel="Confirming on blockchain..."
            />
          )}
        </div>
      )}

      {lookup.kind === "not_found" && (
        <div className="card border-warning/30 text-center py-8">
          <div className="text-3xl mb-2">❌</div>
          <p className="text-warning font-semibold">Batch Not Found</p>
          <p className="text-sm text-text-secondary mt-1">
            This batch ID is not registered in MediChain.
          </p>
        </div>
      )}

      {lookup.kind === "error" && (
        <div className="card border-danger/30">
          <p className="text-danger font-semibold text-sm mb-1">Error</p>
          <p className="text-xs text-text-secondary">{lookup.error}</p>
        </div>
      )}

      {/* Quick verify link */}
      <div className="mt-6 text-center">
        <p className="text-xs text-muted">
          Patients can verify this medicine at{" "}
          <a href="/verify" className="text-primary hover:underline">
            medichain/verify →
          </a>
        </p>
      </div>
    </div>
  );
}

export default function PharmacyPage() {
  return <PharmacyContent />;
}
