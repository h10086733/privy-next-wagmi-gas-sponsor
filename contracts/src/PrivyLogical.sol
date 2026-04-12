// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "../lib/solady/src/utils/ECDSA.sol";
import {Errors} from "./Errors.sol";
import {IPrivyLogical} from "./interfaces/IPrivyLogical.sol";

/**
 * @title PrivyLogical
 * @dev EIP-7702 gas sponsorship contract logic, responsible for gas estimation and transaction execution
 *
 * Core responsibilities:
 * 1. Gas estimation functionality
 * 2. Execute sponsored transactions
 * 3. Interact with PrivyAdmin for validation
 * 4. Support EIP-7702 delegation mechanism
 */
contract PrivyLogical is IPrivyLogical {
    using ECDSA for bytes32;

    address public immutable PRIVY_ADMIN;

    // Events (CallExecuted, BatchExecuted, and GasSponsored are defined in IPrivyLogical)
    event CallFailed(address indexed to, bytes data, bytes returnData);

    // Structs (Call is defined in IPrivyLogical)

    constructor(address privyAdmin) {
        if (privyAdmin == address(0)) revert Errors.PrivyLogical_InvalidAdminAddress();
        PRIVY_ADMIN = privyAdmin;
    }

    // ============ Gas Estimation Functionality ============

    // Custom errors for gas estimation
    error GasEstimationFailed(uint256 gasUsed, uint256 failedCallIndex);
    error GasEstimationSuccess(uint256 totalGasUsed);

    /**
     * @dev Estimate gas required to execute transactions
     * @param calls Array of transactions to execute
     * @notice Always reverts with gas information via GasEstimationSuccess or GasEstimationFailed
     */
    function estimateGas(Call[] calldata calls) external {
        uint256 gasStart = gasleft();

        for (uint256 i = 0; i < calls.length; i++) {
            // Use call to execute transactions for accurate gas estimation
            (bool success,) = calls[i].to.call(calls[i].data);

            if (!success) {
                // If call fails, calculate gas used and revert with gas information
                uint256 gasUsed = gasStart - gasleft();
                revert GasEstimationFailed(gasUsed, i);
            }
        }

        // Calculate total gas consumed and revert with the information
        uint256 gasEnd = gasleft();
        uint256 totalGasUsed = gasStart - gasEnd;
        revert GasEstimationSuccess(totalGasUsed);
    }

    // ============ Sponsored Execution Functionality ============

    /**
     * @dev Execute sponsored transaction - core sponsorship functionality
     * @param calls Array of transactions to execute
     * @param userSignature User signature (authorize transaction)
     * @param operatorSignature Admin signature (confirm sponsorship)
     * @param operator Operator address
     * @return successfulCalls Number of successfully executed transactions
     */
    function executeSponsored(
        Call[] calldata calls,
        bytes calldata userSignature,
        bytes calldata operatorSignature,
        address operator
    ) external payable returns (uint256 successfulCalls) {
        if (PRIVY_ADMIN == address(0)) revert Errors.PrivyLogical_InvalidAdminAddress();

        (bool success,) = PRIVY_ADMIN.staticcall(
            abi.encodeWithSignature(
                "validate((address,uint256,bytes)[],bytes,bytes,address)",
                calls,
                userSignature,
                operatorSignature,
                operator
            )
        );
        if (!success) revert Errors.PrivyLogical_ValidationFailed();

        (bool walletNextSuccess,) = PRIVY_ADMIN.call(abi.encodeWithSignature("nextWalletNonce()"));
        if (!walletNextSuccess) revert Errors.PrivyLogical_WalletNextNonceFailed();

        // 3. Execute transaction
        successfulCalls = _executeBatch(calls);

        emit BatchExecuted(block.timestamp, calls);
    }

    // ============ Internal Functions ============

    /**
     * @dev Execute batch transactions
     * @param calls Transaction array
     * @return successfulCalls Number of successfully executed transactions
     */
    function _executeBatch(Call[] calldata calls) internal returns (uint256 successfulCalls) {
        successfulCalls = 0;

        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory returnData) = calls[i].to.call{value: calls[i].value}(calls[i].data);

            if (success && _shouldValidateBooleanReturn(calls[i].data)) {
                success = _isBooleanReturnSuccess(returnData);
            }

            if (success) {
                successfulCalls++;
            } else {
                emit CallFailed(calls[i].to, calls[i].data, returnData);
                emit CallExecuted(calls[i].to, calls[i].value, calls[i].data, success);
                continue;
            }

            emit CallExecuted(calls[i].to, calls[i].value, calls[i].data, success);
        }
    }

    function _shouldValidateBooleanReturn(bytes calldata data) internal pure returns (bool shouldValidate) {
        if (data.length < 4) return false;

        bytes4 selector = bytes4(data[:4]);
        return selector == 0xa9059cbb || selector == 0x23b872dd || selector == 0x095ea7b3;
    }

    function _isBooleanReturnSuccess(bytes memory returnData) internal pure returns (bool) {
        if (returnData.length == 0) return true;
        if (returnData.length != 32) return false;
        return abi.decode(returnData, (bool));
    }

    // ============ Utility Functions ============

    /**
     * @dev Get user transaction hash (matches PrivyAdmin validation logic)
     * @param wallet Wallet address
     * @param calls Transaction array
     * @param nonce Transaction nonce
     * @return hash Transaction hash
     */
    function getUserTransactionHash(address wallet, Call[] calldata calls, uint256 nonce)
        external
        view
        returns (bytes32 hash)
    {
        return keccak256(
            abi.encodePacked(
                wallet, // Wallet address
                abi.encode(calls), // Transaction array (完整编码)
                nonce, // Transaction nonce
                block.chainid, // Chain ID
                PRIVY_ADMIN // Admin address
            )
        );
    }

    /**
     * @dev Get user message hash
     * @param dataHash Data hash
     * @return hash Ethereum signed message hash
     */
    function getUserMessageHash(bytes32 dataHash) external pure returns (bytes32 hash) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", dataHash));
    }

    /**
     * @dev Get admin transaction hash (matches PrivyAdmin validation logic)
     * @param wallet Wallet address
     * @param calls Transaction array
     * @param operatorNonce Operator nonce
     * @return hash Transaction hash
     */
    function getAdminTransactionHash(address wallet, Call[] calldata calls, uint256 operatorNonce)
        external
        view
        returns (bytes32 hash)
    {
        return keccak256(
            abi.encodePacked(
                wallet, // Wallet address
                abi.encode(calls), // Transaction array (完整编码)
                operatorNonce, // Operator nonce
                block.chainid, // Chain ID
                PRIVY_ADMIN, // Admin address (使用合约内部的 PRIVY_ADMIN)
                "SPONSOR" // Sponsor identifier
            )
        );
    }

    /**
     * @dev Get admin message hash
     * @param dataHash Data hash
     * @return hash Ethereum signed message hash
     */
    function getAdminMessageHash(bytes32 dataHash) external pure returns (bytes32 hash) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", dataHash));
    }

    // Allow contract to receive ETH
    receive() external payable {}
    fallback() external payable {}

    // ============ Token Receiver Support ============
    // Required for EIP-7702 delegated accounts to receive NFTs via safeTransfer/safeMint

    /// @dev ERC721 receiver callback. Returns the selector to confirm the transfer.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector; // 0x150b7a02
    }

    /// @dev ERC1155 single transfer receiver callback. Returns the selector to confirm the transfer.
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector; // 0xf23a6e61
    }

    /// @dev ERC1155 batch transfer receiver callback. Returns the selector to confirm the transfer.
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector; // 0xbc197c81
    }
}
