import { ethers } from 'ethers';

class BlockchainService {
  
  constructor() {
    this.contractAddress = "0x2d70F92a6d25345C9B62a9542843dfDB28c17F68";
    this.providerUrl = "http://127.0.0.1:7545";
    this.contract = null;
    this.provider = null;
    this.signer = null;

    this.abi = [
      "function storeRecord(uint256 recordId, bytes32 recordHash) external",
      "function verifyRecord(uint256 recordId, bytes32 recordHash) external view returns (bool)",
      "function getRecordHash(uint256 recordId) external view returns (bytes32)",
      "function getRecordTimestamp(uint256 recordId) external view returns (uint256)",
      "function totalRecords() external view returns (uint256)",
      "function owner() external view returns (address)",
      "function pendingOwner() external view returns (address)",
      "function transferOwnership(address newOwner) external",
      "function acceptOwnership() external",
      "function cancelOwnershipTransfer() external",
      "function addVet(address vet) external",
      "function removeVet(address vet) external",
      "function isAuthorized(address vet) external view returns (bool)",
      "event RecordStored(uint256 indexed recordId, bytes32 recordHash, uint256 timestamp)",
      "event OwnershipTransferInitiated(address indexed currentOwner, address indexed pendingOwner)",
      "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"
    ];
  }

  // Generate a collision-safe uint256 record ID from a booking ID + timestamp + random salt.
  // Avoids the Date.now() collision risk when two bookings land in the same millisecond.
  generateRecordId(bookingId) {
    const salt   = Math.floor(Math.random() * 1_000_000);
    const raw    = `${bookingId}-${Date.now()}-${salt}`;
    const hashed = ethers.id(raw);                      // keccak256 → bytes32 hex
    // Take the last 15 hex digits and convert to a safe JS integer (< 2^53)
    return parseInt(hashed.slice(-15), 16);
  }

  // Initialize connection to Ganache
  async connect() {
    try {
      this.provider = new ethers.JsonRpcProvider(this.providerUrl);
      this.signer = await this.provider.getSigner(0);
      this.contract = new ethers.Contract(
        this.contractAddress,
        this.abi,
        this.signer
      );

      // Risk 3 warning: default Ganache account 0 uses a publicly known mnemonic.
      // In production, replace getSigner(0) with a wallet loaded from a secured
      // private key (e.g. environment variable or hardware wallet).
      const signerAddress = await this.signer.getAddress();
      console.warn(
        "⚠️  BlockchainService: connected using Ganache default account", signerAddress,
        "\n   DO NOT use this in production — the private key is publicly known.",
        "\n   Replace with: new ethers.Wallet(process.env.PRIVATE_KEY, this.provider)"
      );

      console.log("✅ BlockchainService connected.");
      return true;
    } catch (err) {
      console.error("❌ Connection failed:", err.message);
      return false;
    }
  }

  // Make sure contract is connected before any call
  async ensureConnected() {
    if (!this.contract) {
      await this.connect();
    }
  }

  // Hash record data into bytes32
  hashRecord(recordData) {
    return ethers.id(JSON.stringify(recordData));
  }

  // Store a medical record hash on blockchain
  async storeRecord(recordId, recordData) {
    try {
      await this.ensureConnected();
      const hash = this.hashRecord(recordData);
      const tx = await this.contract.storeRecord(recordId, hash);
      await tx.wait();
      return { success: true, hash };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Verify if a record matches what's stored on chain
  async verifyRecord(recordId, recordData) {
    try {
      await this.ensureConnected();
      const hash = this.hashRecord(recordData);
      const isValid = await this.contract.verifyRecord(recordId, hash);
      return { success: true, isValid };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Get the stored hash of a record by ID
  async getRecordHash(recordId) {
    try {
      await this.ensureConnected();
      const hash = await this.contract.getRecordHash(recordId);
      return { success: true, hash };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Get the timestamp of when a record was stored
  async getRecordTimestamp(recordId) {
    try {
      await this.ensureConnected();
      const timestamp = await this.contract.getRecordTimestamp(recordId);
      const date = new Date(Number(timestamp) * 1000).toLocaleString();
      return { success: true, timestamp: date };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Get overall blockchain connection status
  async getStatus() {
    try {
      await this.ensureConnected();
      const owner = await this.contract.owner();
      const total = await this.contract.totalRecords();
      return {
        connected: true,
        owner,
        totalRecords: total.toString(),
        contractAddress: this.contractAddress,
        network: "Ganache Local (Chain 1337)"
      };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }
}

// Export a single shared instance (Singleton pattern)
const blockchainService = new BlockchainService();
export default blockchainService;