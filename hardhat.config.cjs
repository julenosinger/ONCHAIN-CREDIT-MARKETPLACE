require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const ARC_RPC_URL = process.env.ARC_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ARC_EXPLORER_API_URL = process.env.ARC_EXPLORER_API_URL || "";
const ARC_EXPLORER_BROWSER_URL = process.env.ARC_EXPLORER_BROWSER_URL || "";
const ARC_EXPLORER_API_KEY = process.env.ARC_EXPLORER_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    arcTestnet: {
      url: ARC_RPC_URL,
      chainId: 5042002,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      arcTestnet: ARC_EXPLORER_API_KEY,
    },
    customChains: [
      {
        network: "arcTestnet",
        chainId: 5042002,
        urls: {
          apiURL: ARC_EXPLORER_API_URL,
          browserURL: ARC_EXPLORER_BROWSER_URL,
        },
      },
    ],
  },
};
