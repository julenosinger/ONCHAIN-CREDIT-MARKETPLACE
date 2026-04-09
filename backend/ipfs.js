const { create } = require("ipfs-http-client");

function getClient() {
  const auth =
    process.env.IPFS_PROJECT_ID && process.env.IPFS_PROJECT_SECRET
      ? `Basic ${Buffer.from(`${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_PROJECT_SECRET}`).toString("base64")}`
      : undefined;

  return create({
    url: process.env.IPFS_API_URL,
    headers: auth ? { authorization: auth } : undefined,
  });
}

async function uploadJSON(payload) {
  const client = getClient();
  const result = await client.add(JSON.stringify(payload));

  return {
    cid: result.cid.toString(),
    uri: `ipfs://${result.cid.toString()}`,
  };
}

module.exports = {
  uploadJSON,
};
