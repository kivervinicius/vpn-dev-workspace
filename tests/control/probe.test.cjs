"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {classify,runProbe}=require("../../apps/control-plane/lib/probe.cjs");
test("provider acceptance requires structured nonempty text event and zero exit",()=>{
 assert.equal(classify(['{"type":"text","part":{"text":"OK"}}'],0).status,"accepted");
 assert.equal(classify(['{"type":"text","part":{"text":"OK"}}'],1).status,"unverified");
 assert.equal(classify(['{"type":"text","part":{"text":"Quota exceeded"}}'],0).status,"unverified");
 assert.deepEqual(classify(['{"type":"error","error":{"name":"FreeUsageLimitError"}}'],1),{status:"rejected",reason:"free_tier_limit"});
 assert.equal(classify(['{"type":"error","error":{"message":"free_tier_limit"}}'],1).status,"unverified");
 assert.equal(classify(['{"type":"text","part":{"text":"OK"}}','{"type":"error","error":{}}'],0).status,"unverified");
});
test("probe refuses without explicit consent, then performs exactly one run",async()=>{
 let calls=[];
 const runner=async(_,args)=>{
  calls.push(args);
  if(args[0]==="--version")return {lines:["2.1.3"],code:0};
  if(args[0]==="run"&&args[1]==="--help")return {lines:["--standalone --archived --format --model --agent"],code:0};
  return {lines:['{"type":"text","part":{"text":"OK"}}'],code:0};
 };
 await assert.rejects(runProbe("opencode/test-free",{runner,allowOutsideForTest:true,noPersistence:true,egressReader:async()=> "198.51.100.30"}),/consent_required/);
 const result=await runProbe("opencode/test-free",{runner,confirm:true,allowOutsideForTest:true,noPersistence:true,egressReader:async()=> "198.51.100.30"});
 assert.equal(result.providerAccepted,true);
 assert.equal(result.egressStable,true);
 assert.equal(result.publicIp,"198.51.100.30");
 assert.equal(calls.filter(args=>args[0]==="run"&&args[1]==="--standalone").length,1);
 assert.equal(calls.some(args=>args.includes("--auto")),false);
});
test("v2.1.3 without --archived declines provider test before using a model",async()=>{
  let sent=0;
  const runner=async(_,args)=>{
    if(args[0]==="--version")return {lines:["2.1.3"],code:0};
    if(args[0]==="run"&&args[1]==="--help")return {lines:["--standalone --format --model --agent"],code:0};
    sent++;return {lines:['{"type":"text","part":{"text":"OK"}}'],code:0};
  };
  const result=await runProbe("opencode/test-free",{runner,confirm:true,allowOutsideForTest:true,noPersistence:true});
  assert.equal(result.status,"unverified");
  assert.equal(result.reason,"safe_archive_not_supported");
  assert.equal(sent,0);
});
test("v1 rejected before sending request",async()=>{
 let calls=[];
 const r=await runProbe("opencode/test-free",{confirm:true,allowOutsideForTest:true,noPersistence:true,runner:async(_,args)=>{calls.push(args);return {lines:["1.19.5"],code:0}}});
 assert.equal(r.reason,"v2_required");assert.equal(calls.length,1);
});
