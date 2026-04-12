// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPrivyAdmin
 * @dev PrivyAdmin contract interface - simplified nonce management and admin signature verification
 */
interface IPrivyAdmin {
    // Structs
    struct Call {
        address to;
        uint256 value;
        bytes data;
    }
    // Events

    event WalletActivated(address indexed wallet);
    event AdminNonceIncremented(uint256 newNonce);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event PrivyAdminInitialized(address indexed owner);
    // Nonce management

    function getWalletNonce(address wallet) external view returns (uint256);
    function getOperatorNonce(address operator) external view returns (uint256);
    function incrementWalletNonce(address wallet) external;
    function incrementOperatorNonce(address operator) external;

    // Operator management
    function addOperator(address operator) external;
    function removeOperator(address operator) external;
    function operators(address operator) external view returns (bool);

    // Signature verification
    function validate(
        Call[] calldata calls,
        bytes calldata userSignature,
        bytes calldata operatorSignature,
        address operator
    ) external view returns (uint256 walletNonce, uint256 operatorNonce);

    function nextWalletNonce() external returns (uint256);
    function nextOperatorNonce() external returns (uint256);

    // Configuration
    // function setPrivyLogical(address _privyLogical) external;
}
