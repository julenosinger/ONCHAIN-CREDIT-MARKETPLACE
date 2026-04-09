const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const {
    USDC_ADDRESS,
    ADMIN_ADDRESS,
    SCORER_ADDRESS,
    DEFAULT_GRACE_PERIOD_SECONDS,
    PLATFORM_MIN_SCORE,
  } = process.env;

  if (!USDC_ADDRESS || !ADMIN_ADDRESS || !SCORER_ADDRESS) {
    throw new Error("Defina USDC_ADDRESS, ADMIN_ADDRESS e SCORER_ADDRESS no .env");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const CreditToken = await hre.ethers.getContractFactory("CreditToken");
  const creditToken = await CreditToken.deploy(ADMIN_ADDRESS);
  await creditToken.waitForDeployment();

  const CreditScore = await hre.ethers.getContractFactory("CreditScore");
  const creditScore = await CreditScore.deploy(ADMIN_ADDRESS, SCORER_ADDRESS);
  await creditScore.waitForDeployment();

  const CreditFactory = await hre.ethers.getContractFactory("CreditFactory");
  const creditFactory = await CreditFactory.deploy(
    await creditToken.getAddress(),
    await creditScore.getAddress(),
    ADMIN_ADDRESS,
    Number(PLATFORM_MIN_SCORE || 450)
  );
  await creditFactory.waitForDeployment();

  const RepaymentManager = await hre.ethers.getContractFactory("RepaymentManager");
  const repaymentManager = await RepaymentManager.deploy(
    USDC_ADDRESS,
    await creditFactory.getAddress(),
    await creditToken.getAddress(),
    await creditScore.getAddress(),
    ADMIN_ADDRESS,
    Number(DEFAULT_GRACE_PERIOD_SECONDS || 259200)
  );
  await repaymentManager.waitForDeployment();

  const Marketplace = await hre.ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy(
    USDC_ADDRESS,
    await creditFactory.getAddress(),
    await creditToken.getAddress(),
    await repaymentManager.getAddress(),
    ADMIN_ADDRESS
  );
  await marketplace.waitForDeployment();

  const minterRole = await creditToken.MINTER_ROLE();
  await (await creditToken.connect(deployer).grantRole(minterRole, await creditFactory.getAddress())).wait();

  const marketplaceRole = await creditFactory.MARKETPLACE_ROLE();
  const repaymentRole = await creditFactory.REPAYMENT_MANAGER_ROLE();

  await (await creditFactory.connect(deployer).grantRole(marketplaceRole, await marketplace.getAddress())).wait();
  await (await creditFactory.connect(deployer).grantRole(repaymentRole, await repaymentManager.getAddress())).wait();

  const repaymentManagerRoleInScore = await creditScore.REPAYMENT_MANAGER_ROLE();
  await (
    await creditScore.connect(deployer).grantRole(repaymentManagerRoleInScore, await repaymentManager.getAddress())
  ).wait();

  const marketplaceRoleInRepayment = await repaymentManager.MARKETPLACE_ROLE();
  await (
    await repaymentManager.connect(deployer).grantRole(marketplaceRoleInRepayment, await marketplace.getAddress())
  ).wait();

  const deployments = {
    network: hre.network.name,
    chainId: 5042002,
    USDC: USDC_ADDRESS,
    CreditToken: await creditToken.getAddress(),
    CreditScore: await creditScore.getAddress(),
    CreditFactory: await creditFactory.getAddress(),
    RepaymentManager: await repaymentManager.getAddress(),
    Marketplace: await marketplace.getAddress(),
    deployedAt: new Date().toISOString(),
  };

  console.log("\n=== DEPLOYMENTS ===");
  console.table(deployments);

  const fs = require("fs");
  fs.writeFileSync("deployments.arc.json", JSON.stringify(deployments, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
