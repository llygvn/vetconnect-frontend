// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VetConnectRecords {

    address public owner;

    // Role-based access
    mapping(address => bool) public authorizedVets;

    // ONE mapping, ONE SSTORE — store only the hash
    mapping(uint256 => bytes32) private records;

    event RecordStored(uint256 indexed recordId, bytes32 recordHash, uint256 timestamp);
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

    function storeRecord(uint256 recordId, bytes32 recordHash) external onlyAuthorized {
        require(records[recordId] == bytes32(0), "Record already exists");
        records[recordId] = recordHash;  // single SSTORE
        emit RecordStored(recordId, recordHash, block.timestamp);
    }

    function verifyRecord(uint256 recordId, bytes32 recordHash) external view returns (bool) {
        return records[recordId] == recordHash;
    }

    function getRecordHash(uint256 recordId) external view returns (bytes32) {
        return records[recordId];
    }

    // --- Ownership ---

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}