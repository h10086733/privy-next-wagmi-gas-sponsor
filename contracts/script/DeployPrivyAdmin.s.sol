// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Factory} from "../lib/solady/src/utils/ERC1967Factory.sol";
import {PrivyAdmin} from "../src/PrivyAdmin.sol";

/// @title PrivyAdmin Deployment Script
/// @notice Deploy PrivyAdmin contract and add operators
contract DeployPrivyAdminScript is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");

        console.log("=== PrivyAdmin Deployment Script ===");
        console.log("Deployer address:", deployer);
        console.log("Factory address:", factoryAddr);

        vm.startBroadcast(deployer);

        // Deploy PrivyAdmin implementation and proxy
        ERC1967Factory factory = ERC1967Factory(factoryAddr);
        PrivyAdmin impl = new PrivyAdmin();
        bytes memory initData = abi.encodeWithSelector(PrivyAdmin.initialize.selector, deployer);
        address proxy = factory.deployDeterministicAndCall(
            address(impl), deployer, bytes32(uint256(uint160(deployer)) << 96), initData
        );

        console.log("PrivyAdmin implementation deployed at:", address(impl));
        console.log("PrivyAdmin proxy deployed at:", proxy);

        // Add operators from environment variables
        console.log("\n=== Adding Operators ===");
        PrivyAdmin privyAdmin = PrivyAdmin(proxy);

        // Read operators from environment variable
        // Format: OPERATORS_ADDRESSES="0x123...,0x456...,0x789..."
        try vm.envString("OPERATORS_ADDRESSES") returns (string memory operatorsStr) {
            if (bytes(operatorsStr).length > 0) {
                console.log("Found operators from environment:", operatorsStr);
                // Parse comma-separated addresses and add them
                string[] memory operatorStrings = vm.split(operatorsStr, ",");
                for (uint256 i = 0; i < operatorStrings.length; i++) {
                    address operatorAddr = vm.parseAddress(operatorStrings[i]);
                    if (operatorAddr != address(0)) {
                        privyAdmin.addOperator(operatorAddr);
                        console.log("Added operator", i + 1, ":", operatorAddr);
                    }
                }
            } else {
                console.log("No operators found in OPERATORS_ADDRESSES environment variable");
            }
        } catch {
            console.log("No OPERATORS_ADDRESSES environment variable found");
        }

        vm.stopBroadcast();

        console.log("\n=== Deployment Complete ===");
        console.log("PrivyAdmin Implementation:", address(impl));
        console.log("PrivyAdmin Proxy:", proxy);

        console.log("\nPlease save the following address to environment variables:");
        console.log("export PRIVY_ADMIN_PROXY_ADDRESS=", proxy);
    }
}
