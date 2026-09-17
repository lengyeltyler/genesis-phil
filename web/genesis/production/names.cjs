"use strict";
const {randomInt}=require('node:crypto');
const codec=require('../runtime/names-codec.cjs');
function randomNameId(){return BigInt(randomInt(100)<30?randomInt(1,161):randomInt(161,Number(codec.NAME_COUNT)+1));}
module.exports={...codec,randomNameId};
