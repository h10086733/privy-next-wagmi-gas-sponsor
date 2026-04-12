// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Errors
 * @dev Custom errors for PrivyGasPay contracts
 */
library Errors {
    // VaultPortal errors
    error VaultPortal_InvalidAdminAddress();
    error VaultPortal_OnlyAdminCanCall();
    error VaultPortal_OnlyEmergencyAdminCanCall();
    error VaultPortal_InvalidEmergencyAdminAddress();
    error VaultPortal_InvalidInVaultAddress();
    error VaultPortal_InvalidOutVaultAddress();
    error VaultPortal_InvalidFactoryAddress();
    error VaultPortal_InvalidDelegateAddress();
    error VaultPortal_InvalidFeeRecipientAddress();
    error VaultPortal_InvalidTokenAddress();
    error VaultPortal_InvalidToAddress();
    error VaultPortal_OnlyDelegateCanCall();
    error VaultPortal_ContractPaused();
    error VaultPortal_TransferFailed();
    error VaultPortal_TokenAlreadySupported();
    error VaultPortal_TokenNotSupported();
    error VaultPortal_AmountMustBeGreaterThanZero();
    error VaultPortal_ArrayLengthMismatch();
    error VaultPortal_InVaultAlreadyDeployed();
    error VaultPortal_OutVaultAlreadyDeployed();
    error VaultPortal_InVaultNotDeployed();
    error VaultPortal_OutVaultNotDeployed();
    error VaultPortal_EmptyArrays();
    error VaultPortal_InsufficientBalance();
    error VaultPortal_InvalidMintVaultAddress();
    error VaultPortal_MintVaultAlreadyDeployed();
    error VaultPortal_MintVaultNotDeployed();
    error VaultPortal_InvalidPASSContractAddress();
    error VaultPortal_PASSContractNotSet();
    error VaultPortal_MintPassFailed();

    // Vault errors (generic)
    error Vault_InvalidTokenAddress();
    error Vault_InvalidToAddress();
    error Vault_AmountMustBeGreaterThanZero();
    error Vault_InsufficientContractBalance();
    error Vault_TransferFailed();
    error Vault_InvalidVaultPortalAddress();
    error Vault_OnlyVaultPortalCanCall();

    // PrivyAdmin errors
    error PrivyAdmin_InvalidOwnerAddress();
    error PrivyAdmin_InvalidOperatorAddress();
    error PrivyAdmin_OperatorAlreadyExists();
    error PrivyAdmin_OperatorDoesNotExist();
    error PrivyAdmin_InvalidSignature();
    error PrivyAdmin_InvalidNonce();
    error PrivyAdmin_InvalidCallData();
    error PrivyAdmin_InvalidWalletAddress();
    error PrivyAdmin_InvalidAdminAddress();
    error PrivyAdmin_InvalidLogicalAddress();
    error PrivyAdmin_OnlyOwnerCanCall();
    error PrivyAdmin_OnlyOperatorCanCall();
    error PrivyAdmin_OnlyAdminCanCall();
    error PrivyAdmin_WalletNotActive();
    error PrivyAdmin_InvalidCallLength();
    error PrivyAdmin_InvalidCallTarget();
    error PrivyAdmin_InvalidCallValue();
    error PrivyAdmin_InvalidCallDataLength();
    error PrivyAdmin_NotAnOperator();
    error PrivyAdmin_InvalidUserSignature();
    error PrivyAdmin_InvalidOperatorSignature();

    // PrivyLogical errors
    error PrivyLogical_InvalidAdminAddress();
    error PrivyLogical_InvalidWalletAddress();
    error PrivyLogical_InvalidCallData();
    error PrivyLogical_InvalidSignature();
    error PrivyLogical_InvalidNonce();
    error PrivyLogical_OnlyAdminCanCall();
    error PrivyLogical_InvalidCallLength();
    error PrivyLogical_InvalidCallTarget();
    error PrivyLogical_InvalidCallValue();
    error PrivyLogical_InvalidCallDataLength();
    error PrivyLogical_InvalidOperatorAddress();
    error PrivyLogical_InvalidAdminSignature();
    error PrivyLogical_InvalidUserSignature();
    error PrivyLogical_InvalidOperatorSignature();
    error PrivyLogical_InvalidSponsorSignature();
    error PrivyLogical_ValidationFailed();
    error PrivyLogical_WalletNextNonceFailed();

    // MockVault errors
    error MockVault_InsufficientBalance();
    error MockVault_InvalidAmount();
    error MockVault_TransferFailed();
}
