"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {readHistory,createServer}=require("../../apps/control-plane/lib/server.cjs");

function tempHistory(lines){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"vpn-history-test-"));
 const file=path.join(dir,"history.jsonl");
 fs.writeFileSync(file,lines.join("\n")+"\n");
 return file;
}

test("readHistory parses JSONL, ignores invalid lines and keeps the tail",()=>{
 const file=tempHistory([
  JSON.stringify({timestamp:"2026-11-23T10:00:00Z",public_ip:"1.2.3.4",latency_ms:30}),
  "{nao é json",
  JSON.stringify([1,2,3]),
  JSON.stringify({timestamp:"2026-11-23T10:05:00Z",public_ip:"5.6.7.8",latency_ms:42}),
  JSON.stringify({timestamp:"2026-11-23T10:10:00Z",public_ip:"9.9.9.9",latency_ms:55})
 ]);
 const result=readHistory(file,2);
 assert.equal(result.stale,false);
 assert.equal(result.count,3);
 assert.equal(result.entries.length,2);
 assert.deepEqual(result.entries[1],{timestamp:"2026-11-23T10:10:00Z",latencyMs:55,publicIp:"9.9.9.9"});
 assert.equal(result.entries[0].latencyMs,42);
});

test("readHistory marks a missing file as stale instead of failing",()=>{
 const result=readHistory(path.join(os.tmpdir(),"vpn-history-inexistente-"+process.pid+".jsonl"),10);
 assert.equal(result.stale,true);
 assert.equal(result.reason,"history_missing");
 assert.deepEqual(result.entries,[]);
});

test("readHistory ignores non numeric latency",()=>{
 const file=tempHistory([JSON.stringify({timestamp:"2026-11-23T10:00:00Z",latency_ms:"abc",public_ip:"1.1.1.1"})]);
 const result=readHistory(file,10);
 assert.equal(result.entries[0].latencyMs,null);
 assert.equal(result.entries[0].publicIp,"1.1.1.1");
});

test("API exposes the history series and rejects invalid limits",async()=>{
 const file=tempHistory([
  JSON.stringify({timestamp:"2026-11-23T10:00:00Z",public_ip:"1.2.3.4",latency_ms:30}),
  JSON.stringify({timestamp:"2026-11-23T10:05:00Z",public_ip:"5.6.7.8",latency_ms:42})
 ]);
 const previous=process.env.VPN_HISTORY_FILE;
 process.env.VPN_HISTORY_FILE=file;
 try{
  const server=createServer({password:"this-is-a-long-secret"});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
   const port=server.address().port;
   const auth={Authorization:"Basic "+Buffer.from("control:this-is-a-long-secret").toString("base64")};
   const response=await fetch("http://127.0.0.1:"+port+"/api/v1/history?limit=10",{headers:auth});
   assert.equal(response.status,200);
   const body=await response.json();
   assert.equal(body.schemaVersion,1);
   assert.equal(body.entries.length,2);
   assert.equal(body.entries[0].latencyMs,30);
   const invalid=await fetch("http://127.0.0.1:"+port+"/api/v1/history?limit=999",{headers:auth});
   assert.equal(invalid.status,400);
   const unauthorized=await fetch("http://127.0.0.1:"+port+"/api/v1/history");
   assert.equal(unauthorized.status,401);
  }finally{await new Promise(resolve=>server.close(resolve))}
 }finally{
  if(previous===undefined)delete process.env.VPN_HISTORY_FILE;
  else process.env.VPN_HISTORY_FILE=previous;
 }
});
