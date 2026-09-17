// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
/// @notice Immutable STOP-prefixed bytecode; no owner or writable runtime.
contract PhilGenesisData {
    constructor(bytes memory data) {
        require(data.length > 0 && data.length <= 24000, "DATA_SIZE");
        bytes memory runtime = bytes.concat(hex"00", data);
        assembly ("memory-safe") { return(add(runtime, 32), mload(runtime)) }
    }
}
