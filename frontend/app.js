const { ethers } = window;

const LOCAL_RPC = "http://127.0.0.1:8545";
const LOCAL_CHAIN = {
  chainId: "0x7a69",
  chainName: "Hardhat Local",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["http://127.0.0.1:8545"],
};

const state = {
  provider: null,
  directRpc: null,   // For evm_increaseTime (MetaMask can't do this)
  signer: null,
  account: null,
  chainId: null,
  deployment: null,
  abis: null,
  contracts: { factory: null, nft: null },
  roles: { seller: null, bidder1: null, bidder2: null },
  countdownTimer: null,
  lastAuctionEnd: null,
  lastBlockTs: null,
  lastLoadTime: null,
};

const el = {
  btnStart: document.getElementById("btnStart"),
  btnReconnect: document.getElementById("btnReconnect"),
  btnLoadDeployment: document.getElementById("btnLoadDeployment"),
  setupStatus: document.getElementById("setupStatus"),
  factoryAddress: document.getElementById("factoryAddress"),
  nftAddress: document.getElementById("nftAddress"),
  btnAssignSeller: document.getElementById("btnAssignSeller"),
  btnAssignBidder1: document.getElementById("btnAssignBidder1"),
  btnAssignBidder2: document.getElementById("btnAssignBidder2"),
  sellerAddress: document.getElementById("sellerAddress"),
  bidder1Address: document.getElementById("bidder1Address"),
  bidder2Address: document.getElementById("bidder2Address"),
  sellerBalance: document.getElementById("sellerBalance"),
  bidder1Balance: document.getElementById("bidder1Balance"),
  bidder2Balance: document.getElementById("bidder2Balance"),
  createTokenId: document.getElementById("createTokenId"),
  createStartPrice: document.getElementById("createStartPrice"),
  createMinIncrement: document.getElementById("createMinIncrement"),
  createDuration: document.getElementById("createDuration"),
  btnCreateAuction: document.getElementById("btnCreateAuction"),
  btnRefreshAuctions: document.getElementById("btnRefreshAuctions"),
  bidder1AuctionSelect: document.getElementById("bidder1AuctionSelect"),
  bidder1BidAmount: document.getElementById("bidder1BidAmount"),
  btnBidder1Bid: document.getElementById("btnBidder1Bid"),
  bidder2AuctionSelect: document.getElementById("bidder2AuctionSelect"),
  bidder2BidAmount: document.getElementById("bidder2BidAmount"),
  btnBidder2Bid: document.getElementById("btnBidder2Bid"),
  monitorAuctionSelect: document.getElementById("monitorAuctionSelect"),
  btnLoadSelectedAuction: document.getElementById("btnLoadSelectedAuction"),
  btnFastForwardEnd: document.getElementById("btnFastForwardEnd"),
  btnEndAuction: document.getElementById("btnEndAuction"),
  btnWithdraw: document.getElementById("btnWithdraw"),
  auctionInfo: document.getElementById("auctionInfo"),
  log: document.getElementById("log"),
};

// ─── Helpers ───────────────────────────────────────────────────────

function log(msg) {
  el.log.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n${el.log.textContent}`;
}
function short(a) { return a ? `${a.slice(0,6)}…${a.slice(-4)}` : "—"; }
function norm(a) { return a ? a.toLowerCase() : null; }

function updateRoleLabels() {
  el.sellerAddress.textContent = state.roles.seller ?? "Not assigned";
  el.bidder1Address.textContent = state.roles.bidder1 ?? "Not assigned";
  el.bidder2Address.textContent = state.roles.bidder2 ?? "Not assigned";
}

async function refreshBalances() {
  if (!state.provider) return;
  const fmt = (b) => parseFloat(ethers.formatEther(b)).toFixed(4);
  for (const [role, elBal] of [["seller", el.sellerBalance], ["bidder1", el.bidder1Balance], ["bidder2", el.bidder2Balance]]) {
    if (state.roles[role]) {
      try {
        const b = await state.provider.getBalance(state.roles[role]);
        elBal.textContent = `Balance: ${fmt(b)} ETH`;
      } catch { /* ignore balance errors */ }
    }
  }
}

function updateSetupStatus() {
  el.setupStatus.textContent =
    `MetaMask: ${state.account ?? "not connected"}\nChain: ${state.chainId ?? "-"}\n` +
    `Factory: ${el.factoryAddress.value || "-"}\nMockNFT: ${el.nftAddress.value || "-"}\n` +
    `Seller:   ${short(state.roles.seller)}  ${norm(state.account) === norm(state.roles.seller) ? "← YOU" : ""}\n` +
    `Bidder 1: ${short(state.roles.bidder1)}  ${norm(state.account) === norm(state.roles.bidder1) ? "← YOU" : ""}\n` +
    `Bidder 2: ${short(state.roles.bidder2)}  ${norm(state.account) === norm(state.roles.bidder2) ? "← YOU" : ""}`;
}

// ─── MetaMask Connection ───────────────────────────────────────────

async function connectWallet() {
  if (!window.ethereum) throw new Error("MetaMask not found!");
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: LOCAL_CHAIN.chainId }],
    });
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [LOCAL_CHAIN] });
    }
  }
  const existing = await window.ethereum.request({ method: "eth_accounts" });
  if (!existing || existing.length === 0) {
    await window.ethereum.request({ method: "eth_requestAccounts" });
  }
  state.provider = new ethers.BrowserProvider(window.ethereum);
  state.signer = await state.provider.getSigner();
  state.account = await state.signer.getAddress();
  const net = await state.provider.getNetwork();
  state.chainId = Number(net.chainId);
  // Direct RPC for evm_increaseTime (MetaMask can't do this)
  try { state.directRpc = new ethers.JsonRpcProvider(LOCAL_RPC); } catch {}
  log(`MetaMask connected: ${state.account}`);
}

function requireRole(roleKey, label) {
  if (!state.roles[roleKey]) throw new Error(`${label} not assigned. Click "Assign" first.`);
  if (norm(state.account) !== norm(state.roles[roleKey])) {
    throw new Error(`Switch MetaMask to ${label} account (${short(state.roles[roleKey])}), then try again.`);
  }
}

// ─── ABI / Deployment ──────────────────────────────────────────────

async function loadAbis() {
  if (state.abis) return;
  const [f, a, n] = await Promise.all([
    fetch("/artifacts/contracts/AuctionFactory.sol/AuctionFactory.json", { cache: "no-store" }),
    fetch("/artifacts/contracts/AuctionLogic.sol/AuctionLogic.json", { cache: "no-store" }),
    fetch("/artifacts/contracts/MockNFT.sol/MockNFT.json", { cache: "no-store" }),
  ]);
  if (!f.ok || !a.ok || !n.ok) throw new Error("ABI missing. Run: npm run compile");
  const [fj, aj, nj] = await Promise.all([f.json(), a.json(), n.json()]);
  state.abis = { factory: fj.abi, auction: aj.abi, nft: nj.abi };
}

async function loadDeployment() {
  for (const p of [
    "/cache/deployments/localhost.json",
    "/cache/deployments/undefined.json",
    "/cache/deployments/unknown.json",
    "/cache/deployments/sepolia.json",
  ]) {
    const r = await fetch(p, { cache: "no-store" });
    if (r.ok) {
      state.deployment = await r.json();
      el.factoryAddress.value = state.deployment.contracts.auctionFactory || "";
      el.nftAddress.value = state.deployment.contracts.mockNFT || "";
      log(`Loaded: ${p}`);
      return;
    }
  }
  throw new Error("Deployment missing. Run: npm run deploy:localhost");
}

async function assertDeployedContract(address, label) {
  const code = await state.provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(
      `${label} is not deployed on chain ${state.chainId} at ${address}. ` +
      `Run: npm run deploy:localhost, then click Reload Deployment File.`
    );
  }
}

async function initContracts() {
  if (!state.provider || !state.signer) {
    await connectWallet();
  }
  await loadAbis();
  const fa = el.factoryAddress.value.trim();
  const na = el.nftAddress.value.trim();
  if (!ethers.isAddress(fa) || !ethers.isAddress(na)) throw new Error("Invalid addresses.");
  if (state.deployment?.chainId && state.chainId && Number(state.deployment.chainId) !== state.chainId) {
    throw new Error(
      `Deployment chainId (${state.deployment.chainId}) does not match MetaMask chain (${state.chainId}).`
    );
  }
  await assertDeployedContract(fa, "AuctionFactory");
  await assertDeployedContract(na, "MockNFT");
  state.contracts.factory = new ethers.Contract(fa, state.abis.factory, state.signer);
  state.contracts.nft = new ethers.Contract(na, state.abis.nft, state.signer);
}

// ─── Auction List ──────────────────────────────────────────────────

function setOptions(sel, addrs) {
  const prev = sel.value;
  sel.innerHTML = "";
  if (!addrs.length) { const o = document.createElement("option"); o.textContent = "No auctions"; sel.appendChild(o); return; }
  for (const a of addrs) { const o = document.createElement("option"); o.value = a; o.textContent = a; sel.appendChild(o); }
  sel.value = (prev && addrs.includes(prev)) ? prev : addrs[addrs.length - 1];
}

async function refreshAuctions() {
  await initContracts();
  const addrs = await state.contracts.factory.getAllAuctions();
  setOptions(el.bidder1AuctionSelect, addrs);
  setOptions(el.bidder2AuctionSelect, addrs);
  setOptions(el.monitorAuctionSelect, addrs);
  log(`Auctions: ${addrs.length}`);
}

// ─── Seller Actions ────────────────────────────────────────────────

function getSellerInputs() {
  return {
    tid: BigInt(el.createTokenId.value.trim()),
    price: ethers.parseEther(el.createStartPrice.value.trim()),
    dur: BigInt(el.createDuration.value.trim()),
    inc: ethers.parseEther(el.createMinIncrement.value.trim()),
  };
}

async function createAuctionAsSeller() {
  await connectWallet();
  await initContracts();
  requireRole("seller", "Seller");
  const { tid, price, dur, inc } = getSellerInputs();

  log(`[Seller] Minting NFT #${tid}… (confirm in MetaMask)`);
  await (await state.contracts.nft.mint(state.account, tid)).wait();
  log(`[Seller] ✓ Mint complete`);

  log(`[Seller] Approving NFT #${tid} for factory… (confirm in MetaMask)`);
  await (await state.contracts.nft.approve(await state.contracts.factory.getAddress(), tid)).wait();
  log(`[Seller] ✓ Approve complete`);

  log(`[Seller] Creating auction for token #${tid}… (confirm in MetaMask)`);
  await (await state.contracts.factory.createAuction(
    await state.contracts.nft.getAddress(), tid, price, dur, inc
  )).wait();
  log(`[Seller] ✓ Auction created (${dur}s)`);

  await refreshAuctions();
  // Auto-load the newest auction
  try {
    const newest = el.monitorAuctionSelect.value;
    if (ethers.isAddress(newest)) await loadAuctionDetails(newest);
  } catch { /* ignore if load fails */ }
  log("✓ Auction ready! Switch MetaMask to Bidder and place bids.");
}

// ─── Bidder Actions ────────────────────────────────────────────────

function getAuctionAddr(sel) {
  const a = sel.value;
  if (!ethers.isAddress(a)) throw new Error("No auction selected.");
  return a;
}

async function placeBid(roleKey, label, sel, amtEl) {
  await connectWallet(); // Refresh signer
  await initContracts();
  requireRole(roleKey, label);

  const aAddr = getAuctionAddr(sel);
  await assertDeployedContract(aAddr, "Auction");
  const amt = amtEl.value.trim();
  const val = ethers.parseEther(amt);
  const auction = new ethers.Contract(aAddr, state.abis.auction, state.signer);
  const [highestBidder, highestBid, startingPrice, minIncrement] = await Promise.all([
    auction.highestBidder(),
    auction.highestBid(),
    auction.startingPrice(),
    auction.minBidIncrement(),
  ]);
  const minRequired = highestBidder === ethers.ZeroAddress
    ? startingPrice
    : highestBid + minIncrement;
  if (val < minRequired) {
    throw new Error(
      `Bid too low. Minimum required is ${ethers.formatEther(minRequired)} ETH ` +
      `(starting price ${ethers.formatEther(startingPrice)} ETH, increment ${ethers.formatEther(minIncrement)} ETH).`
    );
  }

  log(`[${label}] Bidding ${amt} ETH… (confirm in MetaMask)`);
  await (await auction.bid({ value: val })).wait();
  log(`[${label}] ✓ Bid placed!`);
  await loadAuctionDetails(aAddr);
}

// ─── Auction Monitor ───────────────────────────────────────────────

async function loadAuctionDetails(address) {
  await loadAbis();
  await assertDeployedContract(address, "Auction");
  const auction = new ethers.Contract(address, state.abis.auction, state.provider);
  const block = await state.provider.getBlock("latest");
  const nowTs = Number(block?.timestamp ?? 0);

  let seller, hBidder, hBid, aState, endTime, tokenId, minInc, startPrice, nftC;
  try {
    [seller, hBidder, hBid, aState, endTime, tokenId, minInc, startPrice, nftC] = await Promise.all([
      auction.seller(), auction.highestBidder(), auction.highestBid(),
      auction.state(), auction.endTime(), auction.tokenId(),
      auction.minBidIncrement(), auction.startingPrice(), auction.nftContract(),
    ]);
  } catch {
    throw new Error("Selected auction data is stale. Click 'Refresh Auctions' then pick the newest one.");
  }

  const stateText = Number(aState) === 0 ? "OPEN" : "ENDED";
  const endTs = Number(endTime);
  state.lastAuctionEnd = endTs;
  state.lastBlockTs = nowTs;
  state.lastLoadTime = Date.now();
  const remaining = Math.max(0, endTs - nowTs);

  el.auctionInfo.textContent =
    `Auction: ${address}\nState: ${stateText}\nSeller: ${seller}\n` +
    `NFT: ${nftC}  Token: ${tokenId}\n` +
    `Starting Price: ${ethers.formatEther(startPrice)} ETH\n` +
    `Highest Bidder: ${hBidder}\nHighest Bid: ${ethers.formatEther(hBid)} ETH\n` +
    `Min Increment: ${ethers.formatEther(minInc)} ETH\n` +
    `Ends: ${new Date(endTs * 1000).toLocaleString()}\nRemaining: ${remaining}s`;
  startCountdown();
}

function startCountdown() {
  stopCountdown();
  state.countdownTimer = setInterval(() => {
    if (!state.lastAuctionEnd) return;
    const elapsed = (Date.now() - state.lastLoadTime) / 1000;
    const remaining = Math.max(0, state.lastAuctionEnd - (state.lastBlockTs + elapsed));
    el.auctionInfo.textContent = el.auctionInfo.textContent.replace(/Remaining: \d+s/, `Remaining: ${Math.floor(remaining)}s`);
    if (remaining <= 0) stopCountdown();
  }, 1000);
}
function stopCountdown() { if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; } }

async function loadSelectedAuction() { await loadAuctionDetails(getAuctionAddr(el.monitorAuctionSelect)); }

async function endSelectedAuction() {
  await connectWallet();
  await loadAbis();
  const aAddr = getAuctionAddr(el.monitorAuctionSelect);
  const auction = new ethers.Contract(aAddr, state.abis.auction, state.signer);
  const endTime = Number(await auction.endTime());
  const block = await state.provider.getBlock("latest");
  const now = Number(block?.timestamp ?? 0);
  if (now < endTime) throw new Error(`Wait ${endTime - now}s or use Fast-forward.`);

  log("Ending auction… (confirm in MetaMask)");
  await (await auction.endAuction()).wait();
  await loadAuctionDetails(aAddr);
  log("✓ Auction ended!");
}

async function fastForwardAndEnd() {
  if (!state.directRpc) throw new Error("Direct RPC not available.");
  await connectWallet();
  await loadAbis();
  const aAddr = getAuctionAddr(el.monitorAuctionSelect);
  const auction = new ethers.Contract(aAddr, state.abis.auction, state.provider);
  const endTime = Number(await auction.endTime());
  const block = await state.provider.getBlock("latest");
  const now = Number(block?.timestamp ?? 0);
  const jump = Math.max(1, endTime - now + 1);

  log(`Fast-forwarding ${jump}s…`);
  await state.directRpc.send("evm_increaseTime", [jump]);
  await state.directRpc.send("evm_mine", []);
  log("✓ Time advanced.");

  // Now end via MetaMask
  await connectWallet();
  await loadAbis();
  const auctionMM = new ethers.Contract(aAddr, state.abis.auction, state.signer);
  log("Ending auction… (confirm in MetaMask)");
  await (await auctionMM.endAuction()).wait();
  await loadAuctionDetails(aAddr);
  log("✓ Auction ended!");
}

async function withdrawPending() {
  await connectWallet();
  await loadAbis();
  const aAddr = getAuctionAddr(el.monitorAuctionSelect);
  const auction = new ethers.Contract(aAddr, state.abis.auction, state.signer);
  if (!auction.interface.hasFunction("withdraw()")) {
    throw new Error("This contract version has no withdraw() function. Refund is auto-sent when outbid.");
  }
  const p = await auction.pendingReturns(state.account);
  if (p === 0n) { log("No pending refund for your current MetaMask account."); return; }
  log(`Withdrawing ${ethers.formatEther(p)} ETH… (confirm in MetaMask)`);
  await (await auction.withdraw()).wait();
  await loadAuctionDetails(aAddr);
  log(`✓ Withdrawn ${ethers.formatEther(p)} ETH`);
}

// ─── Auto Setup ────────────────────────────────────────────────────

async function startAutoSetup() {
  await connectWallet();
  await loadDeployment();
  await initContracts();
  await refreshAuctions();
  updateRoleLabels();
  updateSetupStatus();
  log("✓ Connected! Now assign roles:");
  log("   1. Switch MetaMask to SELLER account → click 'Assign as Seller'");
  log("   2. Switch MetaMask to BIDDER 1 account → click 'Assign as Bidder 1'");
  log("   3. Switch MetaMask to BIDDER 2 account → click 'Assign as Bidder 2'");
}

function assignRole(roleKey) {
  if (!state.account) throw new Error("Connect MetaMask first.");
  state.roles[roleKey] = state.account;
  updateRoleLabels();
  updateSetupStatus();
  log(`✓ ${roleKey} = ${state.account}`);
}

// ─── Error Wrapper ─────────────────────────────────────────────────

async function run(fn) {
  try {
    await fn();
    updateSetupStatus();
    try { await refreshBalances(); } catch { /* ignore */ }
  } catch (e) {
    const raw = e?.reason || e?.shortMessage || e?.message || String(e);
    log(`ERROR: ${raw}`);
    updateSetupStatus();
    try { await refreshBalances(); } catch { /* ignore */ }
  }
}

// ─── Events ────────────────────────────────────────────────────────

function attachEvents() {
  el.btnStart.addEventListener("click", () => run(startAutoSetup));
  el.btnReconnect.addEventListener("click", () => run(connectWallet));
  el.btnLoadDeployment.addEventListener("click", () => run(async () => {
    await loadDeployment(); await initContracts(); await refreshAuctions();
  }));
  el.btnAssignSeller.addEventListener("click", () => run(async () => { await connectWallet(); assignRole("seller"); }));
  el.btnAssignBidder1.addEventListener("click", () => run(async () => { await connectWallet(); assignRole("bidder1"); }));
  el.btnAssignBidder2.addEventListener("click", () => run(async () => { await connectWallet(); assignRole("bidder2"); }));
  el.btnCreateAuction.addEventListener("click", () => run(createAuctionAsSeller));
  el.btnRefreshAuctions.addEventListener("click", () => run(refreshAuctions));
  el.btnBidder1Bid.addEventListener("click", () =>
    run(() => placeBid("bidder1", "Bidder 1", el.bidder1AuctionSelect, el.bidder1BidAmount)));
  el.btnBidder2Bid.addEventListener("click", () =>
    run(() => placeBid("bidder2", "Bidder 2", el.bidder2AuctionSelect, el.bidder2BidAmount)));
  el.btnLoadSelectedAuction.addEventListener("click", () => run(loadSelectedAuction));
  el.btnFastForwardEnd.addEventListener("click", () => run(fastForwardAndEnd));
  el.btnEndAuction.addEventListener("click", () => run(endSelectedAuction));
  el.btnWithdraw.addEventListener("click", () => run(withdrawPending));
}

function attachWalletListeners() {
  if (!window.ethereum) return;
  window.ethereum.on("accountsChanged", () => run(async () => {
    await connectWallet();
    log("Account switched. Check role status above.");
  }));
  window.ethereum.on("chainChanged", () => run(connectWallet));
}

attachEvents();
attachWalletListeners();
updateRoleLabels();
updateSetupStatus();
log("Click 'Start (Auto Setup)' to connect MetaMask.");
