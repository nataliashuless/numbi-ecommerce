import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(fs.readFileSync(new URL('../app/api/siigo/sync-stock/route.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function fixture({authHtml=false,failTable=null}={}) {
  const calls=[], writes=[], exports={}
  const db={from(table){return {
    select(){return this},limit(){return this},
    async maybeSingle(){return {data:{siigo_username:'fixture',siigo_access_key:'fixture'}}},
    async upsert(rows){writes.push({table,rows});return {error:table===failTable?{message:'fixture failure'}:null}},
  }}}
  vm.runInNewContext(source,{exports,console,Date,setTimeout,require(name){
    if(name==='next/server')return {NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}}
    if(name==='@/lib/auth-helpers')return {requireAuth:async()=>({}),getAdminClient:()=>db}
    throw new Error(name)
  },fetch:async(url,opts)=>{
    calls.push({url,opts})
    if(url==='https://api.siigo.com/auth')return authHtml?new Response('<!DOCTYPE html>',{status:502}):Response.json({access_token:'fixture-token'})
    if(url.endsWith('/v1/warehouses'))return Response.json([{id:27,name:'Principal'}])
    if(url.includes('/v1/products?'))return Response.json({results:[{id:'p',code:'P20',name:'Prueba',account_group:{id:339},warehouses:[{id:27,name:'Principal',quantity:12}]}]})
    throw new Error('Unexpected endpoint')
  }})
  return {run:()=>exports.POST(),calls,writes}
}
test('stock synchronization uses official Siigo auth and records success after saving stock',async()=>{
  const f=fixture();const r=await f.run();assert.equal(r.status,200)
  assert.equal(f.calls[0].url,'https://api.siigo.com/auth')
  assert.equal(f.calls[0].opts.headers['Partner-Id'],'shuless')
  assert.equal(f.writes.find(w=>w.table==='siigo_product_stock').rows[0].quantity,12)
  assert.equal(f.writes.at(-1).table,'siigo_stock_sync_state')
})
test('HTML authentication failure does not change stock or success timestamp',async()=>{
  const f=fixture({authHtml:true});const r=await f.run();assert.equal(r.status,500)
  assert.match(r.body.error,/502/);assert.equal(f.writes.length,0)
})
for(const table of ['siigo_warehouses','siigo_product_stock','siigo_stock_sync_state'])test(`write failure in ${table} is not reported as a successful sync`,async()=>{
  const f=fixture({failTable:table});const r=await f.run();assert.equal(r.status,500)
  assert.equal(f.writes.at(-1).table,table)
  assert.equal(r.body.synced_at,undefined)
})
