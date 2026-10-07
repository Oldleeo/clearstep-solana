export const SYSTEM = '11111111111111111111111111111111';
export const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const tokens = new Set([TOKEN, TOKEN2022]);
function integer(value) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw Error('Unsafe integer in RPC data. Import losslessly serialized JSON.');
  if (!/^\d+$/.test(String(value))) throw Error('Invalid unsigned amount in RPC data.');
  return BigInt(value);
}
export function amount(raw, decimals = 9) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw Error('Invalid decimals.');
  const n = BigInt(raw), sign = n < 0n ? '-' : '', s = (n < 0n ? -n : n).toString().padStart(decimals + 1, '0');
  if (!decimals) return sign + s;
  const fraction = s.slice(-decimals).replace(/0+$/, '');
  return sign + s.slice(0, -decimals) + (fraction ? '.' + fraction : '');
}
export function losslessParse(text) {
  // Quote integer lexemes before JSON.parse, without touching strings, floats, or exponents.
  let out = '', index = 0;
  while (index < text.length) {
    if (text[index] === '"') {
      const start = index++;
      while (index < text.length) { if (text[index] === '\\') index += 2; else if (text[index++] === '"') break; }
      out += text.slice(start, index);
    } else {
      const match = text.slice(index).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        const lexeme = match[0];
        out += /^-?\d+$/.test(lexeme) && !Number.isSafeInteger(Number(lexeme)) ? '"' + lexeme + '"' : lexeme;
        index += lexeme.length;
      } else out += text[index++];
    }
  }
  return JSON.parse(out);
}
export function explain(input, context = {}) {
  if (input?.error) throw Error('RPC error: ' + String(input.error.message || input.error.code));
  const tx = Object.hasOwn(input ?? {}, 'result') ? input.result : input;
  if (!tx) throw Error('Transaction not found at finalized commitment. Check the network or try later.');
  const message = tx.transaction?.message, meta = tx.meta;
  if (!message || !Array.isArray(message.accountKeys) || !message.accountKeys.length || !Array.isArray(message.instructions)) throw Error('Expected getTransaction JSON with jsonParsed encoding.');
  if (!meta || !Object.hasOwn(meta, 'err')) throw Error('Execution metadata is missing; cannot confirm an outcome.');
  let keys = message.accountKeys.map(k => typeof k === 'string' ? k : k.pubkey);
  if (message.accountKeys.every(k => typeof k === 'string')) keys = keys.concat(meta.loadedAddresses?.writable ?? [], meta.loadedAddresses?.readonly ?? []);
  if (keys.some(k => typeof k !== 'string')) throw Error('Invalid account keys.');
  const failed = meta.err !== null, actions = [], notes = [], changes = [];
  if (failed) notes.push('Instructions below were attempted. This transaction failed; instruction effects were rolled back. The network fee can still be charged.');
  if (!Array.isArray(meta.preBalances) || !Array.isArray(meta.postBalances) || meta.preBalances.length !== keys.length || meta.postBalances.length !== keys.length) throw Error('Account balance arrays do not match resolved account keys.');
  keys.forEach((account, i) => {
    const delta = integer(meta.postBalances[i]) - integer(meta.preBalances[i]);
    if (delta !== 0n) changes.push({account, asset: 'SOL', delta: amount(delta), rawDelta: String(delta), evidence: 'meta.preBalances['+i+'] → meta.postBalances['+i+']', kind: 'native'});
  });
  if (!Array.isArray(meta.preTokenBalances) || !Array.isArray(meta.postTokenBalances)) notes.push('Token balance metadata is unavailable. Token changes may be incomplete.');
  else {
    const balances = new Map();
    for (const [side, rows] of [['pre',meta.preTokenBalances], ['post',meta.postTokenBalances]]) for (const row of rows) {
      if (!Number.isInteger(row.accountIndex) || row.accountIndex < 0 || row.accountIndex >= keys.length || typeof row.mint !== 'string') throw Error('Invalid token balance account.');
      const id = row.accountIndex + ':' + row.mint;
      const value = balances.get(id) || {account: keys[row.accountIndex], mint: row.mint, index: row.accountIndex};
      if (value[side]) throw Error('Duplicate token balance metadata.');
      value[side] = row; balances.set(id, value);
    }
    for (const value of balances.values()) {
      const pre = value.pre, post = value.post, decimals = (post ?? pre).uiTokenAmount?.decimals;
      if (pre && post && pre.uiTokenAmount?.decimals !== post.uiTokenAmount?.decimals) throw Error('Conflicting token decimals.');
      const delta = (post ? integer(post.uiTokenAmount?.amount) : 0n) - (pre ? integer(pre.uiTokenAmount?.amount) : 0n);
      if (delta) changes.push({account: value.account, asset: value.mint, delta: amount(delta, decimals), rawDelta: String(delta), ownerBefore: pre?.owner ?? null, ownerAfter: post?.owner ?? null, kind: 'token', evidence: 'meta.preTokenBalances / postTokenBalances: accountIndex=' + value.index});
      if (pre?.owner && post?.owner && pre.owner !== post.owner) notes.push('Token account ' + value.account + ' changed owner metadata. Do not attribute its net balance change to a single wallet.');
    }
  }
  function instruction(ix, path) {
    const program = ix.programId ?? keys[ix.programIdIndex] ?? 'Unresolved program';
    const parsed = ix.parsed, type = parsed?.type, info = parsed?.info;
    const action = {path, program, type: type || 'opaque', title: 'Unexplained instruction', detail: 'This program instruction is outside the supported decoder. Its behavior is not assessed.', attention: 'unknown', attempted: failed, raw: ix};
    if (program === SYSTEM && type === 'transfer' && info) {
      action.title = 'Transfer SOL'; action.detail = amount(integer(info.lamports)) + ' SOL from ' + info.source + ' to ' + info.destination; action.attention = 'transfer';
    } else if (tokens.has(program) && ['transfer','transferChecked'].includes(type) && info) {
      action.title = 'Transfer tokens'; action.detail = (type === 'transferChecked' ? amount(integer(info.tokenAmount?.amount), info.tokenAmount?.decimals) + ' tokens of mint ' + info.mint : String(integer(info.amount)) + ' raw token units (decimals not supplied)') + ' from token account ' + info.source + ' to ' + info.destination; action.attention = 'transfer';
    } else if (tokens.has(program) && ['approve','approveChecked'].includes(type) && info) {
      action.title = 'Delegate token spending'; action.detail = 'Delegate ' + info.delegate + ' may spend up to ' + (type === 'approveChecked' ? amount(integer(info.tokenAmount?.amount), info.tokenAmount?.decimals) + ' tokens' : String(integer(info.amount)) + ' raw units') + ' from token account ' + info.source + '. This is a historical approval, not proof of the current allowance.'; action.attention = 'permission';
    } else if (tokens.has(program) && type === 'revoke' && info) {
      action.title = 'Revoke token delegate'; action.detail = 'Remove the delegate from token account ' + info.source + '. This historical action does not prove its current delegate state.'; action.attention = 'permission';
    } else if (tokens.has(program) && type === 'setAuthority' && info) {
      action.title = 'Change token authority'; action.detail = 'Set ' + info.authorityType + ' authority for ' + (info.account ?? info.mint ?? 'unresolved account') + ' to ' + (info.newAuthority ?? 'none') + '.'; action.attention = 'permission';
    }
    actions.push(action);
  }
  message.instructions.forEach((ix,i) => instruction(ix, 'transaction.message.instructions['+i+']'));
  for (const group of meta.innerInstructions ?? []) {
    if (!Array.isArray(group.instructions)) throw Error('Invalid inner instructions.');
    group.instructions.forEach((ix,j) => instruction(ix, 'meta.innerInstructions[parent='+group.index+'].instructions['+j+']'));
  }
  const fee = amount(integer(meta.fee));
  notes.unshift('Fee payer: '+keys[0]+'. Signature: '+(tx.transaction.signatures?.[0]??'not supplied')+'. Slot: '+String(tx.slot??'not supplied')+'.');
  const unknown = actions.filter(a => a.attention === 'unknown').length;
  if (unknown) notes.push(unknown + ' instruction(s) remain unexplained. Known inner transfers do not explain the enclosing program.');
  notes.push('Net balance changes include network fees, rent, account creation/closure, and transfers. They are not a profit calculation. No token price or USD value is assumed.');
  notes.push('Wrapped SOL token changes can overlap native account balance changes. Do not sum native and token rows blindly.');
  notes.push('No current token-account allowance query, pre-sign simulation, or security verdict is provided. Token-2022 extensions are not comprehensively decoded.');
  return {schema: 'clearstep.receipt.v1', source: context.source ?? 'Imported JSON (unverified source)', network: context.network ?? 'Not independently verified', signature: tx.transaction.signatures?.[0] ?? null, slot: String(tx.slot ?? ''), blockTime: tx.blockTime ?? null, outcome: failed ? 'Failed' : 'Succeeded', error: meta.err, fee, feePayer: keys[0], actions, changes, unknown, notes};
}
