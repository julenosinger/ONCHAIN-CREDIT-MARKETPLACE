// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IFactoryReadWrite {
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

    function markDefault(uint256 creditId) external;
    function markSettled(uint256 creditId) external;
    function seizeCollateral(uint256 creditId, address to) external;
    function releaseCollateral(uint256 creditId, address to) external;
}

interface IScore {
    function recordRepayment(address borrower, bool success) external;
    function recordDefault(address borrower) external;
}

contract RepaymentManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");

    struct RepaymentState {
        uint256 totalRepaid;
        uint64 activatedAt;
        bool active;
        bool defaulted;
        bool settled;
    }

    IERC20 public immutable usdc;
    IFactoryReadWrite public immutable factory;
    IERC721 public immutable creditToken;
    IScore public immutable creditScore;

    uint64 public immutable defaultGracePeriod;

    mapping(uint256 => RepaymentState) public repaymentStates;

    event RepaymentMade(
        uint256 indexed creditId,
        address indexed borrower,
        address indexed currentHolder,
        uint256 amountUSDC,
        uint256 totalRepaid,
        uint256 remainingAmount
    );

    event CreditActivated(uint256 indexed creditId, address indexed firstInvestor, uint64 activatedAt);
    event CreditDefaultTriggered(uint256 indexed creditId, address indexed borrower, uint64 timestamp);

    error InvalidState(uint256 creditId);
    error UnauthorizedBorrower(uint256 creditId);
    error AmountOutOfRange(uint256 amount);

    constructor(
        address usdcAddress,
        address factoryAddress,
        address tokenAddress,
        address scoreAddress,
        address admin,
        uint64 gracePeriodSeconds
    ) {
        usdc = IERC20(usdcAddress);
        factory = IFactoryReadWrite(factoryAddress);
        creditToken = IERC721(tokenAddress);
        creditScore = IScore(scoreAddress);
        defaultGracePeriod = gracePeriodSeconds;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function activateCredit(uint256 creditId, address firstInvestor) external onlyRole(MARKETPLACE_ROLE) {
        RepaymentState storage s = repaymentStates[creditId];
        if (s.active || s.defaulted || s.settled) revert InvalidState(creditId);

        s.active = true;
        s.activatedAt = uint64(block.timestamp);

        emit CreditActivated(creditId, firstInvestor, s.activatedAt);
    }

    function repay(uint256 creditId, uint256 amountUSDC) external nonReentrant {
        (
            address borrower,
            ,
            uint256 repaymentAmount,
            uint64 dueDate,
            ,
            bool funded,
            bool defaulted,
            bool settled,
            bool collateralRequired,
            ,

        ) = factory.getCreditSummary(creditId);

        RepaymentState storage s = repaymentStates[creditId];

        if (!funded || !s.active || defaulted || settled || s.defaulted || s.settled) revert InvalidState(creditId);
        if (borrower != msg.sender) revert UnauthorizedBorrower(creditId);

        uint256 remaining = repaymentAmount - s.totalRepaid;
        if (amountUSDC == 0 || amountUSDC > remaining) revert AmountOutOfRange(amountUSDC);

        address receiver = creditToken.ownerOf(creditId);

        usdc.safeTransferFrom(msg.sender, address(this), amountUSDC);
        usdc.safeTransfer(receiver, amountUSDC);

        s.totalRepaid += amountUSDC;
        uint256 newRemaining = repaymentAmount - s.totalRepaid;

        emit RepaymentMade(creditId, msg.sender, receiver, amountUSDC, s.totalRepaid, newRemaining);

        if (s.totalRepaid == repaymentAmount) {
            s.settled = true;
            s.active = false;
            factory.markSettled(creditId);
            if (collateralRequired) {
                factory.releaseCollateral(creditId, borrower);
            }

            bool onTime = block.timestamp <= dueDate;
            creditScore.recordRepayment(borrower, onTime);
        }
    }

    function triggerDefault(uint256 creditId) external nonReentrant {
        (
            address borrower,
            ,
            uint256 repaymentAmount,
            uint64 dueDate,
            ,
            bool funded,
            bool defaulted,
            bool settled,
            bool collateralRequired,
            ,

        ) = factory.getCreditSummary(creditId);

        RepaymentState storage s = repaymentStates[creditId];
        if (!funded || !s.active || defaulted || settled || s.defaulted || s.settled) revert InvalidState(creditId);
        if (block.timestamp <= dueDate + defaultGracePeriod) revert InvalidState(creditId);
        if (s.totalRepaid >= repaymentAmount) revert InvalidState(creditId);

        s.defaulted = true;
        s.active = false;
        factory.markDefault(creditId);

        address currentHolder = creditToken.ownerOf(creditId);
        if (collateralRequired) {
            factory.seizeCollateral(creditId, currentHolder);
        }

        creditScore.recordDefault(borrower);

        emit CreditDefaultTriggered(creditId, borrower, uint64(block.timestamp));
    }
}
