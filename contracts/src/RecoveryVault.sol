// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPQCVerify} from "./interfaces/IPQCVerify.sol";

/// @title RecoveryVault
/// @notice Post-quantum recovery vault for QoreGuardian.
///         Evacuated funds can ONLY be withdrawn with a valid ML-DSA-87 signature
///         verified on-chain via QoreChain's pqcVerify precompile (0x...0A01).
///         There are zero classical (ECDSA / secp256k1) withdrawal paths.
contract RecoveryVault {
    address public constant PQC_VERIFY_PRECOMPILE = 0x0000000000000000000000000000000000000a01;

    mapping(address account => uint256 balance) public balances;
    mapping(address account => bytes32 pqcKeyHash) public registeredOwnerPqcKeyHash;
    mapping(address account => uint256 nonce) public nonces;

    uint256 private _locked = 1;

    event PqcKeyRegistered(address indexed account, bytes32 indexed pqcKeyHash);
    event Deposited(address indexed account, address indexed sender, uint256 amount);
    event WithdrawnWithPQC(
        address indexed account,
        address indexed recipient,
        uint256 amount,
        uint256 nonce
    );

    error ZeroAddress();
    error ZeroAmount();
    error ZeroPqcKeyHash();
    error PqcKeyAlreadyRegistered();
    error PqcKeyNotRegistered();
    error InvalidPqcKey();
    error InvalidNonce();
    error InsufficientBalance();
    error InvalidPQCSignature();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    /// @notice Registers the caller's ML-DSA-87 public key hash (keccak256(pqcPubKey)).
    ///         Once set, it cannot be overwritten by a classical key.
    function registerPqcKey(bytes32 pqcKeyHash) external {
        if (pqcKeyHash == bytes32(0)) revert ZeroPqcKeyHash();
        if (registeredOwnerPqcKeyHash[msg.sender] != bytes32(0)) revert PqcKeyAlreadyRegistered();

        registeredOwnerPqcKeyHash[msg.sender] = pqcKeyHash;
        emit PqcKeyRegistered(msg.sender, pqcKeyHash);
    }

    /// @notice Deposits evacuated native QOR on behalf of a protected account.
    function depositFor(address account) external payable {
        if (account == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();

        balances[account] += msg.value;
        emit Deposited(account, msg.sender, msg.value);
    }

    /// @notice Withdraws funds from the caller's vault balance using a fresh ML-DSA-87 signature.
    /// @param recipient Destination address to receive the withdrawn QOR.
    /// @param amount Amount of QOR (in wei) to withdraw.
    /// @param nonce Replay-protection nonce matching `nonces[msg.sender]`.
    /// @param pqcPubKey Raw ML-DSA-87 public key bytes (must hash to `registeredOwnerPqcKeyHash[msg.sender]`).
    /// @param pqcSig Raw ML-DSA-87 signature over `abi.encode(block.chainid, address(this), msg.sender, recipient, amount, nonce)`.
    function withdrawWithPQC(
        address payable recipient,
        uint256 amount,
        uint256 nonce,
        bytes calldata pqcPubKey,
        bytes calldata pqcSig
    ) external nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        bytes32 expectedHash = registeredOwnerPqcKeyHash[msg.sender];
        if (expectedHash == bytes32(0)) revert PqcKeyNotRegistered();
        if (keccak256(pqcPubKey) != expectedHash) revert InvalidPqcKey();

        uint256 currentNonce = nonces[msg.sender];
        if (nonce != currentNonce) revert InvalidNonce();

        uint256 currentBalance = balances[msg.sender];
        if (currentBalance < amount) revert InsufficientBalance();

        bytes memory message = buildWithdrawMessage(msg.sender, recipient, amount, nonce);
        bool valid = IPQCVerify(PQC_VERIFY_PRECOMPILE).pqcVerify(pqcPubKey, pqcSig, message);
        if (!valid) revert InvalidPQCSignature();

        nonces[msg.sender] = currentNonce + 1;
        balances[msg.sender] = currentBalance - amount;
        emit WithdrawnWithPQC(msg.sender, recipient, amount, nonce);

        // `recipient` and `amount` are authenticated by the ML-DSA-87 signature above,
        // and all state updates + `nonReentrant` lock occur before this external call.
        // forge-lint: disable-next-line(arbitrary-send-eth,reentrancy-eth)
        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Builds the canonical replay-protected message bytes that must be signed by ML-DSA-87.
    function buildWithdrawMessage(
        address account,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) public view returns (bytes memory) {
        return abi.encode(block.chainid, address(this), account, recipient, amount, nonce);
    }
}
