// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {MockERC20} from "../src/mock/MockERC20.sol";

/// @title ERC1967Factory deployment script
/// @notice Deploy ERC1967Factory for proxy management
contract DeployFactoryScript is Script {
    address public deployer;

    function setUp() public {
        deployer = vm.envAddress("DEPLOYER_ADDRESS");
    }

    function run() public {
        console.log("Deployer address:", deployer);
        console.log("Deployer balance:", deployer.balance);

        vm.startBroadcast(deployer);

        // Deploy ERC1967Factory
        console.log("\n=== Deploying ERC1967Factory ===");
        ERC1967Factory factory = new ERC1967Factory();
        // ERC1967Factory factory = ERC1967Factory(vm.envAddress("FACTORY_ADDRESS"));
        console.log("ERC1967Factory deployed at:", address(factory));

        // MockERC20 mockERC20 = new MockERC20();
        // console.log("MockERC20 deployed at:", address(mockERC20));

        vm.stopBroadcast();

        console.log("\n=== Factory Deployment Complete ===");
        console.log("Factory:", address(factory));
        console.log("\nNext steps:");
        console.log("1. Set FACTORY_ADDRESS environment variable to:", address(factory));
        console.log("2. Run 'make deploy-staking' or 'make deploy-earning'");
    }
}
