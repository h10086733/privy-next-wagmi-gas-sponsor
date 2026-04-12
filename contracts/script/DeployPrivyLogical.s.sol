// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PrivyLogical} from "../src/PrivyLogical.sol";
import {CREATE3} from "../lib/solady/src/utils/CREATE3.sol";

// Deploy PrivyLogical and set into PrivyAdmin with minimal output
contract DeployPrivyLogicalScript is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address privyAdminProxy = vm.envAddress("PRIVY_ADMIN_PROXY_ADDRESS");

        string memory saltLabel = "PrivyLogicalVersion-5";
        try vm.envString("PRIVY_LOGICAL_SALT") returns (string memory envSaltLabel) {
            if (bytes(envSaltLabel).length > 0) {
                saltLabel = envSaltLabel;
            }
        } catch {}

        bytes32 salt = keccak256(bytes(saltLabel));

        vm.startBroadcast(deployer);

        bytes memory initCode = abi.encodePacked(type(PrivyLogical).creationCode, abi.encode(privyAdminProxy));
        address logicalAddr = CREATE3.deployDeterministic(initCode, salt);
        address deployedPrivyAdmin = PrivyLogical(payable(logicalAddr)).PRIVY_ADMIN();
        require(deployedPrivyAdmin == privyAdminProxy, "PrivyLogical admin mismatch");

        vm.stopBroadcast();

        console.log("PRIVY_LOGICAL_SALT_LABEL:", saltLabel);
        console.log("PRIVY_LOGICAL:", logicalAddr);
        console.log("PRIVY_ADMIN_PROXY:", privyAdminProxy);
        console.log("PRIVY_LOGICAL.PRIVY_ADMIN:", deployedPrivyAdmin);
    }
}
