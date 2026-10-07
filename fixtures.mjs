import {SYSTEM, TOKEN} from './parser.mjs';
const A = '11111111111111111111111111111112', B = '11111111111111111111111111111113', C = '11111111111111111111111111111114';
const skeleton = () => ({slot: 1, blockTime: null, transaction: {signatures: [], message: {accountKeys: [{pubkey:A,signer:true},{pubkey:B,signer:false},{pubkey:C,signer:false}],instructions: []}},meta: {err:null,fee:5000, preBalances:[1000000000,0,0],postBalances:[999995000,0,0],preTokenBalances:[],postTokenBalances:[],innerInstructions:[]}});
export function fixture(name) {
  const tx = skeleton();
  if (name === 'transfer') {
    tx.meta.postBalances = [899995000,100000000,0];
    tx.transaction.message.instructions.push({programId:SYSTEM,parsed:{type:'transfer',info:{source:A,destination:B,lamports:100000000}}});
  } else if (name === 'permission') {
    tx.transaction.message.instructions.push({programId:TOKEN,parsed:{type:'approveChecked',info:{source:B,owner:A,delegate:C,mint:'DemoMintNotARealAsset',tokenAmount:{amount:'9007199254740993001',decimals:9}}}});
    tx.transaction.message.instructions.push({programId:'DemoOpaqueProgram',data:'not-decoded',accounts:[A,B]});
  } else if (name === 'failed') {
    tx.meta.err = {InstructionError:[0,'InsufficientFunds']};
    tx.transaction.message.instructions.push({programId:SYSTEM,parsed:{type:'transfer',info:{source:A,destination:B,lamports:2000000000}}});
  } else throw Error('Unknown fixture');
  return tx;
}
