"use strict";
const path=require("node:path");
const fs=require("node:fs");
const os=require("node:os");
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
  let textParts=[],gotError=false,detected=null,parsed=0;
  for(const line of lines) {
    if(!line.trim())continue;
    let item;
    try{item=JSON.parse(line)}catch{continue}
    if(!isObject(item))continue;
    parsed++;
    if(item.type==="text"&&isObject(item.part)&&typeof item.part.text==="string")textParts.push(item.part.text);
    if(item.type==="error"||item.type==="session.error"||item.type==="session.execution.failed")gotError=true;
    const v=eventClass(item.error||item.properties?.error||item);
    if(v)detected=v;
  }
  if(detected)return {status:"rejected",reason:detected};
  const complete=textParts.join("").trim();
  if(exitCode===0&&!gotError&&complete==="OK")return {status:"accepted",reason:"expected_response"};
  if(exitCode===0&&!gotError&&complete)return {status:"unverified",reason:"unexpected_response"};
  if(gotError)return {status:"unverified",reason:"unclassified_error"};
  if(exitCode!==0)return {status:"unverified",reason:"command_failed"};
  if(parsed===0)return {status:"unverified",reason:"unparseable_output"};
  return {status:"unverified",reason:"no_text_response"};
}
function execute(binary,args,timeoutMs=60000,cwd,env){
  return new Promise(resolve=>{
    let finished=false,raw="",timedOut=false;
    let child;
    try{child=spawn(binary,args,{shell:false,stdio:["ignore","pipe","ignore"],env:env||process.env,cwd:cwd||process.cwd()})}
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

const TMPFS_LINUX_MAGIC=0x01021994;
function isolatedSession(options={}){
  const root=options.tmpRoot||process.env.VPN_PROBE_TMPFS_ROOT||"/dev/shm";
  // A probe may need a copy of auth.json. Never stage provider credentials on
  // disk-backed /tmp by default, particularly on Windows Docker Desktop.
  if(!options.allowOutsideForTest){
    let stat;
    try {stat=fs.statfsSync(root)}catch {throw new Error("probe_tmpfs_missing")}
    if(stat.type!==TMPFS_LINUX_MAGIC)throw new Error("probe_tmpfs_required");
  }
  const directory=fs.mkdtempSync(path.join(root,"vpn-provider-probe-"));
  fs.chmodSync(directory,0o700);
  try{
    const dataHome=path.join(directory,"data"),configHome=path.join(directory,"config");
    const cacheHome=path.join(directory,"cache"),stateHome=path.join(directory,"state");
    for(const p of [dataHome,configHome,cacheHome,stateHome])fs.mkdirSync(p,{recursive:true,mode:0o700});
    const env={...process.env,HOME:directory,XDG_DATA_HOME:dataHome,
      XDG_CONFIG_HOME:configHome,XDG_CACHE_HOME:cacheHome,XDG_STATE_HOME:stateHome,
      OPENCODE_CONFIG_DIR:path.join(configHome,"opencode")};
    // Inherited dynamic configuration could load plugins or reference the real home.
    delete env.OPENCODE_CONFIG_CONTENT;
    const origin=path.join(process.env.XDG_DATA_HOME||path.join(process.env.HOME||os.homedir(),".local/share"),"opencode","auth.json");
    if(fs.existsSync(origin)){
      const st=fs.statSync(origin);
      if(!st.isFile()||st.size>1024*1024)throw new Error("unsupported_auth_file");
      const dst=path.join(dataHome,"opencode","auth.json");
      fs.mkdirSync(path.dirname(dst),{recursive:true,mode:0o700});
      fs.copyFileSync(origin,dst,fs.constants.COPYFILE_EXCL);
      fs.chmodSync(dst,0o600);
    }
    return {directory,env};
  }catch(error){fs.rmSync(directory,{recursive:true,force:true});throw error}
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
  const versionText=version.lines.join(" ");
  const match=/(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)(?:[^0-9]|$)/.exec(versionText);
  if(version.code!==0||!match||Number(match[1])!==2) {
    return {schemaVersion:1,status:"unverified",reason:"v2_required",model,providerAccepted:false};
  }
  // Fail closed on known releases without --archived even if a mocked or
  // incompatible CLI advertises the option. The flag alone is insufficient.
  if(Number(match[2])<2||(Number(match[2])===2&&Number(match[3])<6)) {
    return {schemaVersion:1,status:"unverified",reason:"safe_archive_not_supported",
      model,providerAccepted:false,minimumRelease:"2.2.6"};
  }
  const help=await runner(binary,["run","--help"],3000);
  const flags=help.lines.join(" ");
  // --archived was introduced in v2.2.6. Without it a probe could create a
  // visible session in the user's OpenCode home; fail closed rather than write.
  if(!flags.includes("--archived")){
    return {schemaVersion:1,status:"unverified",reason:"safe_archive_not_supported",
      model,providerAccepted:false,minimumRelease:"2.2.6"};
  }
  if(!["--standalone","--format","--model","--agent"].every(f=>flags.includes(f))){
    return {schemaVersion:1,status:"unverified",reason:"unsupported_cli_options",model,providerAccepted:false};
  }
  // One command invocation only. The OpenCode client may internally retry;
  // this wrapper never retries and always uses a private, archived session.
  const beforeIp=await egressReader();
  // Do not run the probe in a real project workspace: project plugins and
  // repository context should not become part of the verification prompt.
  let sandbox;
  try{sandbox=isolatedSession(options)}
  catch(error){return {schemaVersion:1,status:"unverified",reason:error.message,model,providerAccepted:false}}
  let response;
  try{
    response=await runner(binary,["run","--standalone","--archived","--format","json","--agent","plan","--model",model,
      "Responda apenas OK, sem ferramentas e sem acessar arquivos."],60000,sandbox.directory,sandbox.env);
  }finally{
    fs.rmSync(sandbox.directory,{recursive:true,force:true});
  }
  const afterIp=await egressReader();
  const egressStable=Boolean(beforeIp && afterIp && beforeIp===afterIp);
  const classification=classify(response.lines,response.code,response.timeout);
  const result={schemaVersion:1,observedAt:new Date().toISOString(),model,
    status:classification.status,reason:classification.reason,providerAccepted:classification.status==="accepted",
    publicIp:egressStable?beforeIp:null,egressStable,isolatedSession:true,
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
  process.stdout.write("Uso: vpn-provider-probe --model provider/model --confirm (OpenCode v2.2.6+; sessao isolada via tmpfs; auth.json copiado temporariamente em RAM e apagado; consome franquia; nao rotaciona VPN)\n");return;
 }
 if(argv.length!==3||argv[0]!=="--model"||argv[2]!=="--confirm")throw new Error("invalid_args");
 output(await runProbe(argv[1],{confirm:true}));
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{process.stderr.write("vpn-provider-probe: "+e.message+"\n");process.exitCode=2});
module.exports={modelValid,classify,runProbe,main,eventClass,isolatedSession,execute};
