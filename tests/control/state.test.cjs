"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {collectFrom,collectState}=require("../../apps/control-plane/lib/state.cjs");
const ok=(data)=>({data,exitCode:0,failure:null});
const fail=(data)=>({data,exitCode:1,failure:null});
test("unknown is not success, and quota is not proof of provider refusal",()=>{
 const v=collectFrom({status:ok({vpn:"running",provider:"nordvpn",type:"openvpn",public_ip:"198.51.100.10"}),
 check:ok({healthy:true,checks:[{name:"DNS",ok:true}]}),
 opencode:fail({status:"quota",port:10001,detail:"rate-limit"})});
 assert.equal(v.overall,"degraded");assert.equal(v.components.llm.requestAccepted,"unverified");
 assert.equal(v.components.opencode.limitSignal.kind,"observational");
});
test("VPN down is down even with OpenCode ok",()=>{
 const v=collectFrom({status:fail({vpn:"stopped",public_ip:""}),check:fail({healthy:false,checks:[]}),opencode:ok({status:"ok",port:10001,detail:"ok"})});
 assert.equal(v.overall,"down");
});
test("all missing stays unknown",()=>assert.equal(collectFrom({}).overall,"unknown"));
test("collector does not call mutate commands",async()=>{
 const calls=[];
 const value=await collectState({runner:async(bin,args)=>{calls.push([bin,args]);return ok({})},commands:{status:"s",check:"c",opencode:"o"}});
 assert.equal(calls.length,3);assert.deepEqual(calls.map(x=>x[0]).sort(),["c","o","s"]);
 assert.equal(value.components.llm.status,"unknown");
});
