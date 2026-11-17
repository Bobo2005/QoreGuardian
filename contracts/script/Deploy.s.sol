// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {RecoveryVault} from "../src/RecoveryVault.sol";
import {GuardianAccount} from "../src/GuardianAccount.sol";

/// @title Deploy
/// @notice Deploys RecoveryVault and GuardianAccount to QoreChain Testnet (qorechain-diana),
///         registers the owner's ML-DSA-87 public key hash on RecoveryVault, and funds
///         GuardianAccount with initial testnet QOR.
contract Deploy is Script {
    function run() external returns (RecoveryVault vault, GuardianAccount guardianAccount) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 ownerKey = vm.envOr("OWNER_PRIVATE_KEY", deployerKey);
        uint256 guardianKey = vm.envUint("GUARDIAN_PRIVATE_KEY");

        address deployer = vm.addr(deployerKey);
        address owner = vm.addr(ownerKey);
        address guardianAgent = vm.addr(guardianKey);
        bytes32 ownerPqcKeyHash = vm.envBytes32("OWNER_PQC_PUBKEY_HASH");

        uint256 perTxLimit = vm.envOr("PER_TX_LIMIT_WEI", uint256(0.5 ether));
        uint256 dailyLimit = vm.envOr("DAILY_LIMIT_WEI", uint256(2 ether));
        uint256 initialFund = vm.envOr("GUARDIAN_INITIAL_FUND_WEI", uint256(0.1 ether));

        console2.log("Deployer:", deployer);
        console2.log("Owner:", owner);
        console2.log("Guardian Agent:", guardianAgent);

        vm.startBroadcast(deployerKey);

        vault = new RecoveryVault();
        guardianAccount = new GuardianAccount(
            owner,
            guardianAgent,
            address(vault),
            ownerPqcKeyHash,
            perTxLimit,
            dailyLimit
        );

        if (initialFund > 0) {
            (bool ok, ) = payable(address(guardianAccount)).call{value: initialFund}("");
            require(ok, "Initial funding failed");
        }

        vm.stopBroadcast();

        // Register owner's ML-DSA-87 public key hash on RecoveryVault so PQC withdrawals work out of the box.
        if (vault.registeredOwnerPqcKeyHash(owner) == bytes32(0)) {
            vm.startBroadcast(ownerKey);
            vault.registerPqcKey(ownerPqcKeyHash);
            vm.stopBroadcast();
        }

        console2.log("RecoveryVault deployed at:", address(vault));
        console2.log("GuardianAccount deployed at:", address(guardianAccount));
        console2.log("GuardianAccount balance (wei):", address(guardianAccount).balance);
    }
}
