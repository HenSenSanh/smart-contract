# Auction Smart Contracts (Hardhat)

## Quick start

```shell
npm install
npm run compile
npm run test
```

## Deploy to local network (for local web app)

1. Start a local chain:

```shell
npm run node
```

2. In another terminal, deploy contracts:

```shell
npm run deploy:localhost
```

3. Deployment output is saved to:

```text
cache/deployments/localhost.json
```

This file includes contract addresses you can use in your local frontend.

## Run the included local frontend

After local deploy, run:

```shell
npm run frontend
```

Open:

```text
http://127.0.0.1:5173
```

Then in the app UI:

1. Click `Start (Auto Setup)`
2. Assign roles:
   - switch MetaMask account -> `Assign Current Wallet as Seller`
   - switch MetaMask account -> `Assign Current Wallet as Bidder 1`
   - switch MetaMask account -> `Assign Current Wallet as Bidder 2`
3. Seller creates auction in `Seller panel`
4. Bidder 1 and Bidder 2 place bids in their own panels
5. Use `Auction monitor` to inspect and end auction

## ABI files for frontend

After compile/deploy, ABIs are available in:

- `artifacts/contracts/AuctionFactory.sol/AuctionFactory.json`
- `artifacts/contracts/AuctionLogic.sol/AuctionLogic.json`
- `artifacts/contracts/MockNFT.sol/MockNFT.json`

Use each file's `abi` field in your web app.

## Local wallet network settings

- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency symbol: `ETH`

## Deploy to Sepolia

1. Create `.env` in project root:

```shell
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
SEPOLIA_PRIVATE_KEY=YOUR_PRIVATE_KEY_WITHOUT_QUOTES
```

2. Deploy:

```shell
npm run deploy:sepolia
```

3. Deployment output is saved to:

```text
cache/deployments/sepolia.json
```

Use those addresses in your frontend when MetaMask is on Sepolia.
