// Simulates the exact frontend flow: seller creates auction → bidder1 bids → bidder2 bids
import hre from "hardhat";

async function main() {
  const connection = await hre.network.getOrCreate();
  const ethers = connection.ethers;

  // Same Hardhat private keys as frontend app.js
  const KEYS = {
    seller:  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Account #1
    bidder1: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // Account #2
    bidder2: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // Account #3
  };

  const sellerWallet = new ethers.Wallet(KEYS.seller, ethers.provider);
  const bidder1Wallet = new ethers.Wallet(KEYS.bidder1, ethers.provider);
  const bidder2Wallet = new ethers.Wallet(KEYS.bidder2, ethers.provider);

  console.log("Seller:  ", sellerWallet.address);
  console.log("Bidder1: ", bidder1Wallet.address);
  console.log("Bidder2: ", bidder2Wallet.address);

  // Deploy contracts
  const [admin] = await ethers.getSigners();
  
  const MockNFT = await ethers.getContractFactory("MockNFT");
  const nft = await MockNFT.deploy();
  await nft.waitForDeployment();
  console.log("MockNFT:", await nft.getAddress());

  const AuctionLogic = await ethers.getContractFactory("AuctionLogic");
  const logic = await AuctionLogic.deploy();
  await logic.waitForDeployment();
  console.log("AuctionLogic:", await logic.getAddress());

  const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
  const factory = await AuctionFactory.deploy(await logic.getAddress(), admin.address, 500);
  await factory.waitForDeployment();
  console.log("AuctionFactory:", await factory.getAddress());

  // === Seller creates auction (same as frontend createAuctionAsSeller) ===
  const nftAsSeller = nft.connect(sellerWallet);
  const factoryAsSeller = factory.connect(sellerWallet);

  const tokenId = 2n;
  const startingPrice = ethers.parseEther("0.1");
  const duration = 120n;
  const minIncrement = ethers.parseEther("0.01");

  console.log("\n--- Seller: Mint ---");
  const mintTx = await nftAsSeller.mint(sellerWallet.address, tokenId);
  await mintTx.wait();
  console.log("✓ Minted token #2");

  console.log("--- Seller: Approve ---");
  const approveTx = await nftAsSeller.approve(await factoryAsSeller.getAddress(), tokenId);
  await approveTx.wait();
  console.log("✓ Approved factory");

  console.log("--- Seller: Create Auction ---");
  const createTx = await factoryAsSeller.createAuction(
    await nft.getAddress(), tokenId, startingPrice, duration, minIncrement
  );
  await createTx.wait();
  console.log("✓ Auction created");

  const allAuctions = await factory.getAllAuctions();
  const auctionAddress = allAuctions[allAuctions.length - 1];
  console.log("Auction address:", auctionAddress);

  // === Bidder 1 bids ===
  console.log("\n--- Bidder 1: Bid 0.2 ETH ---");
  try {
    const auctionAsBidder1 = await ethers.getContractAt("AuctionLogic", auctionAddress, bidder1Wallet);
    const bidTx = await auctionAsBidder1.bid({ value: ethers.parseEther("0.2") });
    await bidTx.wait();
    console.log("✓ Bidder 1 bid placed");
  } catch (e) {
    console.error("✗ Bidder 1 FAILED:", e.reason || e.shortMessage || e.message);
  }

  // === Bidder 2 bids ===
  console.log("\n--- Bidder 2: Bid 0.3 ETH ---");
  try {
    const auctionAsBidder2 = await ethers.getContractAt("AuctionLogic", auctionAddress, bidder2Wallet);
    const bidTx = await auctionAsBidder2.bid({ value: ethers.parseEther("0.3") });
    await bidTx.wait();
    console.log("✓ Bidder 2 bid placed");
  } catch (e) {
    console.error("✗ Bidder 2 FAILED:", e.reason || e.shortMessage || e.message);
  }

  // Check state
  const auction = await ethers.getContractAt("AuctionLogic", auctionAddress);
  console.log("\n--- Final State ---");
  console.log("Highest bidder:", await auction.highestBidder());
  console.log("Highest bid:", ethers.formatEther(await auction.highestBid()), "ETH");
  console.log("Seller:", await auction.seller());
}

main().catch(console.error);
