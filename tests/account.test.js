import test from 'node:test';
import assert from 'node:assert/strict';
import { PrivateAccount, emptyState, removeLegacyKeys, accountMessage, cleanState } from '../dist/account.js';
import { API_KEY } from '../dist/model.js';
import { MEMORY_AUTH_OPTIONS } from '../dist/account.js';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

test('the OAuth popup client (memory-only options) builds Google OAuth and never touches storage', async () => {
  const storageCalls=[];
  const storage={getItem(k){storageCalls.push(['get',k]);return null},setItem(k){storageCalls.push(['set',k])},removeItem(k){storageCalls.push(['remove',k])}};
  const context=vm.createContext({console,URL,Headers,Request,Response,AbortController,TextEncoder,TextDecoder,
    crypto:crypto.webcrypto,setTimeout,clearTimeout,setInterval,clearInterval,WebSocket:globalThis.WebSocket,
    fetch:async url=>{
      if(String(url).includes('/logout')) return new Response(null,{status:204});
      assert.match(String(url),/\/auth\/v1\/user$/);
      return new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',email:'test@example.invalid'}),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  vm.runInContext(fs.readFileSync(new URL('../dist/vendor/supabase-2.118.0.js',import.meta.url),'utf8'),context);
  const sdk=context.supabase.createClient('https://example.supabase.co','sb_publishable_synthetic',{auth:{...MEMORY_AUTH_OPTIONS,storage}});
  try {
    const oauth=await sdk.auth.signInWithOAuth({provider:'google',options:{redirectTo:'https://playnext.example/auth-callback.html',skipBrowserRedirect:true}});
    assert.equal(new URL(oauth.data.url).searchParams.get('provider'),'google');
    const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
    const token=part({alg:'HS256',typ:'JWT'})+'.'+part({exp:Math.floor(Date.now()/1000)+3600,sub:'00000000-0000-4000-8000-000000000001'})+'.'+Buffer.from('synthetic-signature').toString('base64url');
    const result=await sdk.auth.setSession({access_token:token,refresh_token:'synthetic-refresh'});
    assert.equal(result.error,null);assert.equal((await sdk.auth.getSession()).data.session.user.email,'test@example.invalid');
    await sdk.auth.signOut({scope:'local'});assert.equal((await sdk.auth.getSession()).data.session,null);
    assert.deepEqual(storageCalls,[]);
  } finally { await sdk.auth.stopAutoRefresh(); }
});

test('legacy keys are removed without ever reading their plaintext', () => {
  const removed=[];
  const storage={getItem(){throw Error('must not read secret')},removeItem(key){removed.push(key)}};
  removeLegacyKeys(storage,storage);
  assert.equal(removed.filter(key=>key===API_KEY).length,2);
});
test('saves serialize, use server revisions and freeze the state at click time', async () => {
  const calls=[]; let release;
  const gate=new Promise(r=>release=r);
  const account=new PrivateAccount({async rpc(name,args){
    if(name==='playnext_load') return {data:{revision:3,data:emptyState()}};
    calls.push(structuredClone(args));
    if(calls.length===1) await gate;
    return {data:args.p_revision+1};
  }});
  await account.open({id:'first'});
  const state=emptyState(); state.rawg_key='synthetic-1';
  const first=account.save(state); state.rawg_key='synthetic-2';
  const second=account.save(state); state.rawg_key='mutated-after-save';
  await Promise.resolve(); assert.equal(calls.length,1);
  release(); await Promise.all([first,second]);
  assert.deepEqual(calls.map(x=>x.p_revision),[3,4]);
  assert.deepEqual(calls.map(x=>x.p_state.rawg_key),['synthetic-1','synthetic-2']);
  assert.equal(account.revision,5); assert.equal(account.pending,0);
});
test('a conflict prevents queued writes and preserves the unsaved state for export', async () => {
  const conflict={code:'40001',message:'REVISION_CONFLICT'}; let calls=0;
  const account=new PrivateAccount({async rpc(name){return name==='playnext_load' ? {data:{revision:1,data:null}} : (calls++,{error:conflict})}});
  await account.open({id:'first'});
  const state=emptyState(); state.rawg_key='synthetic';
  await assert.rejects(account.save(state),e=>e===conflict);
  await assert.rejects(account.save(state),e=>e===conflict);
  await assert.rejects(account.retry(state),e=>e===conflict);
  assert.equal(calls,1); assert.equal(state.rawg_key,'synthetic');
  assert.match(accountMessage(conflict),/another tab/);
});
test('a network error can retry the current snapshot without overwriting a newer revision', async () => {
  let calls=0;
  const account=new PrivateAccount({async rpc(name,args){
    if(name==='playnext_load')return {data:{revision:0,data:null}};
    if(++calls===1) return {error:{code:'NETWORK'}};
    assert.equal(args.p_revision,0); assert.equal(args.p_state.filters.genre,'action');return {data:1};
  }});
  await account.open({id:'first'});
  await assert.rejects(account.save(emptyState()));
  const state=emptyState();state.filters.genre='action';await account.retry(state);
  assert.equal(account.error,null); assert.equal(account.revision,1);
});
test('switching accounts cancels queued writes before they can use another session', async () => {
  let calls=0, release;
  const gate=new Promise(r=>release=r);
  const account=new PrivateAccount({async rpc(name){
    if(name==='playnext_load') return {data:{revision:0,data:null}};
    calls++; await gate; return {data:1};
  }});
  await account.open({id:'first'});
  const first=account.save(emptyState()).catch(e=>e.message);
  const queued=account.save(emptyState()).catch(e=>e.message);
  await Promise.resolve(); account.reset(); release();
  assert.equal(await first,'SESSION_CHANGED');assert.equal(await queued,'SESSION_CHANGED');
  assert.equal(calls,1);assert.equal(account.user,null); assert.equal(account.revision,0);
});
test('untrusted stored game data is normalized before rendering', () => {
  const state=cleanState({history:[{status:'yes',game:{id:1,name:'Game',slug:'game',genres:['action',null],platforms:['pc'],rating:'broken',image:'javascript:alert(1)'}}],filters:{platforms:['pc','unknown'],genre:'action'}});
  assert.equal(state.history[0].game.rating,null);assert.equal(state.history[0].game.image,'');
  assert.deepEqual(state.history[0].game.genres,['action']);assert.deepEqual(state.filters.platforms,['pc']);
});
