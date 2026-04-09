// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract CreditToken is ERC721URIStorage, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    error CreditAlreadyExists(uint256 creditId);

    event CreditTokenMinted(uint256 indexed creditId, address indexed to, string tokenURI);

    constructor(address admin) ERC721("Arc Credit Position", "aCREDIT") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mintCredit(address to, uint256 creditId, string calldata tokenURI_) external onlyRole(MINTER_ROLE) {
        if (_exists(creditId)) revert CreditAlreadyExists(creditId);
        _safeMint(to, creditId);
        _setTokenURI(creditId, tokenURI_);

        emit CreditTokenMinted(creditId, to, tokenURI_);
    }

    function setTokenURI(uint256 creditId, string calldata tokenURI_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setTokenURI(creditId, tokenURI_);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
