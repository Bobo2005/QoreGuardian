// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPQCVerify} from "./interfaces/IPQCVerify.sol";

interface IRecoveryVault {
    function depositFor(address account) external payable;
}

/// @title GuardianAccount
/// @notice Smart treasury account with hard on-chain spending caps, target allowlist,
///         and strict privilege separation between `owner` and `guardianAgent`.
///         The Guardian Agent can ONLY tighten defenses (`reduceLimits`, `freeze`,
///         `forceMoveToVault`) and can NEVER raise limits, unfreeze, edit the allowlist,
///         or execute arbitrary calls.
contract GuardianAccount {
    address public constant PQC_VERIFY_PRECOMPILE = 0x0000000000000000000000000000000000000a01;

    address public immutable OWNER;
    address public immutable RECOVERY_VAULT;
    bytes32 public immutable OWNER_PQC_KEY_HASH;
    address public guardianAgent;

    uint256 public perTxLimit;
    uint256 public dailyLimit;
    uint256 public spentToday;
    uint256 public lastResetTimestamp;
    uint256 public emergencyNonce;
    bool public isFrozen;

    mapping(address target => bool allowed) public allowlist;

    uint256 private _locked = 1;

    event Deposited(address indexed sender, uint256 amount);
    event Executed(address indexed target, uint256 value, bytes data);
    event LimitsUpdated(uint256 perTxLimit, uint256 dailyLimit);
    event LimitsReduced(address indexed caller, uint256 newPerTxLimit, uint256 newDailyLimit);
    event AllowlistUpdated(address indexed target, bool allowed);
    event GuardianAgentUpdated(address indexed previousGuardian, address indexed newGuardian);
    event Frozen(address indexed caller);
    event Unfrozen(address indexed caller);
    event EvacuatedToVault(address indexed caller, address indexed beneficiary, uint256 amount);
    event EmergencyEvacuated(
        address indexed caller,
        address indexed beneficiary,
        uint256 amount,
        uint256 nonce
    );

    error ZeroAddress();
    error ZeroPqcKeyHash();
    error NotOwner();
    error NotOwnerOrGuardian();
    error AccountFrozen();
    error TargetNotAllowlisted(address target);
    error ExceedsPerTxLimit(uint256 value, uint256 perTxLimit);
    error ExceedsDailyLimit(uint256 projectedSpend, uint256 dailyLimit);
    error CannotRaiseLimits();
    error InvalidLimits();
    error NothingToEvacuate();
    error InvalidPqcKey();
    error InvalidEvacuationMessage();
    error InvalidPQCSignature();
    error ExecutionFailed(bytes reason);
    error Reentrancy();

    modifier onlyOwner() {
        if (msg.sender != OWNER) revert NotOwner();
        _;
    }

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != OWNER && msg.sender != guardianAgent) revert NotOwnerOrGuardian();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(
        address owner_,
        address guardianAgent_,
        address recoveryVault_,
        bytes32 ownerPqcKeyHash_,
        uint256 perTxLimit_,
        uint256 dailyLimit_
    ) {
        if (owner_ == address(0) || guardianAgent_ == address(0) || recoveryVault_ == address(0)) {
            revert ZeroAddress();
        }
        if (ownerPqcKeyHash_ == bytes32(0)) revert ZeroPqcKeyHash();
        if (perTxLimit_ > dailyLimit_) revert InvalidLimits();

        OWNER = owner_;
        guardianAgent = guardianAgent_;
        RECOVERY_VAULT = recoveryVault_;
        OWNER_PQC_KEY_HASH = ownerPqcKeyHash_;
        perTxLimit = perTxLimit_;
        dailyLimit = dailyLimit_;
        lastResetTimestamp = block.timestamp;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Executes an allowlisted call within hard per-tx and daily limits.
    /// @dev Strictly `onlyOwner`. Never callable by `guardianAgent`.
    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external nonReentrant onlyOwner returns (bytes memory result) {
        if (isFrozen) revert AccountFrozen();
        if (target == address(0)) revert ZeroAddress();
        if (!allowlist[target]) revert TargetNotAllowlisted(target);

        // 24-hour daily window reset; minor validator timestamp skew is acceptable here.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= lastResetTimestamp + 1 days) {
            spentToday = 0;
            lastResetTimestamp = block.timestamp;
        }

        if (value > perTxLimit) revert ExceedsPerTxLimit(value, perTxLimit);
        uint256 projected = spentToday + value;
        if (projected > dailyLimit) revert ExceedsDailyLimit(projected, dailyLimit);

        spentToday = projected;
        emit Executed(target, value, data);

        // `target` is allowlisted and `value` is bounded by `perTxLimit`/`dailyLimit` above.
        // forge-lint: disable-next-line(arbitrary-send-eth,reentrancy-eth)
        (bool ok, bytes memory res) = target.call{value: value}(data);
        if (!ok) revert ExecutionFailed(res);
        return res;
    }

    /// @notice Tightens spending limits. Callable by `guardianAgent` or `OWNER`.
    function reduceLimits(uint256 newPerTx, uint256 newDaily) external onlyOwnerOrGuardian {
        if (newPerTx > perTxLimit || newDaily > dailyLimit) revert CannotRaiseLimits();
        if (newPerTx > newDaily) revert InvalidLimits();

        perTxLimit = newPerTx;
        dailyLimit = newDaily;
        emit LimitsReduced(msg.sender, newPerTx, newDaily);
    }

    /// @notice Freezes all `execute()` calls. Callable by `guardianAgent` or `OWNER`.
    function freeze() external onlyOwnerOrGuardian {
        isFrozen = true;
        emit Frozen(msg.sender);
    }

    /// @notice Freezes the account and evacuates 100% of native QOR to `RECOVERY_VAULT`
    ///         credited to `OWNER` (unlockable only via ML-DSA-87 in `RecoveryVault`).
    ///         Callable by `guardianAgent` or `OWNER`.
    function forceMoveToVault() external nonReentrant onlyOwnerOrGuardian {
        uint256 bal = address(this).balance;
        if (bal == 0) revert NothingToEvacuate();

        isFrozen = true;
        emit Frozen(msg.sender);
        emit EvacuatedToVault(msg.sender, OWNER, bal);

        // forge-lint: disable-next-line(reentrancy-eth)
        IRecoveryVault(RECOVERY_VAULT).depositFor{value: bal}(OWNER);
    }

    /// @notice Dead-Man's Switch: callable by ANYONE presenting a valid owner ML-DSA-87 signature
    ///         over `buildEmergencyEvacuateMessage(emergencyNonce)` to freeze and evacuate 100% of funds
    ///         to `RECOVERY_VAULT`, even if the off-chain AI agent is offline.
    function emergencyEvacuate(
        bytes calldata pqcPubKey,
        bytes calldata pqcSig,
        bytes calldata message
    ) external nonReentrant {
        uint256 bal = address(this).balance;
        if (bal == 0) revert NothingToEvacuate();
        if (keccak256(pqcPubKey) != OWNER_PQC_KEY_HASH) revert InvalidPqcKey();

        uint256 currentNonce = emergencyNonce;
        if (keccak256(message) != keccak256(buildEmergencyEvacuateMessage(currentNonce))) {
            revert InvalidEvacuationMessage();
        }

        bool valid = IPQCVerify(PQC_VERIFY_PRECOMPILE).pqcVerify(pqcPubKey, pqcSig, message);
        if (!valid) revert InvalidPQCSignature();

        emergencyNonce = currentNonce + 1;
        isFrozen = true;
        emit Frozen(msg.sender);
        emit EmergencyEvacuated(msg.sender, OWNER, bal, currentNonce);

        // `pqcVerify` authenticated the owner's ML-DSA-87 signature and state is updated before call.
        // forge-lint: disable-next-line(reentrancy-eth)
        IRecoveryVault(RECOVERY_VAULT).depositFor{value: bal}(OWNER);
    }

    /// @notice Canonical replay-protected message for `emergencyEvacuate`.
    function buildEmergencyEvacuateMessage(uint256 nonce) public view returns (bytes memory) {
        return abi.encode(block.chainid, address(this), "EMERGENCY_EVACUATE", nonce);
    }

    /// @notice Unfreezes the account. Strictly `onlyOwner` (never callable by `guardianAgent`).
    function unfreeze() external onlyOwner {
        isFrozen = false;
        emit Unfrozen(msg.sender);
    }

    /// @notice Sets new spending limits. Strictly `onlyOwner` (never callable by `guardianAgent`).
    function setLimits(uint256 newPerTx, uint256 newDaily) external onlyOwner {
        if (newPerTx > newDaily) revert InvalidLimits();
        perTxLimit = newPerTx;
        dailyLimit = newDaily;
        emit LimitsUpdated(newPerTx, newDaily);
    }

    /// @notice Updates target allowlist. Strictly `onlyOwner` (never callable by `guardianAgent`).
    function setAllowlist(address target, bool allowed) external onlyOwner {
        if (target == address(0)) revert ZeroAddress();
        allowlist[target] = allowed;
        emit AllowlistUpdated(target, allowed);
    }

    /// @notice Rotates the Guardian Agent address. Strictly `onlyOwner`.
    function setGuardianAgent(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        address prev = guardianAgent;
        guardianAgent = newGuardian;
        emit GuardianAgentUpdated(prev, newGuardian);
    }
}
