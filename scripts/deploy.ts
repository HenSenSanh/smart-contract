import hre from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const connection = await hre.network.getOrCreate();
  const ethers = (connection as any).ethers ?? (hre as any).ethers;
  if (!ethers) {
    throw new Error("Hardhat ethers plugin is not available. Check hardhat.config.ts plugin imports.");
  }
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const inferredNetworkName = chainId === 31337 ? "localhost" : chainId === 11155111 ? "sepolia" : undefined;
  const networkName = process.env.HARDHAT_NETWORK ?? (hre as any).network?.name ?? inferredNetworkName ?? "unknown";

  const [admin] = await ethers.getSigners();

  console.log("--- Deploying auction system ---");

  const MockNFT = await ethers.getContractFactory("MockNFT");
  const nft = await MockNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log("1. MockNFT:", nftAddress);

  const AuctionLogic = await ethers.getContractFactory("AuctionLogic");
  const logic = await AuctionLogic.deploy();
  await logic.waitForDeployment();
  const logicAddress = await logic.getAddress();
  console.log("2. AuctionLogic:", logicAddress);

  const feeRecipient = admin.address;
  const feePercentage = 500; // 5%

  const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
  const factory = await AuctionFactory.deploy(logicAddress, feeRecipient, feePercentage);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("3. AuctionFactory:", factoryAddress);

  console.log("4. No sample auction created (manual create from frontend).");

  const deployment = {
    network: networkName,
    chainId,
    rpcUrl: chainId === 31337 ? "http://127.0.0.1:8545" : process.env.SEPOLIA_RPC_URL ?? null,
    contracts: {
      mockNFT: nftAddress,
      auctionLogic: logicAddress,
      auctionFactory: factoryAddress,
      sampleAuction: null,
    },
    fee: {
      recipient: feeRecipient,
      percentageBps: feePercentage,
    },
  };

  const outputDir = path.join(process.cwd(), "cache", "deployments");
  await mkdir(outputDir, { recursive: true });
  const outputNames = new Set<string>([`${networkName}.json`]);
  if (chainId === 31337) outputNames.add("localhost.json");
  if (chainId === 11155111) outputNames.add("sepolia.json");

  for (const fileName of outputNames) {
    const outputFile = path.join(outputDir, fileName);
    await writeFile(outputFile, JSON.stringify(deployment, null, 2), "utf8");
    console.log(`Deployment info saved to: ${outputFile}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
