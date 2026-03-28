// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RoleManager.sol";
import "./interfaces/IMediChain.sol";

/// @title MediChainCore
/// @notice Main contract for medicine batch registration, supply chain tracking,
///         and authenticity verification. Integrates with RoleManager for access control.
/// @dev Inherits Ownable (admin emergency controls), Pausable, ReentrancyGuard
contract MediChainCore is IMediChain, Ownable, Pausable, ReentrancyGuard {
    // ============================================================
    // STATE
    // ============================================================

    RoleManager public immutable roleManager;

    /// @dev batchId => MedicineBatch
    mapping(string => MedicineBatch) private batches;

    /// @dev batchId => array of transfer records (full history)
    mapping(string => TransferRecord[]) private batchHistory;

    /// @dev batchId => current owner address
    mapping(string => address) private batchOwner;

    /// @dev batchId => recall reason (set when recalled)
    mapping(string => string) private recallReasons;

    /// @dev Array of all registered batch IDs (for enumeration)
    string[] private allBatchIds;

    /// @dev Total counters for stats
    uint256 public totalBatches;
    uint256 public totalTransfers;
    uint256 public totalRecalls;

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyManufacturer() {
        require(
            roleManager.hasRole(roleManager.MANUFACTURER_ROLE(), msg.sender),
            "MediChain: caller is not a manufacturer"
        );
        _;
    }

    modifier onlyDistributor() {
        require(
            roleManager.hasRole(roleManager.DISTRIBUTOR_ROLE(), msg.sender),
            "MediChain: caller is not a distributor"
        );
        _;
    }

    modifier onlyPharmacy() {
        require(
            roleManager.hasRole(roleManager.PHARMACY_ROLE(), msg.sender),
            "MediChain: caller is not a pharmacy"
        );
        _;
    }

    modifier batchMustExist(string memory batchId) {
        require(batches[batchId].exists, "MediChain: batch does not exist");
        _;
    }

    modifier notRecalled(string memory batchId) {
        require(
            batches[batchId].status != BatchStatus.Recalled,
            "MediChain: batch has been recalled"
        );
        _;
    }

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /// @param _roleManager Address of the deployed RoleManager contract
    constructor(address _roleManager) Ownable(msg.sender) {
        require(_roleManager != address(0), "MediChain: zero address");
        roleManager = RoleManager(_roleManager);
    }

    // ============================================================
    // MANUFACTURER FUNCTIONS
    // ============================================================

    /// @notice Register a new medicine batch on-chain
    /// @param batchId Unique identifier (e.g., "BATCH-2025-001")
    /// @param medicineName Name of the medicine (e.g., "Paracetamol 500mg")
    /// @param manufacturer Company name of the manufacturer
    /// @param expiryDate Unix timestamp of expiry — must be in the future
    /// @param quantity Number of units in this batch
    /// @param ipfsHash Optional IPFS hash for additional documentation
    function registerBatch(
        string memory batchId,
        string memory medicineName,
        string memory manufacturer,
        uint256 expiryDate,
        uint256 quantity,
        string memory ipfsHash
    ) external override onlyManufacturer whenNotPaused nonReentrant {
        require(bytes(batchId).length > 0,        "MediChain: batchId cannot be empty");
        require(bytes(medicineName).length > 0,   "MediChain: medicineName cannot be empty");
        require(bytes(manufacturer).length > 0,   "MediChain: manufacturer cannot be empty");
        require(!batches[batchId].exists,          "MediChain: batchId already registered");
        require(quantity > 0,                      "MediChain: quantity must be > 0");
        require(expiryDate > block.timestamp,      "MediChain: expiry must be in the future");

        uint256 manufactureDate = block.timestamp;
        require(expiryDate > manufactureDate,      "MediChain: expiry must be after manufacture");

        batches[batchId] = MedicineBatch({
            batchId:         batchId,
            medicineName:    medicineName,
            manufacturer:    manufacturer,
            manufacturerAddr: msg.sender,
            manufactureDate: manufactureDate,
            expiryDate:      expiryDate,
            quantity:        quantity,
            ipfsHash:        ipfsHash,
            status:          BatchStatus.Manufactured,
            exists:          true
        });

        batchOwner[batchId] = msg.sender;
        allBatchIds.push(batchId);
        totalBatches++;

        // Record initial "manufactured" entry in history
        batchHistory[batchId].push(TransferRecord({
            from:      address(0),
            to:        msg.sender,
            role:      "MANUFACTURER",
            timestamp: block.timestamp,
            location:  "Manufacturing Facility",
            notes:     string(abi.encodePacked("Batch registered by ", manufacturer))
        }));

        emit BatchRegistered(batchId, msg.sender, block.timestamp);
    }

    /// @notice Transfer batch from manufacturer to distributor
    /// @param batchId The batch to transfer
    /// @param distributor Address of the distributor (must have DISTRIBUTOR_ROLE)
    /// @param location Physical location of the transfer
    /// @param notes Additional notes about the transfer
    function transferToDistributor(
        string memory batchId,
        address distributor,
        string memory location,
        string memory notes
    )
        external
        override
        onlyManufacturer
        whenNotPaused
        nonReentrant
        batchMustExist(batchId)
        notRecalled(batchId)
    {
        require(
            batches[batchId].status == BatchStatus.Manufactured,
            "MediChain: batch not in Manufactured state"
        );
        require(
            batchOwner[batchId] == msg.sender,
            "MediChain: caller is not the batch owner"
        );
        require(
            roleManager.hasRole(roleManager.DISTRIBUTOR_ROLE(), distributor),
            "MediChain: recipient is not a registered distributor"
        );
        require(distributor != address(0), "MediChain: zero address");

        batches[batchId].status = BatchStatus.InTransit;
        batchOwner[batchId] = distributor;
        totalTransfers++;

        batchHistory[batchId].push(TransferRecord({
            from:      msg.sender,
            to:        distributor,
            role:      "MANUFACTURER",
            timestamp: block.timestamp,
            location:  location,
            notes:     notes
        }));

        emit BatchTransferred(batchId, msg.sender, distributor, BatchStatus.InTransit);
    }

    /// @notice Recall a batch — can only be called by the original manufacturer
    /// @param batchId The batch to recall
    /// @param reason Human-readable reason for the recall
    function recallBatch(string memory batchId, string memory reason)
        external
        override
        onlyManufacturer
        whenNotPaused
        nonReentrant
        batchMustExist(batchId)
    {
        require(
            batches[batchId].manufacturerAddr == msg.sender,
            "MediChain: only original manufacturer can recall"
        );
        require(
            batches[batchId].status != BatchStatus.Recalled,
            "MediChain: batch already recalled"
        );
        require(bytes(reason).length > 0, "MediChain: recall reason cannot be empty");

        batches[batchId].status = BatchStatus.Recalled;
        recallReasons[batchId] = reason;
        totalRecalls++;

        batchHistory[batchId].push(TransferRecord({
            from:      msg.sender,
            to:        address(0),
            role:      "MANUFACTURER",
            timestamp: block.timestamp,
            location:  "N/A",
            notes:     string(abi.encodePacked("RECALLED: ", reason))
        }));

        emit BatchRecalled(batchId, reason, block.timestamp);
    }

    // ============================================================
    // DISTRIBUTOR FUNCTIONS
    // ============================================================

    /// @notice Transfer batch from distributor to pharmacy
    /// @param batchId The batch to transfer
    /// @param pharmacy Address of the pharmacy (must have PHARMACY_ROLE)
    /// @param location Physical location of the transfer
    /// @param notes Additional notes about the transfer
    function transferToPharmacy(
        string memory batchId,
        address pharmacy,
        string memory location,
        string memory notes
    )
        external
        override
        onlyDistributor
        whenNotPaused
        nonReentrant
        batchMustExist(batchId)
        notRecalled(batchId)
    {
        require(
            batches[batchId].status == BatchStatus.InTransit,
            "MediChain: batch not in InTransit state"
        );
        require(
            batchOwner[batchId] == msg.sender,
            "MediChain: caller is not the batch owner"
        );
        require(
            roleManager.hasRole(roleManager.PHARMACY_ROLE(), pharmacy),
            "MediChain: recipient is not a registered pharmacy"
        );
        require(pharmacy != address(0), "MediChain: zero address");

        batches[batchId].status = BatchStatus.AtPharmacy;
        batchOwner[batchId] = pharmacy;
        totalTransfers++;

        batchHistory[batchId].push(TransferRecord({
            from:      msg.sender,
            to:        pharmacy,
            role:      "DISTRIBUTOR",
            timestamp: block.timestamp,
            location:  location,
            notes:     notes
        }));

        emit BatchTransferred(batchId, msg.sender, pharmacy, BatchStatus.AtPharmacy);
    }

    // ============================================================
    // PHARMACY FUNCTIONS
    // ============================================================

    /// @notice Mark a batch as sold to a patient
    /// @param batchId The batch that was sold
    function markAsSold(string memory batchId)
        external
        override
        onlyPharmacy
        whenNotPaused
        nonReentrant
        batchMustExist(batchId)
        notRecalled(batchId)
    {
        require(
            batches[batchId].status == BatchStatus.AtPharmacy,
            "MediChain: batch not at pharmacy"
        );
        require(
            batchOwner[batchId] == msg.sender,
            "MediChain: caller is not the batch owner"
        );

        batches[batchId].status = BatchStatus.Sold;
        totalTransfers++;

        batchHistory[batchId].push(TransferRecord({
            from:      msg.sender,
            to:        address(0),
            role:      "PHARMACY",
            timestamp: block.timestamp,
            location:  "Pharmacy Counter",
            notes:     "Dispensed to patient"
        }));

        emit BatchSold(batchId, msg.sender, block.timestamp);
        emit BatchTransferred(batchId, msg.sender, address(0), BatchStatus.Sold);
    }

    // ============================================================
    // PUBLIC VIEW FUNCTIONS
    // ============================================================

    /// @notice Full verification — returns batch data + complete transfer history
    /// @dev No wallet needed — can be called with a read-only provider
    function verifyBatch(string memory batchId)
        external
        view
        override
        returns (MedicineBatch memory batch, TransferRecord[] memory history)
    {
        require(batches[batchId].exists, "MediChain: batch not found");
        return (batches[batchId], batchHistory[batchId]);
    }

    /// @notice Quick authenticity check
    /// @return genuine True if batch exists and is NOT recalled/expired
    /// @return status Human-readable status string
    /// @return lastUpdated Timestamp of the most recent transfer record
    function isBatchGenuine(string memory batchId)
        external
        view
        override
        returns (bool genuine, string memory status, uint256 lastUpdated)
    {
        if (!batches[batchId].exists) {
            return (false, "NOT_FOUND", 0);
        }

        MedicineBatch memory b = batches[batchId];
        TransferRecord[] memory history = batchHistory[batchId];
        uint256 last = history.length > 0 ? history[history.length - 1].timestamp : 0;

        if (b.status == BatchStatus.Recalled) {
            return (false, "RECALLED", last);
        }
        if (b.expiryDate < block.timestamp) {
            return (false, "EXPIRED", last);
        }

        string memory statusStr;
        if      (b.status == BatchStatus.Manufactured) statusStr = "MANUFACTURED";
        else if (b.status == BatchStatus.InTransit)    statusStr = "IN_TRANSIT";
        else if (b.status == BatchStatus.AtPharmacy)   statusStr = "AT_PHARMACY";
        else if (b.status == BatchStatus.Sold)         statusStr = "SOLD";
        else                                           statusStr = "UNKNOWN";

        return (true, statusStr, last);
    }

    /// @notice Returns the full transfer history for a batch
    function getBatchHistory(string memory batchId)
        external
        view
        override
        batchMustExist(batchId)
        returns (TransferRecord[] memory)
    {
        return batchHistory[batchId];
    }

    /// @notice Check if a batch ID has been registered
    function batchExists(string memory batchId) external view override returns (bool) {
        return batches[batchId].exists;
    }

    /// @notice Get recall reason for a batch
    function getRecallReason(string memory batchId) external view returns (string memory) {
        return recallReasons[batchId];
    }

    /// @notice Get the current owner of a batch
    function getBatchOwner(string memory batchId) external view returns (address) {
        return batchOwner[batchId];
    }

    /// @notice Get total number of registered batches
    function getTotalBatches() external view returns (uint256) {
        return totalBatches;
    }

    /// @notice Get all batch IDs (careful — unbounded, use only for admin/offchain)
    function getAllBatchIds() external view returns (string[] memory) {
        return allBatchIds;
    }

    /// @notice Get a batch by index (for pagination)
    function getBatchIdAt(uint256 index) external view returns (string memory) {
        require(index < allBatchIds.length, "MediChain: index out of bounds");
        return allBatchIds[index];
    }

    /// @notice Get contract stats
    function getStats()
        external
        view
        returns (uint256 _totalBatches, uint256 _totalTransfers, uint256 _totalRecalls)
    {
        return (totalBatches, totalTransfers, totalRecalls);
    }

    // ============================================================
    // ADMIN / EMERGENCY FUNCTIONS
    // ============================================================

    /// @notice Pause all state-changing operations. Only owner (deployer) can call.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause. Only owner can call.
    function unpause() external onlyOwner {
        _unpause();
    }
}
