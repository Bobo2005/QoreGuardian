// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPQCVerify
/// @notice Interface for QoreChain's native ML-DSA-87 verification precompile at 0x...0A01.
interface IPQCVerify {
    /// @notice Verifies a post-quantum ML-DSA-87 signature against a public key and message.
    /// @param pubkey Raw ML-DSA-87 public key bytes (2,592 bytes).
    /// @param signature Raw ML-DSA-87 signature bytes (4,627 bytes).
    /// @param message Arbitrary message bytes that were signed.
    /// @return valid True if the signature is valid for the given public key and message.
    function pqcVerify(
        bytes calldata pubkey,
        bytes calldata signature,
        bytes calldata message
    ) external view returns (bool valid);
}
