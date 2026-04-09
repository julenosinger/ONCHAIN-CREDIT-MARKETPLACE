// SPDX-License-Identifier: MIT
// Deployment script for Arc Testnet (Chain ID 5042002)
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS;
const SCORER_ADDRESS = process.env.SCORER_ADDRESS || ADMIN_ADDRESS;
const DEFAULT_GRACE_PERIOD = parseInt(process.env.DEFAULT_GRACE_PERIOD_SECONDS || "259200"); // 3 days
const PLATFORM_MIN_SCORE = parseInt(process.env.PLATFORM_MIN_SCORE || "0");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  
  console.log("========================================");
  console.log("  Arc Testnet Contract Deployment");
  console.log("  Chain ID: 5042002");
  console.log("========================================");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatUnits(balance, 18), "USDC (native)");
  console.log("USDC Address:", USDC_ADDRESS);
  console.log("Admin Address:", ADMIN_ADDRESS);
  console.log("Scorer Address:", SCORER_ADDRESS);
  console.log("Grace Period:", DEFAULT_GRACE_PERIOD, "seconds");
  console.log("Min Score:", PLATFORM_MIN_SCORE);
  console.log("========================================\n");

  if (balance === 0n) {
    throw new Error("Deployer has no balance! Fund wallet from https://faucet.circle.com/");
  }

  // 1. Deploy CreditToken (ERC-721)
  console.log("1/5 Deploying CreditToken...");
  const CreditToken = await hre.ethers.getContractFactory("CreditToken");
  const creditToken = await CreditToken.deploy(ADMIN_ADDRESS);
  await creditToken.waitForDeployment();
  const creditTokenAddr = await creditToken.getAddress();
  console.log("   CreditToken deployed:", creditTokenAddr);

  // 2. Deploy CreditScore
  console.log("2/5 Deploying CreditScore...");
  const CreditScore = await hre.ethers.getContractFactory("CreditScore");
  const creditScore = await CreditScore.deploy(ADMIN_ADDRESS, SCORER_ADDRESS);
  await creditScore.waitForDeployment();
  const creditScoreAddr = await creditScore.getAddress();
  console.log("   CreditScore deployed:", creditScoreAddr);

  // 3. Deploy CreditFactory
  console.log("3/5 Deploying CreditFactory...");
  const CreditFactory = await hre.ethers.getContractFactory("CreditFactory");
  const creditFactory = await CreditFactory.deploy(
    creditTokenAddr,
    creditScoreAddr,
    ADMIN_ADDRESS,
    PLATFORM_MIN_SCORE
  );
  await creditFactory.waitForDeployment();
  const creditFactoryAddr = await creditFactory.getAddress();
  console.log("   CreditFactory deployed:", creditFactoryAddr);

  // 4. Deploy RepaymentManager
  console.log("4/5 Deploying RepaymentManager...");
  const RepaymentManager = await hre.ethers.getContractFactory("RepaymentManager");
  const repaymentManager = await RepaymentManager.deploy(
    USDC_ADDRESS,
    creditFactoryAddr,
    creditTokenAddr,
    creditScoreAddr,
    ADMIN_ADDRESS,
    DEFAULT_GRACE_PERIOD
  );
  await repaymentManager.waitForDeployment();
  const repaymentManagerAddr = await repaymentManager.getAddress();
  console.log("   RepaymentManager deployed:", repaymentManagerAddr);

  // 5. Deploy Marketplace
  console.log("5/5 Deploying Marketplace...");
  const Marketplace = await hre.ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy(
    USDC_ADDRESS,
    creditFactoryAddr,
    creditTokenAddr,
    repaymentManagerAddr,
    ADMIN_ADDRESS
  );
  await marketplace.waitForDeployment();
  const marketplaceAddr = await marketplace.getAddress();
  console.log("   Marketplace deployed:", marketplaceAddr);

  console.log("\n========================================");
  console.log("  Setting Up Roles & Permissions");
  console.log("========================================\n");

  // Grant MINTER_ROLE to CreditFactory on CreditToken
  console.log("Granting MINTER_ROLE to CreditFactory on CreditToken...");
  const MINTER_ROLE = await creditToken.MINTER_ROLE();
  let tx = await creditToken.grantRole(MINTER_ROLE, creditFactoryAddr);
  await tx.wait();
  console.log("   Done.");

  // Grant MARKETPLACE_ROLE to Marketplace on CreditFactory
  console.log("Granting MARKETPLACE_ROLE to Marketplace on CreditFactory...");
  const MARKETPLACE_ROLE = await creditFactory.MARKETPLACE_ROLE();
  tx = await creditFactory.grantRole(MARKETPLACE_ROLE, marketplaceAddr);
  await tx.wait();
  console.log("   Done.");

  // Grant REPAYMENT_MANAGER_ROLE to RepaymentManager on CreditFactory
  console.log("Granting REPAYMENT_MANAGER_ROLE to RepaymentManager on CreditFactory...");
  const REPAYMENT_MANAGER_ROLE = await creditFactory.REPAYMENT_MANAGER_ROLE();
  tx = await creditFactory.grantRole(REPAYMENT_MANAGER_ROLE, repaymentManagerAddr);
  await tx.wait();
  console.log("   Done.");

  // Grant MARKETPLACE_ROLE to Marketplace on RepaymentManager
  console.log("Granting MARKETPLACE_ROLE to Marketplace on RepaymentManager...");
  const RM_MARKETPLACE_ROLE = await repaymentManager.MARKETPLACE_ROLE();
  tx = await repaymentManager.grantRole(RM_MARKETPLACE_ROLE, marketplaceAddr);
  await tx.wait();
  console.log("   Done.");

  // Grant REPAYMENT_MANAGER_ROLE to RepaymentManager on CreditScore
  console.log("Granting REPAYMENT_MANAGER_ROLE to RepaymentManager on CreditScore...");
  const CS_REPAYMENT_MANAGER_ROLE = await creditScore.REPAYMENT_MANAGER_ROLE();
  tx = await creditScore.grantRole(CS_REPAYMENT_MANAGER_ROLE, repaymentManagerAddr);
  await tx.wait();
  console.log("   Done.");

  // Save deployment info
  const deployment = {
    network: "arcTestnet",
    chainId: 5042002,
    deployer: deployer.address,
    usdc: USDC_ADDRESS,
    contracts: {
      creditToken: creditTokenAddr,
      creditScore: creditScoreAddr,
      creditFactory: creditFactoryAddr,
      repaymentManager: repaymentManagerAddr,
      marketplace: marketplaceAddr,
    },
    roles: {
      minterRole: MINTER_ROLE,
      marketplaceRole: MARKETPLACE_ROLE,
      repaymentManagerRole: REPAYMENT_MANAGER_ROLE,
    },
    config: {
      platformMinScore: PLATFORM_MIN_SCORE,
      defaultGracePeriod: DEFAULT_GRACE_PERIOD,
    },
    timestamp: new Date().toISOString(),
    blockNumber: await hre.ethers.provider.getBlockNumber(),
  };

  // Write deployment file
  const deploymentPath = path.join(__dirname, "..", "deployments.arc.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("\nDeployment saved to:", deploymentPath);

  // Print final summary
  console.log("\n========================================");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("Network:            Arc Testnet (5042002)");
  console.log("USDC:              ", USDC_ADDRESS);
  console.log("CreditToken:       ", creditTokenAddr);
  console.log("CreditScore:       ", creditScoreAddr);
  console.log("CreditFactory:     ", creditFactoryAddr);
  console.log("RepaymentManager:  ", repaymentManagerAddr);
  console.log("Marketplace:       ", marketplaceAddr);
  console.log("========================================");
  console.log("\nExplorer links:");
  console.log("CreditToken:       https://testnet.arcscan.app/address/" + creditTokenAddr);
  console.log("CreditScore:       https://testnet.arcscan.app/address/" + creditScoreAddr);
  console.log("CreditFactory:     https://testnet.arcscan.app/address/" + creditFactoryAddr);
  console.log("RepaymentManager:  https://testnet.arcscan.app/address/" + repaymentManagerAddr);
  console.log("Marketplace:       https://testnet.arcscan.app/address/" + marketplaceAddr);

  // Check remaining balance
  const remainingBalance = await hre.ethers.provider.getBalance(deployer.address);
  const spent = balance - remainingBalance;
  console.log("\nGas spent:", hre.ethers.formatUnits(spent, 18), "USDC");
  console.log("Remaining balance:", hre.ethers.formatUnits(remainingBalance, 18), "USDC");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:", error.message || error);
    process.exit(1);
  });
