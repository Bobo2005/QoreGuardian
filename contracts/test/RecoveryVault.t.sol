// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
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

contract RecoveryVaultTest is Test {
    address internal constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;

    RecoveryVault internal vault;
    address internal owner = makeAddr("owner");
    address payable internal recipient = payable(makeAddr("recipient"));
    address internal attacker = makeAddr("attacker");

    bytes internal ownerPqcPubKey = hex"aabbccddeeff00112233445566778899";
    bytes32 internal ownerPqcKeyHash;

    uint256 internal constant INITIAL_DEPOSIT = 10 ether;

    function setUp() public {
        MockPQCVerify mock = new MockPQCVerify();
        vm.etch(PQC_VERIFY, address(mock).code);

        ownerPqcKeyHash = keccak256(ownerPqcPubKey);
        vault = new RecoveryVault();

        vm.prank(owner);
        vault.registerPqcKey(ownerPqcKeyHash);

        vm.deal(address(this), INITIAL_DEPOSIT);
        vault.depositFor{value: INITIAL_DEPOSIT}(owner);
    }

    function _signMockPqc(bytes memory pubkey, bytes memory message) internal pure returns (bytes memory) {
        return abi.encodePacked("VALID_MLDSA87", pubkey, message);
    }

    function test_RegisterPqcKeyCannotBeOverwrittenByClassicalKey() public {
        vm.prank(owner);
        vm.expectRevert(RecoveryVault.PqcKeyAlreadyRegistered.selector);
        vault.registerPqcKey(keccak256("attacker-key"));
    }

    function test_DepositForValidation() public {
        vm.deal(address(this), 1 ether);
        vm.expectRevert(RecoveryVault.ZeroAddress.selector);
        vault.depositFor{value: 1 ether}(address(0));

        vm.expectRevert(RecoveryVault.ZeroAmount.selector);
        vault.depositFor{value: 0}(owner);
    }

    function test_WithdrawWithPQCValidSignatureSucceeds() public {
        bytes memory message = vault.buildWithdrawMessage(owner, recipient, 4 ether, 0);
        bytes memory sig = _signMockPqc(ownerPqcPubKey, message);

        vm.expectEmit(true, true, false, true);
        emit RecoveryVault.WithdrawnWithPQC(owner, recipient, 4 ether, 0);

        vm.prank(owner);
        vault.withdrawWithPQC(recipient, 4 ether, 0, ownerPqcPubKey, sig);

        assertEq(recipient.balance, 4 ether);
        assertEq(vault.balances(owner), 6 ether);
        assertEq(vault.nonces(owner), 1);
    }

    function test_WithdrawWithPQCRejectsReplayedSignature() public {
        bytes memory message = vault.buildWithdrawMessage(owner, recipient, 4 ether, 0);
        bytes memory sig = _signMockPqc(ownerPqcPubKey, message);

        vm.startPrank(owner);
        vault.withdrawWithPQC(recipient, 4 ether, 0, ownerPqcPubKey, sig);

        // Replaying with nonce 0 fails InvalidNonce
        vm.expectRevert(RecoveryVault.InvalidNonce.selector);
        vault.withdrawWithPQC(recipient, 4 ether, 0, ownerPqcPubKey, sig);

        // Replaying old signature with nonce 1 fails InvalidPQCSignature
        vm.expectRevert(RecoveryVault.InvalidPQCSignature.selector);
        vault.withdrawWithPQC(recipient, 4 ether, 1, ownerPqcPubKey, sig);
        vm.stopPrank();
    }

    function test_WithdrawWithPQCRejectsInvalidKeyOrSignature() public {
        bytes memory message = vault.buildWithdrawMessage(owner, recipient, 4 ether, 0);
        bytes memory validSig = _signMockPqc(ownerPqcPubKey, message);

        vm.startPrank(owner);

        vm.expectRevert(RecoveryVault.InvalidPqcKey.selector);
        vault.withdrawWithPQC(recipient, 4 ether, 0, hex"112233", validSig);

        vm.expectRevert(RecoveryVault.InvalidPQCSignature.selector);
        vault.withdrawWithPQC(recipient, 4 ether, 0, ownerPqcPubKey, hex"deadbeef");

        // Changing recipient invalidates signature
        vm.expectRevert(RecoveryVault.InvalidPQCSignature.selector);
        vault.withdrawWithPQC(payable(attacker), 4 ether, 0, ownerPqcPubKey, validSig);

        // Changing amount invalidates signature
        vm.expectRevert(RecoveryVault.InvalidPQCSignature.selector);
        vault.withdrawWithPQC(recipient, 5 ether, 0, ownerPqcPubKey, validSig);

        vm.stopPrank();
    }

    function test_WithdrawWithPQCRejectsInsufficientBalance() public {
        bytes memory message = vault.buildWithdrawMessage(owner, recipient, 11 ether, 0);
        bytes memory sig = _signMockPqc(ownerPqcPubKey, message);

        vm.prank(owner);
        vm.expectRevert(RecoveryVault.InsufficientBalance.selector);
        vault.withdrawWithPQC(recipient, 11 ether, 0, ownerPqcPubKey, sig);
    }

    function testFuzz_WithdrawWithPQCRejectsArbitraryInvalidSignatures(
        bytes calldata badSig,
        uint256 amount
    ) public {
        amount = bound(amount, 1, INITIAL_DEPOSIT);
        bytes memory message = vault.buildWithdrawMessage(owner, recipient, amount, 0);
        bytes memory expectedValidSig = _signMockPqc(ownerPqcPubKey, message);
        vm.assume(keccak256(badSig) != keccak256(expectedValidSig));

        vm.prank(owner);
        vm.expectRevert(RecoveryVault.InvalidPQCSignature.selector);
        vault.withdrawWithPQC(recipient, amount, 0, ownerPqcPubKey, badSig);
    }
}
