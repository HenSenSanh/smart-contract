// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IAuctionLogic {
    function initialize(
        address _seller, 
        address _nftContract, 
        uint256 _tokenId, 
        uint96 _startingPrice, 
        uint40 _duration, 
        uint256 _minBidIncrement,
        address _feeRecipient,  // Tham số mới
        uint16 _feePercentage   // Tham số mới
    ) external;
}

contract AuctionFactory is Ownable {
    address public immutable auctionImplementation;
    address[] public allAuctions;
    mapping(address => address[]) public auctionsBySeller;

    // CẤU HÌNH HOA HỒNG
    address public feeRecipient;
    uint16 public feePercentage; // Basis Points (ví dụ: 500 = 5%)

    event AuctionCreated(address indexed cloneAddress, address indexed seller, address indexed nftContract, uint256 tokenId);
    event FeeConfigUpdated(address indexed newRecipient, uint16 newPercentage);

    constructor(address _implementation, address _initialFeeRecipient, uint16 _initialFeePercentage) 
        Ownable(msg.sender) 
    {
        require(_implementation != address(0), "Invalid implementation");
        auctionImplementation = _implementation;
        
        feeRecipient = _initialFeeRecipient;
        feePercentage = _initialFeePercentage;
    }

    // Hàm cập nhật cấu hình phí (Chỉ Admin mới có quyền gọi)
    function setFeeConfig(address _newRecipient, uint16 _newPercentage) external onlyOwner {
        require(_newRecipient != address(0), "Invalid address");
        require(_newPercentage <= 1000, "Fee too high (max 10%)"); // Giới hạn trần để bảo vệ người dùng
        
        feeRecipient = _newRecipient;
        feePercentage = _newPercentage;
        
        emit FeeConfigUpdated(_newRecipient, _newPercentage);
    }

    function createAuction(
        address _nftContract, 
        uint256 _tokenId, 
        uint96 _startingPrice, 
        uint40 _duration, 
        uint256 _minBidIncrement
    ) external returns (address) {
        address clone = Clones.clone(auctionImplementation);

        // Chuyển NFT từ người bán vào bản Clone
        IERC721(_nftContract).transferFrom(msg.sender, clone, _tokenId);

        // Khởi tạo bản Clone với thông số phí lấy từ Factory
        IAuctionLogic(clone).initialize(
            msg.sender, 
            _nftContract, 
            _tokenId, 
            _startingPrice, 
            _duration, 
            _minBidIncrement,
            feeRecipient,   // Truyền từ Factory sang
            feePercentage   // Truyền từ Factory sang
        );

        allAuctions.push(clone);
        auctionsBySeller[msg.sender].push(clone);
        
        emit AuctionCreated(clone, msg.sender, _nftContract, _tokenId);
        return clone;
    }

    function getAllAuctions() external view returns (address[] memory) {
        return allAuctions;
    }
}