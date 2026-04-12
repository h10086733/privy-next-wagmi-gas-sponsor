// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/console.sol";

import {ECDSA} from "../lib/solady/src/utils/ECDSA.sol";
import {ReentrancyGuard} from "../lib/solady/src/utils/ReentrancyGuard.sol";
import {Ownable} from "../lib/solady/src/auth/Ownable.sol";
import {Initializable} from "../lib/solady/src/utils/Initializable.sol";
import {UUPSUpgradeable} from "../lib/solady/src/utils/UUPSUpgradeable.sol";
import {Errors} from "./Errors.sol";
import {IPrivyAdmin} from "./interfaces/IPrivyAdmin.sol";

/**
 * @title PrivyAdmin
 * @dev Gas sponsorship contract management, focused on nonce management and admin signature verification
 *
 * Core functions:
 * 1. Nonce management - manages nonce for each wallet and admin
 * 2. Admin signature verification - verifies admin signatures for sponsorship confirmation
 *
 * Design principles:
 * - Users don't need pre-registration
 * - Auto-activation on first use
 * - User identity confirmation through signature verification
 */
contract PrivyAdmin is Initializable, UUPSUpgradeable, ReentrancyGuard, Ownable, IPrivyAdmin {
    using ECDSA for bytes32;

    // Structs - Call is defined in IPrivyAdmin interface

    // Storage structure
    mapping(address => uint256) public walletNonces; // Nonce for each wallet
    mapping(address => uint256) public operatorNonces; // Nonce for each operator
    mapping(address => bool) public operators; // Operator mapping
    address[] public operatorList; // Operator list
    // address public PRIVY_LOGICAL; // Logical contract address
    address public PRIVY_ADMIN_PROXY; // Admin proxy address

    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner) external initializer {
        _initializeOwner(_owner);
        PRIVY_ADMIN_PROXY = address(this);

        emit PrivyAdminInitialized(_owner);
    }

    // /**
    //  * @dev Set Logical contract address (owner only)
    //  * @param _privyLogical Logical contract address
    //  */
    // function setPrivyLogical(address _privyLogical) external onlyOwner {
    //     if (_privyLogical == address(0)) revert Errors.PrivyAdmin_InvalidLogicalAddress();
    //     PRIVY_LOGICAL = _privyLogical;
    // }

    // ============ Nonce Management ============

    /**
     * @dev Get wallet nonce
     * @param wallet Wallet address
     * @return Nonce value
     */
    function getWalletNonce(address wallet) external view returns (uint256) {
        return walletNonces[wallet];
    }

    /**
     * @dev Get operator nonce
     * @param operator Operator address
     * @return Operator nonce value
     */
    function getOperatorNonce(address operator) external view returns (uint256) {
        return operatorNonces[operator];
    }

    /**
     * @dev Check if wallet is activated
     * @param wallet Wallet address
     * @return Whether activated
     */
    function isWalletActive(address wallet) external view returns (bool) {
        return walletNonces[wallet] > 0;
    }

    /**
     * @dev Increment wallet nonce
     * @param wallet Wallet address
     */
    function incrementWalletNonce(address wallet) external onlyOwner {
        if (walletNonces[wallet] == 0) {
            walletNonces[wallet] = 1;
            emit WalletActivated(wallet);
        } else {
            walletNonces[wallet]++;
        }
    }

    /**
     * @dev Increment operator nonce
     * @param operator Operator address
     */
    function incrementOperatorNonce(address operator) external onlyOwner {
        if (!operators[operator]) revert Errors.PrivyAdmin_NotAnOperator();
        operatorNonces[operator]++;
        emit AdminNonceIncremented(operatorNonces[operator]);
    }

    // ============ Operator Management ============

    /**
     * @dev Add operator
     * @param operator Operator address
     */
    function addOperator(address operator) external onlyOwner {
        if (operator == address(0)) revert Errors.PrivyAdmin_InvalidOperatorAddress();
        if (operators[operator]) revert Errors.PrivyAdmin_OperatorAlreadyExists();

        operators[operator] = true;
        operatorList.push(operator);
        emit OperatorAdded(operator);
    }

    /**
     * @dev Remove operator
     * @param operator Operator address
     */
    function removeOperator(address operator) external onlyOwner {
        if (!operators[operator]) revert Errors.PrivyAdmin_OperatorDoesNotExist();

        operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    // ============ Admin Signature Verification ============

    /**
     * @dev Validate user signature and operator signature (verification only, no state update)
     * @param calls Transaction array
     * @param userSignature User signature
     * @param operatorSignature Operator signature
     * @param operator Operator address
     * @return walletNonce Current wallet nonce
     * @return operatorNonce Current operator nonce
     */
    function validate(
        Call[] calldata calls,
        bytes calldata userSignature,
        bytes calldata operatorSignature,
        address operator
    ) external view returns (uint256 walletNonce, uint256 operatorNonce) {
        address wallet = msg.sender;
        console.log("PrivyAdmin.validate - msg.sender:", wallet);

        // 1. Validate user signature (includes calls, nonce, chainId, etc.)
        if (!_validateUserSignature(wallet, calls, userSignature)) revert Errors.PrivyAdmin_InvalidUserSignature();

        // 2. Validate operator signature (includes calls, nonce, chainId, etc.)
        if (!_validateOperatorSignature(wallet, calls, operatorSignature, operator)) {
            revert Errors.PrivyAdmin_InvalidOperatorSignature();
        }

        // 3. Return current nonce values
        walletNonce = walletNonces[wallet];
        operatorNonce = operatorNonces[operator];
    }

    /**
     * @dev Get next wallet nonce (updates state)
     * @return Next nonce value
     */
    function nextWalletNonce() external returns (uint256) {
        address wallet = msg.sender;
        // Update wallet nonce
        if (walletNonces[wallet] == 0) {
            walletNonces[wallet] = 1;
            emit WalletActivated(wallet);
            return 1;
        } else {
            walletNonces[wallet]++;
            return walletNonces[wallet];
        }
    }

    /**
     * @dev Get next operator nonce (updates state)
     * @return Next nonce value
     */
    function nextOperatorNonce() external returns (uint256) {
        address operator = msg.sender;
        // Verify operator exists
        if (!operators[operator]) revert Errors.PrivyAdmin_NotAnOperator();

        // Update operator nonce
        operatorNonces[operator]++;
        emit AdminNonceIncremented(operatorNonces[operator]);
        return operatorNonces[operator];
    }

    /**
     * @dev Internal user signature validation
     * @param wallet Wallet address
     * @param calls Transaction array
     * @param signature User signature
     * @return Whether signature is valid
     */
    function _validateUserSignature(address wallet, Call[] calldata calls, bytes calldata signature)
        internal
        view
        returns (bool)
    {
        // Get current nonce
        uint256 currentNonce = walletNonces[wallet];

        // Generate user signature hash (includes calls, nonce, chainId, etc.)
        bytes32 userHash = keccak256(
            abi.encodePacked(
                wallet, // Wallet address
                abi.encode(calls), // Transaction array
                currentNonce, // Current nonce
                block.chainid, // Chain ID
                PRIVY_ADMIN_PROXY // Admin address (in EIP-7702 scenario, this is PrivyAdmin address)
            )
        );

        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userHash));

        // Validate user signature
        address signer = messageHash.recover(signature);
        return signer == wallet;
    }

    /**
     * @dev Internal operator signature validation
     * @param wallet Wallet address
     * @param calls Transaction array
     * @param operatorSignature Operator signature
     * @param operator Operator address
     * @return Whether signature is valid
     */
    function _validateOperatorSignature(
        address wallet,
        Call[] calldata calls,
        bytes calldata operatorSignature,
        address operator
    ) internal view returns (bool) {
        // Check if operator exists
        if (!operators[operator]) {
            return false;
        }

        // Get operator current nonce
        uint256 operatorNonce = operatorNonces[operator];

        // Generate operator signature hash (includes calls, nonce, chainId, etc.)
        bytes32 operatorHash = keccak256(
            abi.encodePacked(
                wallet,
                abi.encode(calls), // Transaction array
                operatorNonce,
                block.chainid, // Chain ID
                PRIVY_ADMIN_PROXY, // Admin address (in EIP-7702 scenario, this is PrivyAdmin address)
                "SPONSOR"
            )
        );
        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", operatorHash));
        address signer = messageHash.recover(operatorSignature);

        // Verify if signer is the specified operator
        return signer == operator;
    }

    function getOperatorSignature(Call[] calldata calls)
        external
        view
        returns (bytes32 operatorHash, bytes32 messageHash)
    {
        uint256 operatorNonce = operatorNonces[msg.sender];
        operatorHash = keccak256(
            abi.encodePacked(
                msg.sender,
                abi.encode(calls), // Transaction array
                operatorNonce,
                block.chainid, // Chain ID
                PRIVY_ADMIN_PROXY, // Admin address (in EIP-7702 scenario, this is PrivyAdmin address)
                "SPONSOR"
            )
        );

        messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", operatorHash));
    }

    // ============ UUPS Upgrade ============

    /**
     * @dev Authorize upgrade function
     * @param newImplementation New implementation contract address
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
