// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract AuctionLogic is Initializable {
    enum AuctionState { OPEN, ENDED }
    AuctionState public state;

    address public seller;
    uint96  public startingPrice;
    address public highestBidder;
    uint96  public highestBid;
    address public nftContract;
    uint40  public endTime;
    bool    private locked; 
    uint16  public feePercentage; 
    address public feeRecipient; 
    uint256 public tokenId;
    uint256 public minBidIncrement;
    
    mapping(address => uint256) public pendingReturns;
    uint40 public constant TIME_BUFFER = 2 minutes;

    event BidPlaced(address indexed bidder, uint256 amount);
    event AuctionEnded(address indexed winner, uint256 finalPrice, uint256 fee);
    event Refunded(address indexed bidder, uint256 amount);

    modifier nonReentrant() {
        require(!locked, "ReentrancyGuard: reentrant call");
        locked = true;
        _;
        locked = false;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _seller, address _nftContract, uint256 _tokenId, 
        uint96 _startingPrice, uint40 _duration, uint256 _minBidIncrement,
        address _feeRecipient, uint16 _feePercentage
    ) external initializer {
        seller = _seller;
        nftContract = _nftContract;
        tokenId = _tokenId;
        startingPrice = _startingPrice;
        endTime = uint40(block.timestamp + _duration);
        minBidIncrement = _minBidIncrement;
        state = AuctionState.OPEN;
        feeRecipient = _feeRecipient;
        feePercentage = _feePercentage;
    }

    function bid() external payable nonReentrant {
        require(state == AuctionState.OPEN, "Auction is not OPEN");
        require(block.timestamp < endTime, "Auction time ended");
        require(msg.sender != seller, "Seller cannot bid");
        
        if (highestBidder == address(0)) {
            require(msg.value >= startingPrice, "Must bid at least starting price");
        } else {
            require(msg.value >= highestBid + minBidIncrement, "Bid increment too low");
        }

        if (endTime - block.timestamp < TIME_BUFFER) {
            endTime = uint40(block.timestamp + TIME_BUFFER);
        }

        address previousBidder = highestBidder;
        uint256 previousBid = highestBid;
        highestBidder = msg.sender;
        highestBid = uint96(msg.value);
        emit BidPlaced(msg.sender, msg.value);

        if (previousBidder != address(0)) {
            (bool success, ) = payable(previousBidder).call{value: previousBid, gas: 30000}("");
            if (!success) {
                pendingReturns[previousBidder] += previousBid;
            }
        }
    }

    function endAuction() external nonReentrant {
        require(block.timestamp >= endTime, "Auction not ended yet");
        require(state == AuctionState.OPEN, "Already ended");
        state = AuctionState.ENDED;

        if (highestBidder != address(0)) {
            (bool success, ) = nftContract.call(
                abi.encodeWithSignature("safeTransferFrom(address,address,uint256)", address(this), highestBidder, tokenId)
            );
            require(success, "NFT Transfer failed");
            
            uint256 feeAmount = (uint256(highestBid) * feePercentage) / 10000;
            uint256 sellerAmount = highestBid - feeAmount;

            (bool paySellerSuccess, ) = payable(seller).call{value: sellerAmount}("");
            require(paySellerSuccess, "Transfer to seller failed");

            if (feeAmount > 0) {
                (bool payFeeSuccess, ) = payable(feeRecipient).call{value: feeAmount}("");
                require(payFeeSuccess, "Fee transfer failed");
            }
            emit AuctionEnded(highestBidder, highestBid, feeAmount);
        } else {
            (bool success, ) = nftContract.call(
                abi.encodeWithSignature("safeTransferFrom(address,address,uint256)", address(this), seller, tokenId)
            );
            require(success, "NFT Return failed");
            emit AuctionEnded(address(0), 0, 0);
        }
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingReturns[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Withdraw failed");
        emit Refunded(msg.sender, amount);
    }
}