// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface ICreditToken {
    function mintCredit(address to, uint256 creditId, string calldata tokenURI_) external;
}

interface ICreditScore {
    function getScore(address wallet) external view returns (uint256);
}

contract CreditFactory is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");
    bytes32 public constant REPAYMENT_MANAGER_ROLE = keccak256("REPAYMENT_MANAGER_ROLE");

    enum PaymentSchedule {
        Bullet,
        Installments
    }

    struct CreditPosition {
        address borrower;
        uint256 principal;
        uint256 repaymentAmount;
        uint256 interestBps;
        uint64 dueDate;
        PaymentSchedule schedule;
        uint16 installmentCount;
        bytes32 borrowerIdentityHash;
        string metadataURI;
        bytes32 metadataHash;
        bool isPrivate;
        uint32 minimumScore;
        bool funded;
        bool defaulted;
        bool settled;
        bool collateralRequired;
        address collateralToken;
        uint256 collateralAmount;
        uint256 collateralValuationUSDC;
        uint16 maxLtvBps;
        uint64 fundedAt;
    }

    struct CreateCreditInput {
        uint256 principal;
        uint256 repaymentAmount;
        uint64 dueDate;
        PaymentSchedule schedule;
        uint16 installmentCount;
        bytes32 borrowerIdentityHash;
        string metadataURI;
        bytes32 metadataHash;
        bool isPrivate;
        uint32 minimumScore;
        bool collateralRequired;
        address collateralToken;
        uint256 collateralAmount;
        uint256 collateralValuationUSDC;
        uint16 maxLtvBps;
        string tokenURI;
    }

    uint256 public nextCreditId = 1;
    uint32 public platformMinScore;

    ICreditToken public immutable creditToken;
    ICreditScore public immutable creditScore;

    mapping(uint256 => CreditPosition) private credits;
    uint256[] private allCreditIds;

    event CreditCreated(
        uint256 indexed creditId,
        address indexed borrower,
        uint256 principal,
        uint256 repaymentAmount,
        uint64 dueDate,
        uint32 minimumScore,
        bool collateralRequired,
        bool isPrivate,
        bytes32 metadataHash
    );

    event CreditFunded(uint256 indexed creditId, uint64 fundedAt);
    event CreditDefaulted(uint256 indexed creditId, uint64 defaultedAt);
    event CreditSettled(uint256 indexed creditId, uint64 settledAt);
    event CollateralReleased(uint256 indexed creditId, address indexed to, uint256 amount);
    event CollateralSeized(uint256 indexed creditId, address indexed to, uint256 amount);

    error InvalidCreditTerms();
    error BorrowerScoreTooLow(uint256 borrowerScore, uint32 required);
    error CreditNotFound(uint256 creditId);
    error InvalidState(uint256 creditId);
    error InvalidCollateral();

    constructor(address tokenAddress, address scoreAddress, address admin, uint32 minimumBorrowerScore) {
        creditToken = ICreditToken(tokenAddress);
        creditScore = ICreditScore(scoreAddress);
        platformMinScore = minimumBorrowerScore;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function setPlatformMinScore(uint32 minScore) external onlyRole(DEFAULT_ADMIN_ROLE) {
        platformMinScore = minScore;
    }

    function createCredit(CreateCreditInput calldata input) external nonReentrant returns (uint256 creditId) {
        if (
            input.principal == 0 || input.repaymentAmount < input.principal || input.dueDate <= block.timestamp
                || input.borrowerIdentityHash == bytes32(0)
        ) {
            revert InvalidCreditTerms();
        }

        if (input.schedule == PaymentSchedule.Installments && input.installmentCount < 2) {
            revert InvalidCreditTerms();
        }

        uint256 borrowerScore = creditScore.getScore(msg.sender);
        uint32 requiredScore = platformMinScore > input.minimumScore ? platformMinScore : input.minimumScore;
        if (borrowerScore < requiredScore) {
            revert BorrowerScoreTooLow(borrowerScore, requiredScore);
        }

        if (input.collateralRequired) {
            if (
                input.collateralToken == address(0) || input.collateralAmount == 0 || input.collateralValuationUSDC == 0
                    || input.maxLtvBps == 0 || input.maxLtvBps > 10_000
                    || input.principal * 10_000 > input.collateralValuationUSDC * input.maxLtvBps
            ) {
                revert InvalidCollateral();
            }
            IERC20(input.collateralToken).safeTransferFrom(msg.sender, address(this), input.collateralAmount);
        }

        creditId = nextCreditId;
        unchecked {
            nextCreditId++;
        }

        uint256 interestBps = ((input.repaymentAmount - input.principal) * 10_000) / input.principal;

        credits[creditId] = CreditPosition({
            borrower: msg.sender,
            principal: input.principal,
            repaymentAmount: input.repaymentAmount,
            interestBps: interestBps,
            dueDate: input.dueDate,
            schedule: input.schedule,
            installmentCount: input.installmentCount,
            borrowerIdentityHash: input.borrowerIdentityHash,
            metadataURI: input.metadataURI,
            metadataHash: input.metadataHash,
            isPrivate: input.isPrivate,
            minimumScore: requiredScore,
            funded: false,
            defaulted: false,
            settled: false,
            collateralRequired: input.collateralRequired,
            collateralToken: input.collateralToken,
            collateralAmount: input.collateralAmount,
            collateralValuationUSDC: input.collateralValuationUSDC,
            maxLtvBps: input.maxLtvBps,
            fundedAt: 0
        });

        allCreditIds.push(creditId);
        creditToken.mintCredit(msg.sender, creditId, input.tokenURI);

        emit CreditCreated(
            creditId,
            msg.sender,
            input.principal,
            input.repaymentAmount,
            input.dueDate,
            requiredScore,
            input.collateralRequired,
            input.isPrivate,
            input.metadataHash
        );
    }

    function setFunded(uint256 creditId, uint64 fundedAt) external onlyRole(MARKETPLACE_ROLE) {
        CreditPosition storage c = credits[creditId];
        if (c.borrower == address(0)) revert CreditNotFound(creditId);
        if (c.funded || c.defaulted || c.settled) revert InvalidState(creditId);

        c.funded = true;
        c.fundedAt = fundedAt;

        emit CreditFunded(creditId, fundedAt);
    }

    function markDefault(uint256 creditId) external onlyRole(REPAYMENT_MANAGER_ROLE) {
        CreditPosition storage c = credits[creditId];
        if (c.borrower == address(0)) revert CreditNotFound(creditId);
        if (!c.funded || c.defaulted || c.settled) revert InvalidState(creditId);

        c.defaulted = true;

        emit CreditDefaulted(creditId, uint64(block.timestamp));
    }

    function markSettled(uint256 creditId) external onlyRole(REPAYMENT_MANAGER_ROLE) {
        CreditPosition storage c = credits[creditId];
        if (c.borrower == address(0)) revert CreditNotFound(creditId);
        if (!c.funded || c.defaulted || c.settled) revert InvalidState(creditId);

        c.settled = true;

        emit CreditSettled(creditId, uint64(block.timestamp));
    }

    function releaseCollateral(uint256 creditId, address to) external onlyRole(REPAYMENT_MANAGER_ROLE) {
        CreditPosition storage c = credits[creditId];
        if (c.borrower == address(0)) revert CreditNotFound(creditId);
        if (!c.collateralRequired || c.collateralAmount == 0) revert InvalidCollateral();

        uint256 amount = c.collateralAmount;
        c.collateralAmount = 0;
        IERC20(c.collateralToken).safeTransfer(to, amount);

        emit CollateralReleased(creditId, to, amount);
    }

    function seizeCollateral(uint256 creditId, address to) external onlyRole(REPAYMENT_MANAGER_ROLE) {
        CreditPosition storage c = credits[creditId];
        if (c.borrower == address(0)) revert CreditNotFound(creditId);
        if (!c.collateralRequired || c.collateralAmount == 0) revert InvalidCollateral();

        uint256 amount = c.collateralAmount;
        c.collateralAmount = 0;
        IERC20(c.collateralToken).safeTransfer(to, amount);

        emit CollateralSeized(creditId, to, amount);
    }

    function getCredit(uint256 creditId) external view returns (CreditPosition memory) {
        CreditPosition memory c = credits[creditId];
        if (c.borrower == address(0)) revert CreditNotFound(creditId);
        return c;
    }

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
        )
    {
        CreditPosition memory c = credits[creditId];
        if (c.borrower == address(0)) revert CreditNotFound(creditId);

        return (
            c.borrower,
            c.principal,
            c.repaymentAmount,
            c.dueDate,
            c.minimumScore,
            c.funded,
            c.defaulted,
            c.settled,
            c.collateralRequired,
            c.collateralToken,
            c.collateralAmount
        );
    }

    function getAllCreditIds() external view returns (uint256[] memory) {
        return allCreditIds;
    }
}
