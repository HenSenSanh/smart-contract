import hre from "hardhat";
import { expect } from "chai";

describe("Hệ thống Đấu giá Phi tập trung", function () {
  let factory: any, logic: any, mockNFT: any;
  let owner: any, seller: any, buyer1: any, buyer2: any;
  let ethers: any;

  beforeEach(async function () {
    // Hardhat 3: ethers lives on the network connection, NOT on hre
    const connection = await hre.network.getOrCreate();
    ethers = connection.ethers;
    
    [owner, seller, buyer1, buyer2] = await ethers.getSigners();

    // 1. Deploy Mock NFT
    const MockNFT = await ethers.getContractFactory("MockNFT");
    mockNFT = await MockNFT.deploy();
    await mockNFT.waitForDeployment();

    // 2. Deploy Logic Contract
    const AuctionLogic = await ethers.getContractFactory("AuctionLogic");
    logic = await AuctionLogic.deploy();
    await logic.waitForDeployment();

    // 3. Deploy Factory Contract
    const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
    factory = await AuctionFactory.deploy(logic.target, owner.address, 0);
    await factory.waitForDeployment();

    // Mint NFT cho seller (Giả định token ID = 0)
    await mockNFT.mint(seller.address, 0); 
  });

  it("1. Nên tạo phiên đấu giá và khóa NFT thành công", async function () {
    await mockNFT.connect(seller).approve(factory.target, 0);

    const startingPrice = ethers.parseEther("1"); 
    const duration = 3600; 
    const minIncrement = ethers.parseEther("0.1"); 

    await factory.connect(seller).createAuction(mockNFT.target, 0, startingPrice, duration, minIncrement);

    const allAuctions = await factory.getAllAuctions();
    expect(allAuctions.length).to.equal(1);

    const nftOwner = await mockNFT.ownerOf(0);
    expect(nftOwner).to.equal(allAuctions[0]);
  });

  it("2. Nên xử lý bid và tự động trả tiền cho người cũ (Hybrid Refund)", async function () {
    await mockNFT.connect(seller).approve(factory.target, 0);
    await factory.connect(seller).createAuction(mockNFT.target, 0, ethers.parseEther("1"), 3600, ethers.parseEther("0.1"));
    
    const auctionAddress = (await factory.getAllAuctions())[0];
    const auction = await ethers.getContractAt("AuctionLogic", auctionAddress);

    await auction.connect(buyer1).bid({ value: ethers.parseEther("1") });
    expect(await auction.highestBidder()).to.equal(buyer1.address);

    const balanceBeforeOutbid = await ethers.provider.getBalance(buyer1.address);

    await auction.connect(buyer2).bid({ value: ethers.parseEther("1.2") });

    const balanceAfterOutbid = await ethers.provider.getBalance(buyer1.address);
    expect(balanceAfterOutbid).to.be.greaterThan(balanceBeforeOutbid);
    
    const pending = await auction.pendingReturns(buyer1.address);
    expect(pending).to.equal(0n); 
  });

  it("3. Seller nhận tiền khi đấu giá kết thúc (Full Lifecycle)", async function () {
    // === SETUP: Tạo phiên đấu giá ===
    await mockNFT.connect(seller).approve(factory.target, 0);
    const startingPrice = ethers.parseEther("1");
    const duration = 3600; // 1 giờ
    const minIncrement = ethers.parseEther("0.1");

    await factory.connect(seller).createAuction(
      mockNFT.target, 0, startingPrice, duration, minIncrement
    );

    const auctionAddress = (await factory.getAllAuctions())[0];
    const auction = await ethers.getContractAt("AuctionLogic", auctionAddress);

    // === BID: buyer1 = 1 ETH, buyer2 = 2 ETH ===
    await auction.connect(buyer1).bid({ value: ethers.parseEther("1") });
    await auction.connect(buyer2).bid({ value: ethers.parseEther("2") });

    // === GHI NHẬN SỐ DƯ SELLER TRƯỚC KHI KẾT THÚC ===
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    // === FAST-FORWARD TIME: Nhảy thời gian qua endTime ===
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);

    // === END AUCTION: Bất kỳ ai cũng gọi được ===
    await auction.connect(owner).endAuction();

    // === KIỂM TRA: Seller nhận 2 ETH ===
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerProfit = sellerBalanceAfter - sellerBalanceBefore;
    expect(sellerProfit).to.equal(ethers.parseEther("2"));
    console.log(`    💰 Seller nhận: ${ethers.formatEther(sellerProfit)} ETH`);

    // === KIỂM TRA: Winner (buyer2) nhận NFT ===
    const nftOwner = await mockNFT.ownerOf(0);
    expect(nftOwner).to.equal(buyer2.address);
    console.log(`    🏆 NFT chuyển cho winner: ${buyer2.address}`);

    // === KIỂM TRA: Auction state = ENDED ===
    expect(await auction.state()).to.equal(1); // 1 = ENDED
  });

  it("4. NFT trả lại seller nếu không ai bid", async function () {
    await mockNFT.connect(seller).approve(factory.target, 0);
    await factory.connect(seller).createAuction(
      mockNFT.target, 0, ethers.parseEther("1"), 3600, ethers.parseEther("0.1")
    );

    const auctionAddress = (await factory.getAllAuctions())[0];
    const auction = await ethers.getContractAt("AuctionLogic", auctionAddress);

    // Không có ai bid — nhảy thời gian
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);

    await auction.endAuction();

    // NFT phải quay lại cho seller
    const nftOwner = await mockNFT.ownerOf(0);
    expect(nftOwner).to.equal(seller.address);
    console.log(`    ↩️  NFT trả lại seller: ${seller.address}`);
  });
});
