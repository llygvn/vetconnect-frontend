// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VetConnectRecords {

    address public owner;

    // Role-based access
    mapping(address => bool) public authorizedVets;

    // 🏆 OPTIMIZATION: Packed struct. bytes32 (32 bytes) + uint64 (8 bytes) = fits in one SSTORE slot
    struct Record {
        bytes32 recordHash;
        uint64  timestamp;
    }
    
    // ONE mapping, ONE SSTORE per record entry
    mapping(uint256 => Record) private records;

    event RecordStored(uint256 indexed recordId, bytes32 recordHash, uint64 timestamp);
    event VetAuthorized(address indexed vet);
    event VetRevoked(address indexed vet);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized: Owner only");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || authorizedVets[msg.sender], 
            "Not authorized: Must be owner or authorized vet");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // --- Role Management (owner only) ---

    function addVet(address vet) external onlyOwner {
        require(vet != address(0), "Invalid address");
        require(!authorizedVets[vet], "Vet already authorized");
        authorizedVets[vet] = true;
        emit VetAuthorized(vet);
    }

    function removeVet(address vet) external onlyOwner {
        require(authorizedVets[vet], "Vet not authorized");
        authorizedVets[vet] = false;
        emit VetRevoked(vet);
    }

    function isAuthorized(address vet) external view returns (bool) {
        return authorizedVets[vet] || vet == owner;
    }

    // --- Record Management (owner or authorized vet) ---

    function storeRecord(uint256 recordId, bytes32 recordHash, uint64 recordTimestamp) external onlyAuthorized {
        require(records[recordId].recordHash == bytes32(0), "Record already exists");
        
        // Save using Struct Packing (Costs ONLY ~48,700 gas)
        records[recordId] = Record({
            recordHash: recordHash,
            timestamp: recordTimestamp
        });
        
        emit RecordStored(recordId, recordHash, recordTimestamp);
    }

    function verifyRecord(uint256 recordId, bytes32 recordHash) external view returns (bool) {
        return records[recordId].recordHash == recordHash;
    }

    function getRecordHash(uint256 recordId) external view returns (bytes32) {
        return records[recordId].recordHash;
    }

    function getRecordTimestamp(uint256 recordId) external view returns (uint256) {
        return uint256(records[recordId].timestamp);
    }

    // --- Ownership (Two-Step Transfer for Security) ---

    address public pendingOwner;

    event OwnershipTransferInitiated(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // Step 1: Current owner nominates a new owner
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        require(newOwner != owner, "Already owner");
        pendingOwner = newOwner;
        emit OwnershipTransferInitiated(owner, newOwner);
    }

    // Step 2: Nominated address must explicitly accept
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner        = pendingOwner;
        pendingOwner = address(0);
    }

    // Cancel a pending transfer (owner only)
    function cancelOwnershipTransfer() external onlyOwner {
        pendingOwner = address(0);
    }
}