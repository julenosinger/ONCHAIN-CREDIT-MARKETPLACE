// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IFactory {
    function getCreditSummary(uint256 creditId)
        external
        view
        returns (
            address borrower,
            uint256 principal,
            uint256 repaymentAmount,
            uint64 dueDate,
            uint32 minimumScore,
            bool funded,
            bool defaulted,
            bool settled,
            bool collateralRequired,
            address collateralToken,
            uint256 collateralAmount
        );

    function setFunded(uint256 creditId, uint64 fundedAt) external;
}

interface IRepaymentManager {
    function activateCredit(uint256 creditId, address firstInvestor) external;
}

contract Marketplace is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Listing {
        address seller;
        uint256 priceUSDC;
        uint64 expiresAt;
        bool primary;
        bool active;
    }

    IERC20 public immutable usdc;
    IFactory public immutable factory;
    IERC721 public immutable token;
    IRepaymentManager public immutable repaymentManager;

    mapping(uint256 => Listing) public listings;

    event CreditListed(uint256 indexed creditId, address indexed seller, uint256 priceUSDC, bool primary, uint64 expiresAt);
    event ListingCancelled(uint256 indexed creditId, address indexed seller);
    event CreditFunded(uint256 indexed creditId, address indexed borrower, address indexed investor, uint256 amountUSDC);
    event SecondaryTrade(uint256 indexed creditId, address indexed seller, address indexed buyer, uint256 amountUSDC);

    error InvalidListing(uint256 creditId);
    error Unauthorized();
    error Expired(uint256 creditId);

    constructor(address usdcAddress, address factoryAddress, address tokenAddress, address repaymentAddress, address admin) {
        usdc = IERC20(usdcAddress);
        factory = IFactory(factoryAddress);
        token = IERC721(tokenAddress);
        repaymentManager = IRepaymentManager(repaymentAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function listPrimary(uint256 creditId, uint256 priceUSDC, uint64 expiresAt) external nonReentrant {
        (
            address borrower,
            uint256 principal,
            ,
            ,
            ,
            bool funded,
            bool defaulted,
            bool settled,
            ,
            ,

        ) = factory.getCreditSummary(creditId);

        if (token.ownerOf(creditId) != msg.sender || borrower != msg.sender) revert Unauthorized();
        if (funded || defaulted || settled || priceUSDC == 0 || priceUSDC > principal * 2) revert InvalidListing(creditId);

        listings[creditId] = Listing({
            seller: msg.sender,
            priceUSDC: priceUSDC,
            expiresAt: expiresAt,
            primary: true,
            active: true
        });

        emit CreditListed(creditId, msg.sender, priceUSDC, true, expiresAt);
    }

    function listSecondary(uint256 creditId, uint256 priceUSDC, uint64 expiresAt) external nonReentrant {
        (
            ,
            ,
            ,
            ,
            ,
            bool funded,
            bool defaulted,
            bool settled,
            ,
            ,

        ) = factory.getCreditSummary(creditId);

        if (token.ownerOf(creditId) != msg.sender) revert Unauthorized();
        if (!funded || defaulted || settled || priceUSDC == 0) revert InvalidListing(creditId);

        listings[creditId] = Listing({
            seller: msg.sender,
            priceUSDC: priceUSDC,
            expiresAt: expiresAt,
            primary: false,
            active: true
        });

        emit CreditListed(creditId, msg.sender, priceUSDC, false, expiresAt);
    }

    function cancelListing(uint256 creditId) external {
        Listing storage l = listings[creditId];
        if (!l.active) revert InvalidListing(creditId);
        if (l.seller != msg.sender && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert Unauthorized();

        l.active = false;
        emit ListingCancelled(creditId, l.seller);
    }

    function buy(uint256 creditId) external nonReentrant {
        Listing storage l = listings[creditId];
        if (!l.active) revert InvalidListing(creditId);
        if (l.expiresAt != 0 && l.expiresAt < block.timestamp) revert Expired(creditId);

        (
            address borrower,
            ,
            ,
            ,
            ,
            bool funded,
            bool defaulted,
            bool settled,
            ,
            ,

        ) = factory.getCreditSummary(creditId);

        if (defaulted || settled) revert InvalidListing(creditId);

        l.active = false;

        usdc.safeTransferFrom(msg.sender, l.seller, l.priceUSDC);
        token.safeTransferFrom(l.seller, msg.sender, creditId);

        if (l.primary) {
            if (funded) revert InvalidListing(creditId);
            factory.setFunded(creditId, uint64(block.timestamp));
            repaymentManager.activateCredit(creditId, msg.sender);
            emit CreditFunded(creditId, borrower, msg.sender, l.priceUSDC);
        } else {
            emit SecondaryTrade(creditId, l.seller, msg.sender, l.priceUSDC);
        }
    }
}
