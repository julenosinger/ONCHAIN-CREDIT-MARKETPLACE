// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract CreditScore is AccessControl {
    bytes32 public constant SCORER_ROLE = keccak256("SCORER_ROLE");
    bytes32 public constant REPAYMENT_MANAGER_ROLE = keccak256("REPAYMENT_MANAGER_ROLE");

    struct WalletMetrics {
        uint32 txFrequency; // tx/dia * 100
        uint32 defiInteractionCount;
        uint32 successfulRepayments;
        uint32 defaults;
        uint32 avgGasUsed;
        uint64 measuredAt;
    }

    mapping(address => WalletMetrics) public metrics;
    mapping(address => uint256) public score;

    event ScoreUpdated(
        address indexed wallet,
        uint256 score,
        WalletMetrics metrics,
        string evidenceURI,
        bytes32 evidenceHash
    );

    event RepaymentPerformanceUpdated(address indexed borrower, uint32 successfulRepayments, uint32 defaults, uint256 score);

    constructor(address admin, address scorer) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SCORER_ROLE, scorer);
    }

    function getScore(address wallet) external view returns (uint256) {
        return score[wallet];
    }

    function computeScore(WalletMetrics memory m) public pure returns (uint256) {
        // Escala final: 0 - 1000
        uint256 base = 300;
        uint256 txComponent = _min(uint256(m.txFrequency) * 4, 220);
        uint256 defiComponent = _min(uint256(m.defiInteractionCount) * 6, 180);
        uint256 repaymentComponent = _min(uint256(m.successfulRepayments) * 35, 280);

        uint256 defaultPenalty = _min(uint256(m.defaults) * 120, 420);
        uint256 gasPenalty = m.avgGasUsed > 350_000 ? _min((uint256(m.avgGasUsed) - 350_000) / 1_000, 80) : 0;

        uint256 raw = base + txComponent + defiComponent + repaymentComponent;
        if (defaultPenalty + gasPenalty >= raw) return 0;

        uint256 capped = raw - defaultPenalty - gasPenalty;
        if (capped > 1000) return 1000;
        return capped;
    }

    function updateFromMetrics(
        address wallet,
        WalletMetrics calldata newMetrics,
        string calldata evidenceURI,
        bytes32 evidenceHash
    ) external onlyRole(SCORER_ROLE) {
        metrics[wallet] = newMetrics;
        uint256 s = computeScore(newMetrics);
        score[wallet] = s;

        emit ScoreUpdated(wallet, s, newMetrics, evidenceURI, evidenceHash);
    }

    function recordRepayment(address borrower, bool success) external onlyRole(REPAYMENT_MANAGER_ROLE) {
        WalletMetrics storage m = metrics[borrower];
        if (success) {
            m.successfulRepayments += 1;
        }

        uint256 s = computeScore(m);
        score[borrower] = s;

        emit RepaymentPerformanceUpdated(borrower, m.successfulRepayments, m.defaults, s);
    }

    function recordDefault(address borrower) external onlyRole(REPAYMENT_MANAGER_ROLE) {
        WalletMetrics storage m = metrics[borrower];
        m.defaults += 1;

        uint256 s = computeScore(m);
        score[borrower] = s;

        emit RepaymentPerformanceUpdated(borrower, m.successfulRepayments, m.defaults, s);
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
