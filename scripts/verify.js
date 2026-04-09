const hre = require("hardhat");
const fs = require("fs");
require("dotenv").config();

async function verify(address, args = []) {
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments: args,
    });
  } catch (err) {
    console.log(`Falha ao verificar ${address}:`, err.message);
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync("deployments.arc.json", "utf8"));

  await verify(data.CreditToken, [process.env.ADMIN_ADDRESS]);
  await verify(data.CreditScore, [process.env.ADMIN_ADDRESS, process.env.SCORER_ADDRESS]);
  await verify(data.CreditFactory, [data.CreditToken, data.CreditScore, process.env.ADMIN_ADDRESS, Number(process.env.PLATFORM_MIN_SCORE || 450)]);
  await verify(data.RepaymentManager, [
    process.env.USDC_ADDRESS,
    data.CreditFactory,
    data.CreditToken,
    data.CreditScore,
    process.env.ADMIN_ADDRESS,
    Number(process.env.DEFAULT_GRACE_PERIOD_SECONDS || 259200),
  ]);
  await verify(data.Marketplace, [
    process.env.USDC_ADDRESS,
    data.CreditFactory,
    data.CreditToken,
    data.RepaymentManager,
    process.env.ADMIN_ADDRESS,
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
