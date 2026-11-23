"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {append,read,event,prune}=require("../../apps/control-plane/lib/events.cjs");
test("journal only accepts enumerated fields, not credentials or arbitrary output",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"vpn-events-test-")),file=path.join(dir,"events.jsonl");
 try{
  append({type:"vpn.egress.changed",source:"vpn-events",beforeIp:"198.51.100.2",afterIp:"198.51.100.3",token:"secret"},{file});
  const content=fs.readFileSync(file,"utf8");
  assert.equal(content.includes("secret"),false);
  assert.equal(read({file})[0].verification,"unverified");
  assert.throws(()=>event({type:"arbitrary",source:"vpn-events"}));
  assert.throws(()=>event({type:"vpn.egress.changed",source:"vpn-events",afterIp:"not-an-ip"}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("journal prunes oldest lines instead of dead-ending at the cap",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"vpn-events-prune-")),file=path.join(dir,"events.jsonl");
 try{
  const line=JSON.stringify({schemaVersion:1,type:"vpn.check.failed",source:"vpn-events"})+"\n";
  fs.writeFileSync(file,line.repeat(200));
  const result=prune({file,keepBytes:Buffer.byteLength(line)*10});
  assert.equal(result.kept,10);
  assert.equal(result.removed,190);
  assert.equal(fs.readFileSync(file,"utf8").split("\n").filter(Boolean).length,10);
  assert.throws(()=>prune({file,keepBytes:-1}));
  // append acima do teto poda automaticamente em vez de travar para sempre.
  fs.writeFileSync(file,"x".repeat(10*1024*1024+1));
  append({type:"vpn.check.failed",source:"vpn-events"},{file});
  assert.ok(fs.statSync(file).size<=10*1024*1024);
  assert.equal(read({file}).length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
