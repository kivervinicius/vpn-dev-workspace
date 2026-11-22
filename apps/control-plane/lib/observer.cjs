"use strict";
const path=require("node:path");
const {collectState}=require("./state.cjs");
const {append}=require("./events.cjs");
const {writeAtomic,secureDir}=require("./util.cjs");

const root=process.env.VPN_CONTROL_STATE_DIR||"/var/lib/vpn-control/observability";
let previous=null;
let previousCheckFailed=false;
let stopped=false;
const interval=Math.max(15,Math.min(300,Number(process.env.VPN_CONTROL_INTERVAL_SECONDS)||30))*1000;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function once(){
  const state=await collectState();
  secureDir(root);
  writeAtomic(path.join(root,"state.json"),JSON.stringify(state)+"\n");
  const current=state.components.vpn;
  const checksFailed=Array.isArray(state.checks)&&state.checks.length>0;
  if(previous){
    if(previous.publicIp && current.publicIp && previous.publicIp!==current.publicIp && current.status==="ok"){
      append({type:"vpn.egress.changed",source:"vpn-observer",beforeIp:previous.publicIp,afterIp:current.publicIp,
        reason:"observed_change",verification:"egress_confirmed"});
    }
    if(previous.status==="ok" && current.status==="down")
      append({type:"vpn.connection.failed",source:"vpn-observer",reason:"observed_down"});
    if(previous.status==="down" && current.status==="ok")
      append({type:"vpn.connection.restored",source:"vpn-observer",reason:"observed_recovery"});
    if(!previousCheckFailed && checksFailed)
      append({type:"vpn.check.failed",source:"vpn-observer",reason:"checks_degraded"});
  }
  previous=current;
  previousCheckFailed=checksFailed;
  return state;
}
async function main(){
  process.on("SIGTERM",()=>{stopped=true});
  process.on("SIGINT",()=>{stopped=true});
  while(!stopped){
    try{await once()}catch{process.stderr.write("vpn-observer: collection or journal unavailable\n")}
    if(stopped)break;
    await pause(interval);
  }
}
if(require.main===module) main().catch(()=>{process.exitCode=1});
module.exports={once,main};
