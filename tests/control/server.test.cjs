"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createServer,stale}=require("../../apps/control-plane/lib/server.cjs");
test("stale state never presented as live",()=>{
 assert.equal(stale({generatedAt:"2000-01-01T00:00:00.000Z"}),true);
 assert.equal(stale({generatedAt:new Date().toISOString()}),false);
});
test("server enforces password length and refuses unauthenticated requests",async()=>{
 assert.throws(()=>createServer({password:"short"}));
 const server=createServer({password:"this-is-a-long-secret"});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const port=server.address().port;
  const response=await fetch("http://127.0.0.1:"+port+"/api/v1/state");
  assert.equal(response.status,401);
  const res=await fetch("http://127.0.0.1:"+port+"/api/v1/state",{headers:{Authorization:"Basic "+Buffer.from("control:this-is-a-long-secret").toString("base64")}});
  assert.equal(res.status,200);assert.equal((await res.json()).overall,"unknown");
  const http=require("node:http");
  const status=await new Promise((resolve,reject)=>{
    const request=http.request({hostname:"127.0.0.1",port,path:"/api/v1/state",method:"GET",
      headers:{"Host":"attacker.test","Authorization":"Basic "+Buffer.from("control:this-is-a-long-secret").toString("base64")}},
      response=>{response.resume();resolve(response.statusCode)});
    request.on("error",reject);request.end();
  });
  assert.equal(status,403);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
