// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPrivyLogical
 * @dev PrivyLogical contract interface
 */
interface IPrivyLogical {
    // Events
    event CallExecuted(address indexed to, uint256 value, bytes data, bool success);
    event BatchExecuted(uint256 indexed timestamp, Call[] calls);
    event GasSponsored(address indexed sponsor, address indexed wallet, uint256 gasUsed);

    // Structs
    struct Call {
        address to;
        uint256 value;
        bytes data;
    }

    function estimateGas(Call[] calldata calls) external;

    function executeSponsored(
        Call[] calldata calls,
        bytes calldata userSignature,
        bytes calldata adminSignature,
        address operator
    ) external payable returns (uint256 successfulCalls);

    // Utility functions
    function getUserTransactionHash(address wallet, Call[] calldata calls, uint256 nonce)
        external
        view
        returns (bytes32);
    function getUserMessageHash(bytes32 dataHash) external pure returns (bytes32);
    function getAdminTransactionHash(address wallet, Call[] calldata calls, uint256 operatorNonce)
        external
        view
        returns (bytes32);
    function getAdminMessageHash(bytes32 dataHash) external pure returns (bytes32);
}
