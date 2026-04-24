import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import * as dotenv from "dotenv";

dotenv.config();

const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL;
const sepoliaPrivateKey = process.env.SEPOLIA_PRIVATE_KEY;
const normalizedSepoliaKey = sepoliaPrivateKey
  ? sepoliaPrivateKey.startsWith("0x")
    ? sepoliaPrivateKey
    : `0x${sepoliaPrivateKey}`
  : undefined;

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    ...(sepoliaRpcUrl && normalizedSepoliaKey
      ? {
          sepolia: {
            url: sepoliaRpcUrl,
            accounts: [normalizedSepoliaKey],
          },
        }
      : {}),
  },
});
