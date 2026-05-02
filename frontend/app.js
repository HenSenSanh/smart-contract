/* ============================================================
   AuctionDApp — Modern Web3 Frontend
   All smart contract logic preserved from original
   ============================================================ */

const { ethers } = window;

const LOCAL_RPC = "http://127.0.0.1:8545";
const LOCAL_CHAIN = {
  chainId: "0x7a69",
  chainName: "Hardhat Local",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["http://127.0.0.1:8545"],
};

// ─── State ─────────────────────────────────────────────────────────

const state = {
  provider: null,
  directRpc: null,
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
  auctions: [],
};

// ─── DOM References ────────────────────────────────────────────────

const el = {
  // Original elements
  btnStart: document.getElementById("btnStart"),
  btnReconnect: document.getElementById("btnReconnect"),
  btnLoadDeployment: document.getElementById("btnLoadDeployment"),
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
  log: document.getElementById("log"),

  // New UI elements
  btnConnectWallet: document.getElementById("btnConnectWallet"),
  walletBtnText: document.getElementById("walletBtnText"),
  walletInfo: document.getElementById("walletInfo"),
  walletAddress: document.getElementById("walletAddress"),
  walletBalance: document.getElementById("walletBalance"),
  networkBadge: document.getElementById("networkBadge"),
  networkName: document.getElementById("networkName"),
  blockStatus: document.getElementById("blockStatus"),
  blockNumber: document.getElementById("blockNumber"),
  setupStatusBadge: document.getElementById("setupStatusBadge"),
  setupAccount: document.getElementById("setupAccount"),
  setupChainId: document.getElementById("setupChainId"),
  setupFactory: document.getElementById("setupFactory"),
  setupNft: document.getElementById("setupNft"),
  factoryStatus: document.getElementById("factoryStatus"),
  nftStatus: document.getElementById("nftStatus"),
  sellerYouBadge: document.getElementById("sellerYouBadge"),
  bidder1YouBadge: document.getElementById("bidder1YouBadge"),
  bidder2YouBadge: document.getElementById("bidder2YouBadge"),
  auctionsEmpty: document.getElementById("auctionsEmpty"),
  auctionsGrid: document.getElementById("auctionsGrid"),
  auctionsSkeleton: document.getElementById("auctionsSkeleton"),
  bidPanels: document.getElementById("bidPanels"),
  monitorSection: document.getElementById("monitorSection"),
  auctionInfoPanel: document.getElementById("auctionInfoPanel"),
  auctionInfoContent: document.getElementById("auctionInfoContent"),
  btnOpenCreateModal: document.getElementById("btnOpenCreateModal"),
  createAuctionModal: document.getElementById("createAuctionModal"),
  auctionDetailModal: document.getElementById("auctionDetailModal"),
  modalAuctionContent: document.getElementById("modalAuctionContent"),
  toastContainer: document.getElementById("toastContainer"),
  btnClearLogs: document.getElementById("btnClearLogs"),
  btnRefreshBalances: document.getElementById("btnRefreshBalances"),
};

// ─── Helpers ───────────────────────────────────────────────────────

function short(a) { return a ? `${a.slice(0,6)}…${a.slice(-4)}` : "—"; }
function norm(a) { return a ? a.toLowerCase() : null; }
const UINT40_MAX = (1n << 40n) - 1n;
const UINT96_MAX = (1n << 96n) - 1n;

function normalizeNumericInput(raw) {
  return String(raw ?? "").trim().replaceAll(",", ".");
}

function parseUintInput(raw, label, { min = 0n, max = null } = {}) {
  const value = normalizeNumericInput(raw);
  if (!value) throw new Error(`${label} is required.`);
  if (!/^\d+$/.test(value)) throw new Error(`${label} must be a whole number.`);
  const parsed = BigInt(value);
  if (parsed < min) throw new Error(`${label} must be at least ${min}.`);
  if (max !== null && parsed > max) throw new Error(`${label} is too large.`);
  return parsed;
}

function parseEthInput(raw, label, { minWei = 0n, maxWei = null } = {}) {
  const value = normalizeNumericInput(raw);
  if (!value) throw new Error(`${label} is required.`);
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`${label} must be a valid ETH amount (example: 0.01).`);
  }
  let wei;
  try {
    wei = ethers.parseEther(value);
  } catch {
    throw new Error(`${label} is invalid. Use up to 18 decimal places.`);
  }
  if (wei < minWei) throw new Error(`${label} must be greater than 0.`);
  if (maxWei !== null && wei > maxWei) throw new Error(`${label} is too large for this contract.`);
  return { value, wei };
}

function log(msg, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${escapeHtml(msg)}`;
  el.log.insertBefore(entry, el.log.firstChild);
  // Keep max 100 entries
  while (el.log.children.length > 100) {
    el.log.removeChild(el.log.lastChild);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ─── Toast Notifications ───────────────────────────────────────────

function showToast(message, type = "info", duration = 4000) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type} rounded-xl px-4 py-3 shadow-xl shadow-black/30 flex items-center gap-3 min-w-[320px] max-w-md`;

  const icons = {
    success: `<svg class="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`,
    error: `<svg class="w-5 h-5 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`,
    info: `<svg class="w-5 h-5 text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
    loading: `<div class="spinner text-slate-400 flex-shrink-0"></div>`,
  };

  toast.innerHTML = `${icons[type] || icons.info}<span class="text-sm font-medium text-slate-200">${escapeHtml(message)}</span>`;
  el.toastContainer.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      toast.classList.add("toast-exit");
      toast.addEventListener("animationend", () => toast.remove());
    }, duration);
  }

  return toast;
}

function removeToast(toast) {
  if (toast && toast.parentNode) {
    toast.classList.add("toast-exit");
    toast.addEventListener("animationend", () => toast.remove());
  }
}

// ─── Modal System ──────────────────────────────────────────────────

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    lucide.createIcons();
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }
}

// ─── Loading States ────────────────────────────────────────────────

function setLoading(element, isLoading) {
  if (!element) return;
  element.disabled = isLoading;
  if (isLoading) {
    element.dataset.originalText = element.innerHTML;
    element.innerHTML = `<div class="spinner inline-block mr-2"></div>Processing...`;
  } else if (element.dataset.originalText) {
    element.innerHTML = element.dataset.originalText;
    lucide.createIcons();
  }
}

function showSkeleton() {
  el.auctionsEmpty.classList.add("hidden");
  el.auctionsGrid.classList.add("hidden");
  el.auctionsSkeleton.classList.remove("hidden");
}

function hideSkeleton() {
  el.auctionsSkeleton.classList.add("hidden");
}

// ─── UI Update Functions ───────────────────────────────────────────

function updateRoleLabels() {
  const roles = [
    { key: "seller", addrEl: el.sellerAddress, badgeEl: el.sellerYouBadge, balEl: el.sellerBalance },
    { key: "bidder1", addrEl: el.bidder1Address, badgeEl: el.bidder1YouBadge, balEl: el.bidder1Balance },
    { key: "bidder2", addrEl: el.bidder2Address, badgeEl: el.bidder2YouBadge, balEl: el.bidder2Balance },
  ];

  for (const r of roles) {
    const addr = state.roles[r.key];
    r.addrEl.textContent = addr ? short(addr) : "Not assigned";
    r.addrEl.title = addr || "";
    if (norm(state.account) === norm(addr) && addr) {
      r.badgeEl.classList.remove("hidden");
      r.badgeEl.classList.add("inline-flex");
    } else {
      r.badgeEl.classList.add("hidden");
      r.badgeEl.classList.remove("inline-flex");
    }
  }
}

async function refreshBalances() {
  if (!state.provider) return;
  const fmt = (b) => parseFloat(ethers.formatEther(b)).toFixed(4);
  const roles = [
    ["seller", el.sellerBalance],
    ["bidder1", el.bidder1Balance],
    ["bidder2", el.bidder2Balance],
  ];
  for (const [role, elBal] of roles) {
    if (state.roles[role]) {
      try {
        const b = await state.provider.getBalance(state.roles[role]);
        elBal.textContent = `${fmt(b)} ETH`;
      } catch { 
        elBal.textContent = "—";
      }
    } else {
      elBal.textContent = "—";
    }
  }
  // Update wallet balance display
  if (state.account && state.provider) {
    try {
      const b = await state.provider.getBalance(state.account);
      el.walletBalance.textContent = `${fmt(b)} ETH`;
    } catch {}
  }
}

function updateSetupStatus() {
  const isConnected = !!state.account;
  const hasDeployment = !!state.deployment;

  // Badge
  if (isConnected && hasDeployment && state.contracts.factory) {
    el.setupStatusBadge.textContent = "Ready";
    el.setupStatusBadge.className = "px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold";
  } else if (isConnected) {
    el.setupStatusBadge.textContent = "Connected";
    el.setupStatusBadge.className = "px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-xs font-semibold";
  } else {
    el.setupStatusBadge.textContent = "Pending Setup";
    el.setupStatusBadge.className = "px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold";
  }

  // Details
  el.setupAccount.textContent = state.account ? short(state.account) : "Not connected";
  el.setupChainId.textContent = state.chainId ?? "—";
  el.setupFactory.textContent = el.factoryAddress.value ? short(el.factoryAddress.value) : "—";
  el.setupNft.textContent = el.nftAddress.value ? short(el.nftAddress.value) : "—";

  // Status dots
  const factoryValid = ethers.isAddress(el.factoryAddress.value);
  const nftValid = ethers.isAddress(el.nftAddress.value);
  el.factoryStatus.className = `w-2 h-2 rounded-full ${factoryValid ? "bg-emerald-500" : "bg-slate-600"}`;
  el.nftStatus.className = `w-2 h-2 rounded-full ${nftValid ? "bg-emerald-500" : "bg-slate-600"}`;

  // Network badge
  if (isConnected) {
    el.networkBadge.classList.remove("hidden");
    el.networkBadge.classList.add("inline-flex");
    el.blockStatus.classList.remove("hidden");
    el.blockStatus.classList.add("inline-flex");
    const netNames = { 31337: "Hardhat Local", 11155111: "Sepolia" };
    el.networkName.textContent = netNames[state.chainId] || `Chain ${state.chainId}`;
  } else {
    el.networkBadge.classList.add("hidden");
    el.networkBadge.classList.remove("inline-flex");
    el.blockStatus.classList.add("hidden");
    el.blockStatus.classList.remove("inline-flex");
  }

  // Wallet button
  if (isConnected) {
    el.btnConnectWallet.classList.add("hidden");
    el.walletInfo.classList.remove("hidden");
    el.walletInfo.classList.add("flex");
    el.walletAddress.textContent = short(state.account);
    el.btnReconnect.classList.remove("hidden");
    el.btnReconnect.classList.add("inline-flex");
  } else {
    el.btnConnectWallet.classList.remove("hidden");
    el.walletInfo.classList.add("hidden");
    el.walletInfo.classList.remove("flex");
    el.btnReconnect.classList.add("hidden");
    el.btnReconnect.classList.remove("inline-flex");
  }
}

async function updateBlockNumber() {
  if (!state.provider) return;
  try {
    const block = await state.provider.getBlockNumber();
    el.blockNumber.textContent = block.toString();
  } catch {}
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
  try { state.directRpc = new ethers.JsonRpcProvider(LOCAL_RPC); } catch {}

  log(`MetaMask connected: ${short(state.account)}`, "success");
  showToast(`Wallet connected: ${short(state.account)}`, "success", 3000);
  updateSetupStatus();
  updateRoleLabels();
  await refreshBalances();
  await updateBlockNumber();
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
      log(`Loaded deployment: ${p}`, "success");
      showToast("Deployment loaded successfully", "success");
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
      `Run: npm run deploy:localhost, then click Reload Deployment.`
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

// ─── Auction List & Cards ──────────────────────────────────────────

function setOptions(sel, addrs) {
  const prev = sel.value;
  sel.innerHTML = "";
  if (!addrs.length) {
    const o = document.createElement("option");
    o.textContent = "No auctions";
    sel.appendChild(o);
    return;
  }
  for (const a of addrs) {
    const o = document.createElement("option");
    o.value = a;
    o.textContent = short(a);
    sel.appendChild(o);
  }
  sel.value = (prev && addrs.includes(prev)) ? prev : addrs[addrs.length - 1];
}

function renderAuctionCard(address, index, details = null) {
  const card = document.createElement("div");
  card.className = "auction-card glass-card rounded-2xl border border-white/5 p-0 overflow-hidden cursor-pointer stagger-" + Math.min(index + 1, 6);
  card.style.animation = "slideUp 0.5s ease-out forwards";
  card.style.opacity = "0";
  card.style.animationDelay = (index * 0.08) + "s";

  const stateText = details ? (Number(details.state) === 0 ? "OPEN" : "ENDED") : "LOADING";
  const stateClass = stateText === "OPEN" ? "badge-open" : "badge-ended";
  const highestBid = details ? ethers.formatEther(details.hBid) : "0";
  const startingPrice = details ? ethers.formatEther(details.startPrice) : "0";
  const tokenId = details ? details.tokenId.toString() : "—";
  const endTime = details ? new Date(Number(details.endTime) * 1000).toLocaleString() : "—";

  card.innerHTML = `
    <div class="auction-image h-32 bg-gradient-to-br from-primary-900/40 to-purple-900/40 flex items-center justify-center relative">
      <div class="absolute top-3 right-3">
        <span class="${stateClass} px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${stateText}</span>
      </div>
      <div class="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-sm">
        <svg class="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
      </div>
    </div>
    <div class="p-5">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-mono text-slate-500">Token #${tokenId}</span>
        <span class="text-[10px] text-slate-600 font-mono">${short(address)}</span>
      </div>
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-400">Highest Bid</span>
          <span class="text-sm font-mono font-semibold text-white">${highestBid} ETH</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-400">Start Price</span>
          <span class="text-sm font-mono text-slate-500">${startingPrice} ETH</span>
        </div>
        <div class="h-px bg-white/5 my-3"></div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500">Ends</span>
          <span class="text-xs font-mono text-slate-400">${endTime}</span>
        </div>
      </div>
      <button class="view-details-btn mt-4 w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-sm font-medium transition-all flex items-center justify-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
        View Details
      </button>
    </div>
  `;

  card.querySelector(".view-details-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openAuctionDetail(address);
  });

  card.addEventListener("click", () => openAuctionDetail(address));

  return card;
}

async function renderAuctionsGrid() {
  if (!state.contracts.factory) return;

  el.auctionsEmpty.classList.add("hidden");
  el.auctionsGrid.classList.add("hidden");
  showSkeleton();

  try {
    const addrs = await state.contracts.factory.getAllAuctions();
    state.auctions = addrs;

    hideSkeleton();

    if (!addrs.length) {
      el.auctionsEmpty.classList.remove("hidden");
      el.auctionsGrid.classList.add("hidden");
      el.bidPanels.classList.add("hidden");
      el.monitorSection.classList.add("hidden");
      return;
    }

    el.auctionsGrid.innerHTML = "";
    el.auctionsGrid.classList.remove("hidden");
    el.bidPanels.classList.remove("hidden");
    el.monitorSection.classList.remove("hidden");

    // Fetch details for each auction
    const detailsPromises = addrs.map(async (addr) => {
      try {
        const auction = new ethers.Contract(addr, state.abis.auction, state.provider);
        const [seller, hBidder, hBid, aState, endTime, tokenId, minInc, startPrice, nftC] = await Promise.all([
          auction.seller(), auction.highestBidder(), auction.highestBid(),
          auction.state(), auction.endTime(), auction.tokenId(),
          auction.minBidIncrement(), auction.startingPrice(), auction.nftContract(),
        ]);
        return { address: addr, seller, hBidder, hBid, state: aState, endTime, tokenId, minInc, startPrice, nftC };
      } catch {
        return null;
      }
    });

    const details = await Promise.all(detailsPromises);

    details.forEach((d, i) => {
      if (d) {
        const card = renderAuctionCard(d.address, i, d);
        el.auctionsGrid.appendChild(card);
      }
    });

    log(`Auctions loaded: ${addrs.length}`, "success");
  } catch (e) {
    hideSkeleton();
    el.auctionsEmpty.classList.remove("hidden");
    throw e;
  }
}

async function refreshAuctions() {
  await initContracts();
  const addrs = await state.contracts.factory.getAllAuctions();
  setOptions(el.bidder1AuctionSelect, addrs);
  setOptions(el.bidder2AuctionSelect, addrs);
  setOptions(el.monitorAuctionSelect, addrs);
  await renderAuctionsGrid();
  log(`Auctions refreshed: ${addrs.length} total`, "info");
}

// ─── Auction Detail Modal ──────────────────────────────────────────

async function openAuctionDetail(address) {
  if (!ethers.isAddress(address)) return;

  el.modalAuctionContent.innerHTML = `
    <div class="flex items-center justify-center py-12">
      <div class="spinner text-primary-400 w-8 h-8"></div>
    </div>
  `;
  openModal("auctionDetailModal");

  try {
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
    const stateColor = stateText === "OPEN" ? "text-emerald-400" : "text-rose-400";
    const endTs = Number(endTime);
    const remaining = Math.max(0, endTs - nowTs);

    el.modalAuctionContent.innerHTML = `
      <div class="space-y-4 animate-fade-in">
        <div class="flex items-center justify-between p-4 rounded-xl bg-slate-950/50 border border-white/5">
          <span class="text-sm text-slate-400">Status</span>
          <span class="text-sm font-bold ${stateColor} uppercase tracking-wider">${stateText}</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Contract</span>
            <span class="text-sm font-mono text-slate-300 break-all">${address}</span>
          </div>
          <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Seller</span>
            <span class="text-sm font-mono text-slate-300 break-all">${seller}</span>
          </div>
          <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">NFT Contract</span>
            <span class="text-sm font-mono text-slate-300 break-all">${nftC}</span>
          </div>
          <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Token ID</span>
            <span class="text-sm font-mono text-slate-300">${tokenId}</span>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5 text-center">
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Starting Price</span>
            <span class="text-lg font-mono font-semibold text-white">${ethers.formatEther(startPrice)} ETH</span>
          </div>
          <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5 text-center">
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Highest Bid</span>
            <span class="text-lg font-mono font-semibold text-primary-400">${ethers.formatEther(hBid)} ETH</span>
          </div>
          <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5 text-center">
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Min Increment</span>
            <span class="text-lg font-mono font-semibold text-white">${ethers.formatEther(minInc)} ETH</span>
          </div>
        </div>
        <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Highest Bidder</span>
          </div>
          <span class="text-sm font-mono text-slate-300 break-all">${hBidder === ethers.ZeroAddress ? "No bids yet" : hBidder}</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">End Time</span>
            <span class="text-sm font-mono text-slate-300">${new Date(endTs * 1000).toLocaleString()}</span>
          </div>
          <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
            <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Time Remaining</span>
            <span class="text-sm font-mono ${remaining > 0 ? "text-emerald-400" : "text-rose-400"}">${remaining > 0 ? remaining + "s" : "Expired"}</span>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    el.modalAuctionContent.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <div class="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-3">
          <svg class="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <p class="text-sm text-slate-400">${escapeHtml(e.message || "Failed to load auction details")}</p>
      </div>
    `;
  }
}

// ─── Seller Actions ────────────────────────────────────────────────

function getSellerInputs() {
  const tokenId = parseUintInput(el.createTokenId.value, "Token ID");
  const duration = parseUintInput(el.createDuration.value, "Duration", { min: 1n, max: UINT40_MAX });
  const startPrice = parseEthInput(el.createStartPrice.value, "Starting price", { minWei: 1n, maxWei: UINT96_MAX });
  const minIncrement = parseEthInput(el.createMinIncrement.value, "Minimum increment", { minWei: 1n });

  el.createTokenId.value = tokenId.toString();
  el.createDuration.value = duration.toString();
  el.createStartPrice.value = startPrice.value;
  el.createMinIncrement.value = minIncrement.value;

  return {
    tid: tokenId,
    price: startPrice.wei,
    dur: duration,
    inc: minIncrement.wei,
  };
}

async function createAuctionAsSeller() {
  await connectWallet();
  await initContracts();
  requireRole("seller", "Seller");
  const { tid, price, dur, inc } = getSellerInputs();

  const t1 = showToast("Minting NFT... Confirm in MetaMask", "loading", 0);
  log(`[Seller] Minting NFT #${tid}... (confirm in MetaMask)`);
  await (await state.contracts.nft.mint(state.account, tid)).wait();
  removeToast(t1);
  showToast("NFT minted successfully", "success");
  log(`[Seller] ✓ Mint complete`, "success");

  const t2 = showToast("Approving NFT for factory... Confirm in MetaMask", "loading", 0);
  log(`[Seller] Approving NFT #${tid} for factory... (confirm in MetaMask)`);
  await (await state.contracts.nft.approve(await state.contracts.factory.getAddress(), tid)).wait();
  removeToast(t2);
  showToast("Approval complete", "success");
  log(`[Seller] ✓ Approve complete`, "success");

  const t3 = showToast("Creating auction... Confirm in MetaMask", "loading", 0);
  log(`[Seller] Creating auction for token #${tid}... (confirm in MetaMask)`);
  await (await state.contracts.factory.createAuction(
    await state.contracts.nft.getAddress(), tid, price, dur, inc
  )).wait();
  removeToast(t3);
  showToast("Auction created successfully!", "success");
  log(`[Seller] ✓ Auction created (${dur}s)`, "success");

  closeModal("createAuctionModal");
  await refreshAuctions();

  try {
    const newest = el.monitorAuctionSelect.value;
    if (ethers.isAddress(newest)) await loadAuctionDetails(newest);
  } catch { /* ignore if load fails */ }

  log("✓ Auction ready! Switch MetaMask to Bidder and place bids.", "info");
}

// ─── Bidder Actions ────────────────────────────────────────────────

function getAuctionAddr(sel) {
  const a = sel.value;
  if (!ethers.isAddress(a)) throw new Error("No auction selected.");
  return a;
}

async function placeBid(roleKey, label, sel, amtEl) {
  await connectWallet();
  await initContracts();
  requireRole(roleKey, label);

  const aAddr = getAuctionAddr(sel);
  await assertDeployedContract(aAddr, "Auction");
  const parsedBid = parseEthInput(amtEl.value, `${label} bid increment`, { minWei: 1n });
  const incrementText = parsedBid.value;
  const incrementWei = parsedBid.wei;
  amtEl.value = incrementText;
  const auction = new ethers.Contract(aAddr, state.abis.auction, state.signer);

  const [highestBidder, highestBid, startingPrice, minIncrement] = await Promise.all([
    auction.highestBidder(),
    auction.highestBid(),
    auction.startingPrice(),
    auction.minBidIncrement(),
  ]);

  const currentBase = highestBidder === ethers.ZeroAddress ? startingPrice : highestBid;
  const minRequired = currentBase + minIncrement;
  const val = currentBase + incrementWei;

  if (incrementWei < minIncrement) {
    throw new Error(
      `Increment too low. Minimum increment is ${ethers.formatEther(minIncrement)} ETH ` +
      `(current base ${ethers.formatEther(currentBase)} ETH).`
    );
  }

  if (val < minRequired) {
    throw new Error(
      `Bid too low. Minimum total required is ${ethers.formatEther(minRequired)} ETH ` +
      `(current base ${ethers.formatEther(currentBase)} ETH, increment ${ethers.formatEther(minIncrement)} ETH).`
    );
  }

  const toast = showToast(
    `${label} bidding +${incrementText} ETH (total ${ethers.formatEther(val)} ETH)... Confirm in MetaMask`,
    "loading",
    0
  );
  log(`[${label}] Bidding +${incrementText} ETH (total ${ethers.formatEther(val)} ETH)... (confirm in MetaMask)`);
  await (await auction.bid({ value: val })).wait();
  removeToast(toast);
  showToast(`${label} bid placed successfully!`, "success");
  log(`[${label}] ✓ Bid placed!`, "success");

  amtEl.value = "";
  await loadAuctionDetails(aAddr);
  await renderAuctionsGrid();
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
  const stateColor = stateText === "OPEN" ? "text-emerald-400" : "text-rose-400";
  const endTs = Number(endTime);
  state.lastAuctionEnd = endTs;
  state.lastBlockTs = nowTs;
  state.lastLoadTime = Date.now();
  const remaining = Math.max(0, endTs - nowTs);

  el.auctionInfoPanel.classList.add("hidden");
  el.auctionInfoContent.classList.remove("hidden");

  el.auctionInfoContent.innerHTML = `
    <div class="space-y-4 animate-fade-in">
      <div class="flex items-center justify-between p-4 rounded-xl bg-slate-950/50 border border-white/5">
        <span class="text-sm text-slate-400">Status</span>
        <span class="text-sm font-bold ${stateColor} uppercase tracking-wider">${stateText}</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
          <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Contract</span>
          <span class="text-sm font-mono text-slate-300 break-all">${address}</span>
        </div>
        <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
          <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Seller</span>
          <span class="text-sm font-mono text-slate-300 break-all">${seller}</span>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5 text-center">
          <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Starting Price</span>
          <span class="text-lg font-mono font-semibold text-white">${ethers.formatEther(startPrice)} ETH</span>
        </div>
        <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5 text-center">
          <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Highest Bid</span>
          <span class="text-lg font-mono font-semibold text-primary-400">${ethers.formatEther(hBid)} ETH</span>
        </div>
        <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5 text-center">
          <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Min Increment</span>
          <span class="text-lg font-mono font-semibold text-white">${ethers.formatEther(minInc)} ETH</span>
        </div>
      </div>
      <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
        <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Highest Bidder</span>
        <span class="text-sm font-mono text-slate-300 break-all">${hBidder === ethers.ZeroAddress ? "No bids yet" : hBidder}</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
          <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">End Time</span>
          <span class="text-sm font-mono text-slate-300">${new Date(endTs * 1000).toLocaleString()}</span>
        </div>
        <div class="p-4 rounded-xl bg-slate-950/50 border border-white/5">
          <span class="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Time Remaining</span>
          <span id="monitorRemaining" class="text-sm font-mono ${remaining > 0 ? "text-emerald-400" : "text-rose-400"}">${remaining > 0 ? remaining + "s" : "Expired"}</span>
        </div>
      </div>
    </div>
  `;

  startCountdown();
}

function startCountdown() {
  stopCountdown();
  state.countdownTimer = setInterval(() => {
    if (!state.lastAuctionEnd) return;
    const elapsed = (Date.now() - state.lastLoadTime) / 1000;
    const remaining = Math.max(0, state.lastAuctionEnd - (state.lastBlockTs + elapsed));
    const remEl = document.getElementById("monitorRemaining");
    if (remEl) {
      remEl.textContent = remaining > 0 ? `${Math.floor(remaining)}s` : "Expired";
      remEl.className = `text-sm font-mono ${remaining > 0 ? "text-emerald-400" : "text-rose-400"}`;
    }
    if (remaining <= 0) stopCountdown();
  }, 1000);
}

function stopCountdown() {
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
}

async function loadSelectedAuction() {
  await loadAuctionDetails(getAuctionAddr(el.monitorAuctionSelect));
}

async function endSelectedAuction() {
  await connectWallet();
  await loadAbis();
  const aAddr = getAuctionAddr(el.monitorAuctionSelect);
  const auction = new ethers.Contract(aAddr, state.abis.auction, state.signer);
  const endTime = Number(await auction.endTime());
  const block = await state.provider.getBlock("latest");
  const now = Number(block?.timestamp ?? 0);
  if (now < endTime) throw new Error(`Wait ${endTime - now}s or use Fast-forward.`);

  const toast = showToast("Ending auction... Confirm in MetaMask", "loading", 0);
  log("Ending auction... (confirm in MetaMask)");
  await (await auction.endAuction()).wait();
  removeToast(toast);
  showToast("Auction ended successfully!", "success");
  await loadAuctionDetails(aAddr);
  log("✓ Auction ended!", "success");
  await renderAuctionsGrid();
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

  const t1 = showToast(`Fast-forwarding ${jump}s...`, "loading", 0);
  log(`Fast-forwarding ${jump}s...`);
  await state.directRpc.send("evm_increaseTime", [jump]);
  await state.directRpc.send("evm_mine", []);
  removeToast(t1);
  showToast("Time advanced", "success");
  log("✓ Time advanced.", "success");

  await connectWallet();
  await loadAbis();
  const auctionMM = new ethers.Contract(aAddr, state.abis.auction, state.signer);
  const t2 = showToast("Ending auction... Confirm in MetaMask", "loading", 0);
  log("Ending auction... (confirm in MetaMask)");
  await (await auctionMM.endAuction()).wait();
  removeToast(t2);
  showToast("Auction ended!", "success");
  await loadAuctionDetails(aAddr);
  log("✓ Auction ended!", "success");
  await renderAuctionsGrid();
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
  if (p === 0n) {
    showToast("No pending refund for your account", "info");
    log("No pending refund for your current MetaMask account.");
    return;
  }
  const toast = showToast(`Withdrawing ${ethers.formatEther(p)} ETH...`, "loading", 0);
  log(`Withdrawing ${ethers.formatEther(p)} ETH... (confirm in MetaMask)`);
  await (await auction.withdraw()).wait();
  removeToast(toast);
  showToast(`Withdrawn ${ethers.formatEther(p)} ETH`, "success");
  await loadAuctionDetails(aAddr);
  log(`✓ Withdrawn ${ethers.formatEther(p)} ETH`, "success");
  await refreshBalances();
}

// ─── Auto Setup ────────────────────────────────────────────────────

async function startAutoSetup() {
  const toast = showToast("Setting up connection...", "loading", 0);
  await connectWallet();
  await loadDeployment();
  await initContracts();
  await refreshAuctions();
  updateRoleLabels();
  updateSetupStatus();
  removeToast(toast);
  showToast("Setup complete! Assign roles to continue.", "success", 5000);
  log("✓ Connected! Now assign roles:", "success");
  log(" 1. Switch MetaMask to SELLER account → click 'Assign as Seller'");
  log(" 2. Switch MetaMask to BIDDER 1 account → click 'Assign as Bidder 1'");
  log(" 3. Switch MetaMask to BIDDER 2 account → click 'Assign as Bidder 2'");
}

function assignRole(roleKey) {
  if (!state.account) throw new Error("Connect MetaMask first.");
  state.roles[roleKey] = state.account;
  updateRoleLabels();
  updateSetupStatus();
  showToast(`${roleKey} assigned: ${short(state.account)}`, "success");
  log(`✓ ${roleKey} = ${state.account}`, "success");
}

// ─── Error Wrapper ─────────────────────────────────────────────────

async function run(fn, btnEl = null) {
  if (btnEl) setLoading(btnEl, true);
  try {
    await fn();
    updateSetupStatus();
    try { await refreshBalances(); } catch { /* ignore */ }
    try { await updateBlockNumber(); } catch { /* ignore */ }
  } catch (e) {
    let raw = e?.reason || e?.shortMessage || e?.message || String(e);
    log(`ERROR: ${raw}`, "error");
    showToast(raw, "error", 5000);
    updateSetupStatus();
    try { await refreshBalances(); } catch { /* ignore */ }
  } finally {
    if (btnEl) setLoading(btnEl, false);
  }
}

// ─── Events ────────────────────────────────────────────────────────

function attachEvents() {
  el.btnStart.addEventListener("click", () => run(startAutoSetup, el.btnStart));
  el.btnReconnect.addEventListener("click", () => run(connectWallet, el.btnReconnect));
  el.btnLoadDeployment.addEventListener("click", () => run(async () => {
    await loadDeployment(); await initContracts(); await refreshAuctions();
  }, el.btnLoadDeployment));
  el.btnAssignSeller.addEventListener("click", () => run(async () => { await connectWallet(); assignRole("seller"); }, el.btnAssignSeller));
  el.btnAssignBidder1.addEventListener("click", () => run(async () => { await connectWallet(); assignRole("bidder1"); }, el.btnAssignBidder1));
  el.btnAssignBidder2.addEventListener("click", () => run(async () => { await connectWallet(); assignRole("bidder2"); }, el.btnAssignBidder2));
  el.btnCreateAuction.addEventListener("click", () => run(createAuctionAsSeller, el.btnCreateAuction));
  el.btnRefreshAuctions.addEventListener("click", () => run(refreshAuctions, el.btnRefreshAuctions));
  el.btnBidder1Bid.addEventListener("click", () =>
    run(() => placeBid("bidder1", "Bidder 1", el.bidder1AuctionSelect, el.bidder1BidAmount), el.btnBidder1Bid));
  el.btnBidder2Bid.addEventListener("click", () =>
    run(() => placeBid("bidder2", "Bidder 2", el.bidder2AuctionSelect, el.bidder2BidAmount), el.btnBidder2Bid));
  el.btnLoadSelectedAuction.addEventListener("click", () => run(loadSelectedAuction, el.btnLoadSelectedAuction));
  el.btnFastForwardEnd.addEventListener("click", () => run(fastForwardAndEnd, el.btnFastForwardEnd));
  el.btnEndAuction.addEventListener("click", () => run(endSelectedAuction, el.btnEndAuction));
  el.btnWithdraw.addEventListener("click", () => run(withdrawPending, el.btnWithdraw));

  // New UI events
  el.btnConnectWallet.addEventListener("click", () => run(connectWallet, el.btnConnectWallet));
  el.btnOpenCreateModal.addEventListener("click", () => openModal("createAuctionModal"));
  el.btnClearLogs.addEventListener("click", () => {
    el.log.innerHTML = "";
    showToast("Logs cleared", "info");
  });
  el.btnRefreshBalances.addEventListener("click", () => run(refreshBalances, el.btnRefreshBalances));
}

function attachWalletListeners() {
  if (!window.ethereum) return;
  window.ethereum.on("accountsChanged", () => run(async () => {
    await connectWallet();
    updateRoleLabels();
    log("Account switched. Check role status above.", "info");
    showToast("Account switched", "info");
  }));
  window.ethereum.on("chainChanged", () => run(connectWallet));
}

// ─── Initialization ────────────────────────────────────────────────

function init() {
  lucide.createIcons();
  updateRoleLabels();
  updateSetupStatus();
  log("Click 'Start (Auto Setup)' to connect MetaMask.", "info");

  // Periodic block update
  setInterval(() => {
    if (state.provider) updateBlockNumber();
  }, 5000);
}

attachEvents();
attachWalletListeners();
init();
