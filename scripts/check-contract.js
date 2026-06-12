const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const ABI = [
  "function owner() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function getRequestCount() view returns (uint256)"
];

async function main() {
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const useLatest = process.argv.includes("--latest");
  const latestDeploymentPath = path.join(__dirname, "..", "deployments", "localhost.json");
  const latestAddress =
    useLatest && fs.existsSync(latestDeploymentPath)
      ? JSON.parse(fs.readFileSync(latestDeploymentPath, "utf8")).address
      : "";
  const address = latestAddress || process.argv[2] || process.env.CONTRACT_ADDRESS;

  if (!address || !ethers.isAddress(address)) {
    console.error("Usage: npm run check:contract -- 0xYourDeployedContractAddress");
    console.error("Or: npm run check:latest");
    process.exitCode = 1;
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();

  console.log(`RPC URL: ${rpcUrl}`);
  console.log(`Chain ID: ${network.chainId}`);

  if (network.chainId !== 31337n) {
    console.log("Warning: expected Hardhat Local chain ID 31337.");
  }

  const code = await provider.getCode(address);
  console.log(`Address: ${address}`);
  console.log(`Has contract code: ${code !== "0x"}`);

  if (code === "0x") {
    console.log("Result: this address is not a deployed contract on the current RPC.");
    console.log("Fix: run npm run deploy:localhost again and use the deployed contract address.");
    return;
  }

  const contract = new ethers.Contract(address, ABI, provider);
  const owner = await contract.owner();
  const name = await contract.name();
  const symbol = await contract.symbol();
  const requestCount = await contract.getRequestCount();

  console.log(`Owner: ${owner}`);
  console.log(`NFT name: ${name}`);
  console.log(`NFT symbol: ${symbol}`);
  console.log(`Request count: ${requestCount}`);
  console.log("Result: contract is reachable and matches this DApp.");
}

main().catch((error) => {
  console.error("Check failed:");
  console.error(error.shortMessage || error.reason || error.message);
  process.exitCode = 1;
});
