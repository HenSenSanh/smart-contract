import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Module 1: Deploy the AuctionLogic (implementation contract)
const AuctionLogicModule = buildModule("AuctionLogicModule", (m) => {
  const auctionLogic = m.contract("AuctionLogic");
  return { auctionLogic };
});

// Module 2: Deploy the AuctionFactory, passing the logic address
const AuctionFactoryModule = buildModule("AuctionFactoryModule", (m) => {
  const { auctionLogic } = m.useModule(AuctionLogicModule);
  const feeRecipient = m.getParameter("feeRecipient", m.getAccount(0));
  const feePercentage = m.getParameter("feePercentage", 500);
  const factory = m.contract("AuctionFactory", [auctionLogic, feeRecipient, feePercentage]);
  return { auctionLogic, factory };
});

export default AuctionFactoryModule;
