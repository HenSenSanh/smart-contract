# Tong Quan Moi Truong Hoat Dong - Auction DApp

Tai lieu nay tong hop trang thai code hien tai cua du an de ban co mot diem tham chieu duy nhat ve:
- Moi truong chay
- Kien truc he thong
- Luong deploy va luong van hanh frontend
- Cac loai phi va cach xu ly du lieu

## 1. Muc tieu he thong

He thong la DApp dau gia NFT tren Ethereum, trong do:
- Seller tao phien dau gia cho NFT
- Nhieu bidder dat gia bang native ETH
- Phien ket thuc se chuyen NFT cho nguoi thang va chia tien theo cau hinh phi nen tang

## 2. Stack ky thuat

- Smart contract: Solidity 0.8.24
- Framework: Hardhat 3
- Thu vien blockchain: Ethers v6
- Thu vien contract: OpenZeppelin
- Ngon ngu script/test: TypeScript
- Frontend: HTML/CSS/JS thuan + MetaMask + ethers UMD
- Frontend server: Node HTTP server tu viet

Dependency va scripts chinh nam trong package.json.

## 3. Cau truc thu muc chinh

- contracts/
  - AuctionFactory.sol
  - AuctionLogic.sol
  - MockNFT.sol
- scripts/
  - deploy.ts
  - serve-frontend.mjs
  - test-frontend-flow.ts
- frontend/
  - index.html
  - app.js
  - styles.css
- test/
  - Auction.test.ts
- ignition/modules/
  - AuctionSystem.ts
- cache/deployments/
  - localhost.json
  - undefined.json

## 4. Moi truong blockchain va cau hinh

### 4.1 Local Hardhat

- RPC URL: http://127.0.0.1:8545
- Chain ID: 31337
- Native coin: ETH

### 4.2 Sepolia

Hardhat se bat network Sepolia neu co du 2 bien moi truong:
- SEPOLIA_RPC_URL
- SEPOLIA_PRIVATE_KEY

Private key duoc normalize ve dang 0x... neu ban nhap thieu prefix.

### 4.3 Compiler

- Solidity: 0.8.24
- EVM version: cancun
- Optimizer: enabled, runs = 200

## 5. Y nghia tung contract

### 5.1 AuctionFactory.sol

Vai tro: contract dieu phoi va quan ly toan bo phien dau gia.

Nhiem vu chinh:
- Giu dia chi implementation AuctionLogic (mau logic goc)
- Tao clone moi cho moi phien dau gia (factory pattern + clones)
- Nhan NFT tu seller va chuyen vao clone khi tao auction
- Truyen cau hinh phi nen tang cho clone
- Luu danh sach allAuctions va auctionsBySeller
- Cho phep owner cap nhat feeRecipient va feePercentage

Luu y:
- Phi toi da bi gioi han 1000 bps (10%) trong setFeeConfig.

### 5.2 AuctionLogic.sol

Vai tro: logic cua mot phien dau gia don le.

Nhiem vu chinh:
- initialize: khoi tao seller, NFT, tokenId, gia khoi diem, thoi gian, buoc gia, phi
- bid:
  - Cam seller tu bid
  - Bid dau >= startingPrice
  - Bid sau >= highestBid + minBidIncrement
  - Neu con duoi 2 phut thi gia han den block.timestamp + 2 phut (anti-sniping)
  - Hoan tien nguoi cu theo hybrid refund:
    - Thu hoan truc tiep truoc
    - Neu that bai thi cong vao pendingReturns
- endAuction:
  - Chi cho ket thuc khi het thoi gian
  - Co winner: chuyen NFT cho winner, chia ETH cho seller va feeRecipient
  - Khong co winner: tra NFT lai seller
- withdraw: nguoi dung rut pendingReturns

### 5.3 MockNFT.sol

Vai tro: ERC-721 mau de demo/test local.

Dac diem:
- Ten token: MockNFT
- Symbol: MNFT
- mint(address to, uint256 tokenId) la external va khong gioi han owner

Y nghia thuc te:
- Phuc vu dev nhanh va frontend demo
- Khong phai contract production-level cho mint permission

## 6. Luong deploy

Script deploy chinh: scripts/deploy.ts

Trinh tu:
1. Deploy MockNFT
2. Deploy AuctionLogic (implementation)
3. Deploy AuctionFactory(logicAddress, feeRecipient, feePercentage)
4. Ghi thong tin deployment ra cache/deployments/*.json

Gia tri mac dinh hien tai:
- feeRecipient = tai khoan admin deploy
- feePercentage = 500 bps (5%)

File output co the la:
- localhost.json (chain 31337)
- sepolia.json (chain 11155111)
- Va mot ten theo networkName suy luan

## 7. Luong van hanh frontend

### 7.1 Serve static

scripts/serve-frontend.mjs mo HTTP server va mount:
- / -> frontend/
- /artifacts -> artifacts/
- /cache -> cache/
- /node_modules -> node_modules/

Mac dinh chay tai:
- http://127.0.0.1:5173

### 7.2 Runtime flow trong app.js

1. Start (Auto Setup)
   - Ket noi MetaMask
   - Switch/add local chain 31337 neu can
   - Load deployment JSON
   - Load ABIs tu artifacts
   - Init contract instances
2. Assign role
   - Gan Seller, Bidder1, Bidder2 theo account MetaMask hien tai
3. Seller panel
   - Mint NFT
   - Approve NFT cho Factory
   - Create auction
4. Bidder panel
   - Chon auction
   - Dat gia ETH
5. Monitor
   - Xem thong tin phien dau gia
   - End auction thu cong
   - Hoac fast-forward time (local only) + end
   - Withdraw pending refund neu co

## 8. Phi va chi phi

### 8.1 Phi nen tang (commission)

- Tinh luc endAuction:
  - feeAmount = highestBid * feePercentage / 10000
  - sellerAmount = highestBid - feeAmount
- feeAmount gui ve feeRecipient

### 8.2 Gas fee

Nguoi ky giao dich tra gas tuong ung:
- Seller: mint, approve, createAuction
- Bidder: bid
- Nguoi goi endAuction: tra gas cho lenh ket thuc
- Nguoi goi withdraw: tra gas rut pending

## 9. Du lieu duoc luu o dau

### 9.1 On-chain

- State auction (seller, highestBid, highestBidder, endTime, state, pendingReturns...)
- Cau hinh phi o Factory (feeRecipient, feePercentage)
- So huu NFT

### 9.2 Off-chain trong project

- artifacts/: ABI va bytecode sau compile
- cache/deployments/*.json: dia chi contract va fee snapshot cho frontend

### 9.3 Backend database

- Hien tai KHONG co backend DB (PostgreSQL/MySQL/MongoDB)
- Frontend doc truc tiep JSON + goi blockchain qua MetaMask/JSON-RPC

## 10. API/RPC dang su dung

### 10.1 Wallet API (EIP-1193)

- wallet_switchEthereumChain
- wallet_addEthereumChain
- eth_accounts
- eth_requestAccounts

### 10.2 Local JSON-RPC methods (test local)

- evm_increaseTime
- evm_mine

### 10.3 File fetch static

- /artifacts/contracts/.../*.json
- /cache/deployments/localhost.json (uu tien)

## 11. Kiem thu va script mo phong

### 11.1 Unit/Integration tests

test/Auction.test.ts bao gom cac case:
- Tao phien va khoa NFT
- Bid + hoan tien nguoi bi outbid
- Ket thuc co winner
- Ket thuc khong winner, NFT tra seller

Luu y:
- Trong test, Factory duoc deploy voi fee = 0 bps
- Vi vay assert seller nhan du gia thang la dung voi test, nhung khac mac dinh deploy script (5%)

### 11.2 Frontend flow simulator

scripts/test-frontend-flow.ts mo phong dung trinh tu frontend:
- seller mint + approve + create
- bidder1 bid
- bidder2 bid

## 12. Lenh van hanh de xai ngay

```bash
npm install
npm run compile
npm run node
```

Mo terminal moi:

```bash
npm run deploy:localhost
```

Mo terminal moi:

```bash
npm run frontend
```

Mo trinh duyet:
- http://127.0.0.1:5173

## 13. Snapshot hien tai trong cache/deployments/localhost.json

- chainId: 31337
- rpcUrl: http://127.0.0.1:8545
- mockNFT: 0x5FbDB2315678afecb367f032d93F642f64180aa3
- auctionLogic: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
- auctionFactory: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
- fee recipient: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
- fee: 500 bps (5%)

## 14. Ghi chu ky thuat quan trong

- Day la mo hinh hybrid refund, khong phai pull-only refund:
  - Thu hoan truc tiep truoc, fail moi vao pendingReturns
- endAuction khong auto-trigger on-chain; can co nguoi goi ham
- Frontend hien tai khong subscribe contract events theo real-time stream (chi cap nhat theo action va reload)
- app.js dang thu localhost.json va unknown.json; trong cache hien tai co localhost.json va undefined.json
