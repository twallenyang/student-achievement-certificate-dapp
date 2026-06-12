const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const Certificate = await hre.ethers.getContractFactory("StudentAchievementCertificate");
  const certificate = await Certificate.deploy();

  await certificate.waitForDeployment();

  const address = await certificate.getAddress();
  const network = await hre.ethers.provider.getNetwork();
  const deployment = {
    contractName: "StudentAchievementCertificate",
    address,
    chainId: network.chainId.toString(),
    deployedAt: new Date().toISOString()
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, "localhost.json"),
    `${JSON.stringify(deployment, null, 2)}\n`
  );

  console.log(`StudentAchievementCertificate deployed to: ${address}`);
  console.log("Saved deployment info to: deployments/localhost.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
