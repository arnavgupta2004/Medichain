// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IMediChain Interface
/// @notice Interface for the MediChain supply chain verification system
interface IMediChain {
    // ============================================================
    // ENUMS & STRUCTS
    // ============================================================

    enum BatchStatus {
        Manufactured, // 0 — freshly registered by manufacturer
        InTransit,    // 1 — transferred to distributor
        AtPharmacy,   // 2 — received by pharmacy
        Sold,         // 3 — sold to patient
        Recalled      // 4 — recalled by manufacturer
    }

    struct MedicineBatch {
        string batchId;
        string medicineName;
        string manufacturer;
        address manufacturerAddr;
        uint256 manufactureDate;
        uint256 expiryDate;
        uint256 quantity;
        string ipfsHash;
        BatchStatus status;
        bool exists;
    }

    struct TransferRecord {
        address from;
        address to;
        string role;       // "MANUFACTURER", "DISTRIBUTOR", "PHARMACY"
        uint256 timestamp;
        string location;
        string notes;
    }

    // ============================================================
    // EVENTS
    // ============================================================

    event BatchRegistered(string indexed batchId, address indexed manufacturer, uint256 timestamp);
    event BatchTransferred(string indexed batchId, address indexed from, address indexed to, BatchStatus newStatus);
    event BatchRecalled(string indexed batchId, string reason, uint256 timestamp);
    event BatchSold(string indexed batchId, address indexed pharmacy, uint256 timestamp);

    // ============================================================
    // MANUFACTURER FUNCTIONS
    // ============================================================

    function registerBatch(
        string memory batchId,
        string memory medicineName,
        string memory manufacturer,
        uint256 expiryDate,
        uint256 quantity,
        string memory ipfsHash
    ) external;

    function transferToDistributor(
        string memory batchId,
        address distributor,
        string memory location,
        string memory notes
    ) external;

    function recallBatch(string memory batchId, string memory reason) external;

    // ============================================================
    // DISTRIBUTOR FUNCTIONS
    // ============================================================

    function transferToPharmacy(
        string memory batchId,
        address pharmacy,
        string memory location,
        string memory notes
    ) external;

    // ============================================================
    // PHARMACY FUNCTIONS
    // ============================================================

    function markAsSold(string memory batchId) external;

    // ============================================================
    // PUBLIC VIEW FUNCTIONS
    // ============================================================

    function verifyBatch(string memory batchId)
        external
        view
        returns (MedicineBatch memory batch, TransferRecord[] memory history);

    function isBatchGenuine(string memory batchId)
        external
        view
        returns (bool genuine, string memory status, uint256 lastUpdated);

    function getBatchHistory(string memory batchId)
        external
        view
        returns (TransferRecord[] memory);

    function batchExists(string memory batchId) external view returns (bool);
}
