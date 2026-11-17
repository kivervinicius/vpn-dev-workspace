"use strict";
const path=require("node:path");
const fs=require("node:fs");
const {spawn}=require("node:child_process");
const {writeAtomic,output,isObject,validIp,runJson}=require("./util.cjs");
const {append}=require("./events.cjs");

function modelValid(value){return typeof value==="string"&&/^[a-z0-9][a-z0-9._-]{0,63}\/[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)}
function eventClass(raw) {
  if(!isObject(raw))return null;
  const found=new Set(),seen=new Set(),queue=[raw];
  let inspected=0;
  while(queue.length&&inspected++<80){
    const item=queue.shift();
    if(!isObject(item)||seen.has(item))continue;
    seen.add(item);
    for(const key of ["name","code","type","errorType"]){
      if(typeof item[key]==="string")found.add(item[key]);
    }
    if(item.status===429||item.statusCode===429)found.add("rate_limit");
    if(item.status===402||item.statusCode===402)found.add("credit_limit");
    for(const [key,value] of Object.entries(item)){
      if(["message","detail","details","text","prompt","responseBody"].includes(key))continue;
      if(isObject(value))queue.push(value);
    }
  }
  if(found.has("FreeUsageLimitError")||found.has("provider.free-limit")||found.has("free_tier_limit"))return "free_tier_limit";
  if(found.has("GoUsageLimitError")||found.has("account_limit")||found.has("account_rate_limit"))return "account_limit";
  if(found.has("CreditLimitExceeded")||found.has("credit_limit")||found.has("InsufficientFunds"))return "credit_limit";
  if(found.has("rate_limit")||found.has("RateLimitError"))return "rate_limit";
  return null;
}
function classify(lines,exitCode,timeout=false) {
  if(timeout)return {status:"unverified",reason:"timeout"};
  let gotText=false,gotError=false,detected=null,parsed=0;
  for(const line of lines) {
    if(!line.trim())continue;
    let item;
    try{item=JSON.parse(line)}catch{continue}
    if(!isObject(item))continue;
    parsed++;
    if(item.type==="text"&&isObject(item.part)&&typeof item.part.text==="string"&&item.part.text.trim())gotText=true;
    if(item.type==="error"||item.type==="session.error"||item.type==="session.execution.failed")gotError=true;
    const v=eventClass(item.error||item.properties?.error||item);
    if(v)detected=v;
  }
  if(detected)return {status:"rejected",reason:detected};
  if(exitCode===0&&gotText&&!gotError)return {status:"accepted",reason:"text_response"};
  if(gotError)return {status:"unverified",reason:"unclassified_error"};
  if(exitCode!==0)return {status:"unverified",reason:"command_failed"};
  if(parsed===0)return {status:"unverified",reason:"unparseable_output"};
  return {status:"unverified",reason:"no_text_response"};
}
function execute(binary,args,timeoutMs=60000){
  return new Promise(resolve=>{
    let finished=false,raw="",timedOut=false;
    let child;
    try{child=spawn(binary,args,{shell:false,stdio:["ignore","pipe","ignore"],env:process.env})}
    catch{return resolve({code:null,lines:[],timeout:false})}
    const timer=setTimeout(()=>{timedOut=true;child.kill("SIGKILL")},timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data",chunk=>{raw+=chunk;if(raw.length>128*1024){timedOut=true;child.kill("SIGKILL")}});
    child.on("error",()=>{});
    child.on("close",code=>{
      if(finished)return;
      finished=true;clearTimeout(timer);
      resolve({code,lines:raw.split(/\r?\n/).slice(0,128),timeout:timedOut});
    });
  });
}
async function runProbe(model,options={}){
  if(!modelValid(model))throw new Error("invalid_model");
  if(!options.confirm)throw new Error("consent_required");
  if(process.env.VPN_WORKSPACE_CONTAINER!=="1"&&!options.allowOutsideForTest)throw new Error("vpn_container_required");
  const binary=options.binary||process.env.OPENCODE_V2_BIN||path.join(process.env.HOME||"/home/developer",".opencode/bin/opencode");
  const runner=options.runner||execute;
  const egressReader=options.egressReader|| (async()=>{
    const v=await runJson(process.env.VPN_PROBE_VPN_STATUS_BIN||"vpn-status",["--json"],{timeoutMs:5000});
    return v.exitCode===0 && validIp(v.data?.public_ip) ? v.data.public_ip : null;
  });
  const version=await runner(binary,["--version"],3000);
  if(!version.lines.join(" ").match(/(?:^|[^0-9])2\.\d+\.\d+(?:[^0-9]|$)/)) {
    return {schemaVersion:1,status:"unverified",reason:"v2_required",model,providerAccepted:false};
  }
  const help=await runner(binary,["run","--help"],3000);
  const flags=help.lines.join(" ");
  if(!["--standalone","--archived","--format","--model"].every(f=>flags.includes(f))){
    return {schemaVersion:1,status:"unverified",reason:"unsupported_cli_options",model,providerAccepted:false};
  }
  // One command invocation only. The OpenCode client may internally retry;
  // this wrapper never retries and always uses a private, archived session.
  const beforeIp=await egressReader();
  const response=await runner(binary,["run","--standalone","--archived","--format","json","--agent","plan","--model",model,
    "Responda apenas OK, sem ferramentas e sem acessar arquivos."],60000);
  const afterIp=await egressReader();
  const egressStable=Boolean(beforeIp && afterIp && beforeIp===afterIp);
  const classification=classify(response.lines,response.code,response.timeout);
  const result={schemaVersion:1,observedAt:new Date().toISOString(),model,
    status:classification.status,reason:classification.reason,providerAccepted:classification.status==="accepted",
    publicIp:egressStable?beforeIp:null,egressStable,
    note:"A single explicit OpenCode run was attempted. This does not establish future free-tier eligibility."};
  if(!options.noPersistence){
    try{
      const stateDir=process.env.VPN_CONTROL_STATE_DIR||"/var/lib/vpn-control/observability";
      writeAtomic(path.join(stateDir,"provider-probe.json"),JSON.stringify(result)+"\n");
      append({type:result.status==="accepted"?"opencode.request.accepted":result.status==="rejected"?"opencode.request.rejected":"opencode.request.unverified",
        source:"manual",reason:result.reason,afterIp:result.publicIp||undefined,verification:result.status==="accepted"?"provider_accepted":result.status==="rejected"?"provider_rejected":"unverified"});
    }catch{result.persistence="unavailable"}
  }
  return result;
}
async function main(argv){
 if(argv.includes("--help")||argv.includes("-h")) {
  process.stdout.write("Uso: vpn-provider-probe --model provider/model --confirm (uma execucao OpenCode v2; consome franquia e cria sessao arquivada; nunca rotaciona VPN)\n");return;
 }
 if(argv.length!==3||argv[0]!=="--model"||argv[2]!=="--confirm")throw new Error("invalid_args");
 output(await runProbe(argv[1],{confirm:true}));
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{process.stderr.write("vpn-provider-probe: "+e.message+"\n");process.exitCode=2});
module.exports={modelValid,classify,runProbe,main,eventClass};
