// === Privacy Layer — Encryption & IPFS ===
const PrivacyManager = {
  // Encrypt metadata using the edge API
  async encryptMetadata(payload) {
    try {
      const resp = await fetch('/api/metadata/encrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload })
      });
      return await resp.json();
    } catch (err) {
      console.error('Encryption failed:', err);
      throw new Error('Failed to encrypt metadata');
    }
  },

  // Decrypt metadata
  async decryptMetadata(iv, ciphertext) {
    try {
      const resp = await fetch('/api/metadata/decrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iv, ciphertext })
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      return data.payload;
    } catch (err) {
      console.error('Decryption failed:', err);
      throw new Error('Failed to decrypt metadata');
    }
  },

  // Upload data to content-addressed storage (hash-based)
  async uploadToIPFS(data) {
    try {
      const resp = await fetch('/api/ipfs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      return result;
    } catch (err) {
      console.error('Content hash upload failed:', err);
      throw new Error('Failed to generate content hash');
    }
  },

  // Full privacy flow: encrypt + hash + generate metadata URI
  async processPrivateMetadata(rawMetadata) {
    // Step 1: Encrypt
    const encrypted = await this.encryptMetadata(rawMetadata);

    // Step 2: Upload encrypted data to content-addressed storage
    const hashResult = await this.uploadToIPFS(encrypted.encrypted);

    // Step 3: Generate keccak256 hash for onchain verification
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(encrypted.encrypted));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    const metadataHash = '0x' + Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');

    return {
      metadataURI: hashResult.uri || `sha256://${hashResult.contentHash}`,
      metadataHash,
      contentHash: encrypted.contentHash,
      encrypted: true,
      timestamp: Date.now()
    };
  },

  // Public metadata flow (no encryption)
  async processPublicMetadata(rawMetadata) {
    const hashResult = await this.uploadToIPFS(rawMetadata);

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(rawMetadata));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    const metadataHash = '0x' + Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');

    return {
      metadataURI: hashResult.uri || `sha256://${hashResult.contentHash}`,
      metadataHash,
      encrypted: false,
      timestamp: Date.now()
    };
  },

  // Generate borrower identity hash
  generateIdentityHash(address) {
    // Deterministic hash of lowercase address
    const encoder = new TextEncoder();
    const data = encoder.encode(address.toLowerCase());
    return ethers.keccak256(data);
  }
};

window.PrivacyManager = PrivacyManager;
