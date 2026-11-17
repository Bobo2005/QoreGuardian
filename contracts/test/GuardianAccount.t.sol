// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GuardianAccount} from "../src/GuardianAccount.sol";
import {RecoveryVault} from "../src/RecoveryVault.sol";

contract MockPQCVerify {
    function pqcVerify(
        bytes calldata pubkey,
        bytes calldata signature,
        bytes calldata message
    ) external pure returns (bool) {
        return
            signature.length > 0 &&
            keccak256(signature) == keccak256(abi.encodePacked("VALID_MLDSA87", pubkey, message));
    }
}

contract ReceiverTarget {
    uint256 public totalReceived;

    receive() external payable {
        totalReceived += msg.value;
    }
}

contract GuardianAccountTest is Test {
    address internal constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;

    RecoveryVault internal vault;
    GuardianAccount internal guardianAccount;
    ReceiverTarget internal target;
    ReceiverTarget internal nonAllowlistedTarget;

    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("guardianAgent");
    address internal attacker = makeAddr("attacker");
    address internal relayer = makeAddr("relayer");

    bytes internal ownerPqcPubKey = hex"aabbccddeeff00112233445566778899";
    bytes32 internal ownerPqcKeyHash;

    uint256 internal constant INITIAL_PER_TX = 2 ether;
    uint256 internal constant INITIAL_DAILY = 5 ether;
    uint256 internal constant INITIAL_BALANCE = 20 ether;

    function setUp() public {
        MockPQCVerify mock = new MockPQCVerify();
        vm.etch(PQC_VERIFY, address(mock).code);

        ownerPqcKeyHash = keccak256(ownerPqcPubKey);
        vault = new RecoveryVault();
        guardianAccount = new GuardianAccount(
            owner,
            agent,
            address(vault),
            ownerPqcKeyHash,
            INITIAL_PER_TX,
            INITIAL_DAILY
        );

        target = new ReceiverTarget();
        nonAllowlistedTarget = new ReceiverTarget();

        vm.prank(owner);
        guardianAccount.setAllowlist(address(target), true);

        vm.deal(address(guardianAccount), INITIAL_BALANCE);
    }

    function _signMockPqc(bytes memory pubkey, bytes memory message) internal pure returns (bytes memory) {
        return abi.encodePacked("VALID_MLDSA87", pubkey, message);
    }

    function test_ExecuteWithinLimitsSucceeds() public {
        vm.prank(owner);
        guardianAccount.execute(address(target), 1.5 ether, "");

        assertEq(address(target).balance, 1.5 ether);
        assertEq(guardianAccount.spentToday(), 1.5 ether);
    }

    function test_ExecuteRevertsIfNotAllowlisted() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                GuardianAccount.TargetNotAllowlisted.selector,
                address(nonAllowlistedTarget)
            )
        );
        guardianAccount.execute(address(nonAllowlistedTarget), 1 ether, "");
    }

    function test_ExecuteRevertsIfExceedsPerTxLimit() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                GuardianAccount.ExceedsPerTxLimit.selector,
                2.5 ether,
                INITIAL_PER_TX
            )
        );
        guardianAccount.execute(address(target), 2.5 ether, "");
    }

    function test_ExecuteRevertsIfExceedsDailyLimitAndResetsNextDay() public {
        vm.startPrank(owner);
        guardianAccount.execute(address(target), 2 ether, "");
        guardianAccount.execute(address(target), 2 ether, "");

        vm.expectRevert(
            abi.encodeWithSelector(
                GuardianAccount.ExceedsDailyLimit.selector,
                6 ether,
                INITIAL_DAILY
            )
        );
        guardianAccount.execute(address(target), 2 ether, "");

        vm.warp(block.timestamp + 1 days);
        guardianAccount.execute(address(target), 2 ether, "");
        vm.stopPrank();

        assertEq(guardianAccount.spentToday(), 2 ether);
        assertEq(address(target).balance, 6 ether);
    }

    function test_GuardianCannotRaiseLimitsUnfreezeEditAllowlistOrExecute() public {
        vm.startPrank(agent);

        vm.expectRevert(GuardianAccount.CannotRaiseLimits.selector);
        guardianAccount.reduceLimits(3 ether, 5 ether);

        vm.expectRevert(GuardianAccount.CannotRaiseLimits.selector);
        guardianAccount.reduceLimits(2 ether, 6 ether);

        vm.expectRevert(GuardianAccount.NotOwner.selector);
        guardianAccount.unfreeze();

        vm.expectRevert(GuardianAccount.NotOwner.selector);
        guardianAccount.setLimits(10 ether, 20 ether);

        vm.expectRevert(GuardianAccount.NotOwner.selector);
        guardianAccount.setAllowlist(attacker, true);

        vm.expectRevert(GuardianAccount.NotOwner.selector);
        guardianAccount.setGuardianAgent(attacker);

        vm.expectRevert(GuardianAccount.NotOwner.selector);
        guardianAccount.execute(address(target), 1 ether, "");

        vm.stopPrank();
    }

    function test_UnauthorizedCallerCannotTriggerAgentActions() public {
        vm.startPrank(attacker);

        vm.expectRevert(GuardianAccount.NotOwnerOrGuardian.selector);
        guardianAccount.reduceLimits(0.5 ether, 1 ether);

        vm.expectRevert(GuardianAccount.NotOwnerOrGuardian.selector);
        guardianAccount.freeze();

        vm.expectRevert(GuardianAccount.NotOwnerOrGuardian.selector);
        guardianAccount.forceMoveToVault();

        vm.stopPrank();
    }

    function test_GuardianCanReduceLimitsAndFreeze() public {
        vm.startPrank(agent);
        guardianAccount.reduceLimits(0.5 ether, 1 ether);
        assertEq(guardianAccount.perTxLimit(), 0.5 ether);
        assertEq(guardianAccount.dailyLimit(), 1 ether);

        guardianAccount.freeze();
        assertTrue(guardianAccount.isFrozen());
        vm.stopPrank();

        vm.prank(owner);
        vm.expectRevert(GuardianAccount.AccountFrozen.selector);
        guardianAccount.execute(address(target), 0.1 ether, "");

        vm.prank(owner);
        guardianAccount.unfreeze();
        assertFalse(guardianAccount.isFrozen());
    }

    function test_ForceMoveToVaultFreezesAndEvacuates100Percent() public {
        vm.prank(agent);
        guardianAccount.forceMoveToVault();

        assertTrue(guardianAccount.isFrozen());
        assertEq(address(guardianAccount).balance, 0);
        assertEq(vault.balances(owner), INITIAL_BALANCE);

        vm.prank(owner);
        vm.expectRevert(GuardianAccount.AccountFrozen.selector);
        guardianAccount.execute(address(target), 0.1 ether, "");
    }

    function test_EmergencyEvacuateWorksWhenAgentOffline() public {
        bytes memory message = guardianAccount.buildEmergencyEvacuateMessage(0);
        bytes memory sig = _signMockPqc(ownerPqcPubKey, message);

        vm.expectEmit(true, true, false, true);
        emit GuardianAccount.EmergencyEvacuated(relayer, owner, INITIAL_BALANCE, 0);

        vm.prank(relayer);
        guardianAccount.emergencyEvacuate(ownerPqcPubKey, sig, message);

        assertTrue(guardianAccount.isFrozen());
        assertEq(address(guardianAccount).balance, 0);
        assertEq(vault.balances(owner), INITIAL_BALANCE);
        assertEq(guardianAccount.emergencyNonce(), 1);

        // Re-fund and verify replaying nonce 0 fails
        vm.deal(address(guardianAccount), 1 ether);
        vm.prank(relayer);
        vm.expectRevert(GuardianAccount.InvalidEvacuationMessage.selector);
        guardianAccount.emergencyEvacuate(ownerPqcPubKey, sig, message);
    }

    function test_EmergencyEvacuateRejectsInvalidKeyOrSig() public {
        bytes memory message = guardianAccount.buildEmergencyEvacuateMessage(0);
        bytes memory badPubKey = hex"11223344";
        bytes memory validSig = _signMockPqc(ownerPqcPubKey, message);

        vm.prank(relayer);
        vm.expectRevert(GuardianAccount.InvalidPqcKey.selector);
        guardianAccount.emergencyEvacuate(badPubKey, validSig, message);

        vm.prank(relayer);
        vm.expectRevert(GuardianAccount.InvalidPQCSignature.selector);
        guardianAccount.emergencyEvacuate(ownerPqcPubKey, hex"deadbeef", message);
    }

    function testFuzz_ExecuteRespectsPerTxAndDailyLimits(uint256 amount) public {
        amount = bound(amount, 0, INITIAL_BALANCE);

        vm.prank(owner);
        if (amount > INITIAL_PER_TX) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    GuardianAccount.ExceedsPerTxLimit.selector,
                    amount,
                    INITIAL_PER_TX
                )
            );
            guardianAccount.execute(address(target), amount, "");
        } else {
            guardianAccount.execute(address(target), amount, "");
            assertEq(guardianAccount.spentToday(), amount);
            assertEq(address(target).balance, amount);
        }
    }
}
