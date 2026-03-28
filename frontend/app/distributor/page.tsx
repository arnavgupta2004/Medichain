"use client";

import { useState } from "react";
import RoleBanner from "@/components/RoleBanner";
import TxButton from "@/components/TxButton";
import { transferToPharmacy } from "@/lib/contract";
import { decodeContractError } from "@/lib/web3";
import type { TxStatus } from "@/lib/types";

interface TransferForm {
  batchId:  string;
  pharmacy: string;
  location: string;
  notes:    string;
}

const EMPTY_FORM: TransferForm = {
  batchId:  "",
  pharmacy: "",
  location: "",
  notes:    "",
};

function DistributorContent() {
  const [form, setForm]         = useState<TransferForm>(EMPTY_FORM);
  const [txStatus, setTxStatus] = useState<TxStatus>({ state: "idle", hash: null, error: null });

  const handleTransfer = async () => {
    setTxStatus({ state: "pending", hash: null, error: null });
    try {
      const tx = await transferToPharmacy({
        batchId:  form.batchId.trim(),
        pharmacy: form.pharmacy.trim(),
        location: form.location.trim(),
        notes:    form.notes.trim(),
      });
      await tx.wait();
      setTxStatus({ state: "success", hash: tx.hash, error: null });
    } catch (err) {
      setTxStatus({ state: "error", hash: null, error: decodeContractError(err) });
    }
  };

  const isValid = form.batchId.trim() && form.pharmacy.trim() && form.location.trim();

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">🚚 Distributor Portal</h1>
        <p className="text-text-secondary text-sm">
          Transfer medicine batches from your custody to registered pharmacies.
          The transfer is recorded permanently on Ethereum.
        </p>
      </div>

      <RoleBanner requiredRole="DISTRIBUTOR" />

      {/* Info card */}
      <div className="card mb-6 bg-secondary/5 border-secondary/20">
        <div className="flex gap-3">
          <span className="text-2xl">📋</span>
          <div>
            <h3 className="font-semibold text-text-primary text-sm mb-1">How Transfers Work</h3>
            <ul className="text-xs text-text-secondary space-y-1 list-disc list-inside">
              <li>You must own the batch (it must be in <strong className="text-text-primary">InTransit</strong> status assigned to you)</li>
              <li>The pharmacy address must be registered with <strong className="text-text-primary">PHARMACY_ROLE</strong></li>
              <li>Transfer is irreversible once confirmed on-chain</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Transfer form */}
      <div className="card">
        <h2 className="text-lg font-semibold text-text-primary mb-5">
          Transfer Batch to Pharmacy
        </h2>

        <div className="space-y-4">
          <div>
            <label className="label">Batch ID *</label>
            <input
              type="text"
              value={form.batchId}
              onChange={(e) => setForm((f) => ({ ...f, batchId: e.target.value }))}
              placeholder="e.g. BATCH-2025-001"
              className="input-field"
            />
          </div>

          <div>
            <label className="label">Pharmacy Wallet Address *</label>
            <input
              type="text"
              value={form.pharmacy}
              onChange={(e) => setForm((f) => ({ ...f, pharmacy: e.target.value }))}
              placeholder="0x... (must have PHARMACY_ROLE)"
              className="input-field font-mono"
            />
          </div>

          <div>
            <label className="label">Delivery Location *</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Apollo Pharmacy, Chennai"
              className="input-field"
            />
          </div>

          <div>
            <label className="label">Notes <span className="text-muted">(optional)</span></label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Cold chain maintained, special handling notes, etc."
              rows={3}
              className="input-field resize-none"
            />
          </div>
        </div>

        <div className="mt-6">
          <TxButton
            txStatus={txStatus}
            onClick={handleTransfer}
            label="Transfer to Pharmacy"
            disabled={!isValid}
          />
        </div>

        {txStatus.state === "success" && (
          <button
            onClick={() => {
              setForm(EMPTY_FORM);
              setTxStatus({ state: "idle", hash: null, error: null });
            }}
            className="mt-3 w-full text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            + Transfer Another Batch
          </button>
        )}
      </div>

      {/* Quick verify link */}
      <div className="mt-6 text-center">
        <p className="text-xs text-muted">
          Need to check a batch status?{" "}
          <a href="/verify" className="text-primary hover:underline">
            Verify a Batch →
          </a>
        </p>
      </div>
    </div>
  );
}

export default function DistributorPage() {
  return <DistributorContent />;
}
