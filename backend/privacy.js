const crypto = require("crypto");

function deriveKey(secret) {
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptJson(payload, secret) {
  const iv = crypto.randomBytes(12);
  const key = deriveKey(secret);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
}

function decryptJson(encryptedPayload, secret) {
  const key = deriveKey(secret);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encryptedPayload.iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(encryptedPayload.tag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPayload.ciphertext, "hex")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

module.exports = {
  encryptJson,
  decryptJson,
};
