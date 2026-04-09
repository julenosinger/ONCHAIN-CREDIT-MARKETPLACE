const fs = require("fs");
const path = require("path");

const contracts = [
  "CreditFactory",
  "CreditToken",
  "Marketplace",
  "RepaymentManager",
  "CreditScore",
];

const outDir = path.join(__dirname, "..", "frontend", "src", "abi");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const name of contracts) {
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  fs.writeFileSync(
    path.join(outDir, `${name}.json`),
    JSON.stringify({ abi: artifact.abi }, null, 2)
  );

  console.log(`ABI exportada: ${name}`);
}
