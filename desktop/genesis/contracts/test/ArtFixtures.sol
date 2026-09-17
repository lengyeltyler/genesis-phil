// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {PhilGenesisLZ4} from '../PhilGenesisLZ4.sol';
contract GenesisLZ4Fixture {
    function decode(bytes memory input,uint256 size) external pure returns(bytes memory){return PhilGenesisLZ4.decode(input,size);}
}
