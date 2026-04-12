// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PrivyAdmin} from "../src/PrivyAdmin.sol";
import {ERC1967Factory} from "../lib/solady/src/utils/ERC1967Factory.sol";

// Upgrade PrivyAdmin proxy to a new implementation (UUPS)
contract UpgradePrivyAdminScript is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address proxy = vm.envAddress("PRIVY_ADMIN_PROXY_ADDRESS");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");

        vm.startBroadcast(deployer);

        PrivyAdmin newImpl = new PrivyAdmin();
        ERC1967Factory(factoryAddr).upgradeAndCall(proxy, address(newImpl), "");

        vm.stopBroadcast();

        console.log("PRIVY_ADMIN_PROXY:", proxy);
        console.log("PRIVY_ADMIN_NEW_IMPL:", address(newImpl));
    }
}
