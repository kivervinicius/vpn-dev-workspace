"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {append,read,event}=require("../../apps/control-plane/lib/events.cjs");
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
