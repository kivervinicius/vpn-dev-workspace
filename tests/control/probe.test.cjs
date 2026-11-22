"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {classify,runProbe}=require("../../apps/control-plane/lib/probe.cjs");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
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
  if(args[0]==="--version")return {lines:["2.3.2"],code:0};
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
  const r=await runProbe("opencode/test-free",{confirm:true,allowOutsideForTest:true,noPersistence:true,runner:async(_,args)=>{calls.push(args);return {lines:["1.19.6"],code:0}}});
 assert.equal(r.reason,"v2_required");assert.equal(calls.length,1);
});

test("probe isolates OpenCode data, plugin config, and copied auth from real home",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"vpn-probe-isolation-"));
 const parent=path.join(root,"host"),tmpRoot=path.join(root,"tmpfs");
 fs.mkdirSync(path.join(parent,".local/share/opencode"),{recursive:true});
 fs.mkdirSync(path.join(parent,".config/opencode/plugins"),{recursive:true});
 fs.mkdirSync(tmpRoot,{recursive:true});
 const secret=path.join(parent,".local/share/opencode/auth.json");
 fs.writeFileSync(secret,'{"opencode":{"type":"oauth","access":"TEST-SECRET"}}');
 fs.writeFileSync(path.join(parent,".config/opencode/plugins/test.js"),"PLUGIN_NOT_LOAD");
 const previousHome=process.env.HOME,previousData=process.env.XDG_DATA_HOME;
 process.env.HOME=parent;delete process.env.XDG_DATA_HOME;
 let checked=false,sandboxPath="";
 const runner=async(_,args,timeout,cwd,env)=>{
  if(args[0]==="--version")return {lines:["2.3.2"],code:0};
  if(args[0]==="run"&&args[1]==="--help")return {lines:["--standalone --archived --format --model --agent"],code:0};
  checked=true;sandboxPath=cwd;
  assert.equal(env.HOME,cwd);
  assert.equal(env.XDG_DATA_HOME,path.join(cwd,"data"));
  assert.equal(env.XDG_CONFIG_HOME,path.join(cwd,"config"));
  assert.equal(env.OPENCODE_CONFIG_DIR,path.join(cwd,"config","opencode"));
  assert.equal(fs.readFileSync(path.join(env.XDG_DATA_HOME,"opencode","auth.json"),"utf8"),fs.readFileSync(secret,"utf8"));
  assert.equal(fs.existsSync(path.join(env.XDG_CONFIG_HOME,"opencode","plugins","test.js")),false);
  return {code:0,lines:['{"type":"text","part":{"text":"OK"}}'],timeout:false};
 };
 try{
  const result=await runProbe("opencode/test-free",{runner,confirm:true,allowOutsideForTest:true,tmpRoot,
    noPersistence:true,egressReader:async()=> "198.51.100.40"});
  assert.equal(result.isolatedSession,true);
  assert.equal(result.providerAccepted,true);assert.equal(checked,true);
  assert.equal(fs.existsSync(sandboxPath),false);
  assert.equal(fs.existsSync(secret),true);
 }finally{
  if(previousHome===undefined)delete process.env.HOME;else process.env.HOME=previousHome;
  if(previousData===undefined)delete process.env.XDG_DATA_HOME;else process.env.XDG_DATA_HOME=previousData;
  fs.rmSync(root,{recursive:true,force:true});
 }
});
