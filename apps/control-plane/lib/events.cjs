"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {validIp,secureDir,output,writeAtomic}=require("./util.cjs");
const JOURNAL_MAX_BYTES=10*1024*1024,JOURNAL_KEEP_BYTES=5*1024*1024;
const TYPES=new Set(["vpn.egress.changed","vpn.egress.unchanged","vpn.connection.failed","vpn.connection.restored","vpn.check.failed","opencode.request.accepted","opencode.request.rejected","opencode.request.unverified","opencode.compatibility.warning","backup.created","backup.verified","backup.restored","backup.failed"]);
const SOURCES=new Set(["vpn-server-rotate","vpn-reconnect","vpn-auto-reconnect","opencode-limit-recover","vpn-events","vpn-observer","vpn-backup","manual"]);
function storeFile(options={}) {
  return options.file || process.env.VPN_EVENTS_FILE || "/var/lib/vpn-control/events/events.ndjson";
}
function event(input,now=()=>new Date()) {
  if (!TYPES.has(input.type)||!SOURCES.has(input.source)) throw new Error("invalid_type_or_source");
  for(const key of ["beforeIp","afterIp"]){if(input[key]!=null&&!validIp(input[key]))throw new Error("invalid_ip");}
  if(input.reason!=null&&!/^[a-z][a-z0-9_]{0,63}$/.test(input.reason))throw new Error("invalid_reason");
  return {schemaVersion:1,id:crypto.randomUUID(),occurredAt:now().toISOString(),
    type:input.type,source:input.source,reason:input.reason||null,
    beforeIp:input.beforeIp||null,afterIp:input.afterIp||null,
    verification:input.verification==="provider_accepted"?"provider_accepted":
      input.verification==="provider_rejected"?"provider_rejected":
      input.verification==="egress_confirmed"?"egress_confirmed":"unverified"};
}
// Poda o journal preservando as linhas mais recentes até keepBytes. Sem isto,
// o teto de 10MB travava todo append para sempre (journal_full_run_prune).
function prune(options={}) {
  const f=storeFile(options);
  const keepBytes=options.keepBytes==null?JOURNAL_KEEP_BYTES:Number(options.keepBytes);
  if(!Number.isInteger(keepBytes)||keepBytes<0||keepBytes>JOURNAL_MAX_BYTES)throw new Error("invalid_keep_bytes");
  if(!fs.existsSync(f))return {kept:0,removed:0,bytes:0};
  const lines=fs.readFileSync(f,"utf8").split("\n").filter(Boolean);
  let bytes=0;const keep=[];
  for(let i=lines.length-1;i>=0;i--){
    const size=Buffer.byteLength(lines[i])+1;
    if(bytes+size>keepBytes)break;
    bytes+=size;keep.unshift(lines[i]);
  }
  const removed=lines.length-keep.length;
  if(removed>0)writeAtomic(f,keep.length?keep.join("\n")+"\n":"");
  return {kept:keep.length,removed,bytes};
}
function append(input,options={}) {
  const item=event(input,options.now);
  const f=storeFile(options);
  secureDir(path.dirname(f));
  const current=fs.existsSync(f)?fs.statSync(f).size:0;
  if(current>JOURNAL_MAX_BYTES)prune(options);
  fs.appendFileSync(f,JSON.stringify(item)+"\n",{encoding:"utf8",mode:0o600,flag:"a"});
  return item;
}
function read(options={}) {
  const f=storeFile(options),limit=options.limit==null?50:Number(options.limit);
  if(!Number.isInteger(limit)||limit<1||limit>200)throw new Error("invalid_limit");
  if(!fs.existsSync(f))return [];
  const size=fs.statSync(f).size;
  if(size>10*1024*1024+1024)throw new Error("journal_too_large");
  return fs.readFileSync(f,"utf8").split("\n").filter(Boolean).slice(-limit).reverse().flatMap(line=>{
    try { const item=JSON.parse(line);return item.schemaVersion===1?[item]:[]; }catch{return [];}
  });
}
function list(options){return {schemaVersion:1,events:read(options)}}
async function main(argv) {
  const cmd=argv.shift();
  if(cmd==="--help"||cmd==="-h"||!cmd){process.stdout.write("Uso: vpn-events list [--limit 1..200] | emit --type TYPE --source SOURCE [--reason CODE] [--before-ip IP] [--after-ip IP] [--verification CODE] | prune [--keep-bytes N]\n");return;}
  try{
    if(cmd==="list"){
      if(argv[0]!=="--limit"&&argv.length)throw new Error("invalid_args");
      if(argv.length!==0&&argv.length!==2)throw new Error("invalid_args");
      output(list({limit:argv.length?Number(argv[1]):50}));return;
    }
    if(cmd==="emit"){
      if(argv.length%2!==0)throw new Error("invalid_args");
      const data={};const keys={"--type":"type","--source":"source","--reason":"reason","--before-ip":"beforeIp","--after-ip":"afterIp","--verification":"verification"};
      for(let i=0;i<argv.length;i+=2){if(!keys[argv[i]])throw new Error("invalid_args");data[keys[argv[i]]]=argv[i+1];}
      output(append(data));return;
    }
    if(cmd==="prune"){
      if(argv.length%2!==0)throw new Error("invalid_args");
      const opts={};
      for(let i=0;i<argv.length;i+=2){
        if(argv[i]!=="--keep-bytes")throw new Error("invalid_args");
        opts.keepBytes=Number(argv[i+1]);
      }
      output(prune(opts));return;
    }
    throw new Error("invalid_action");
  }catch(err){process.stderr.write("vpn-events: "+err.message+"\n");process.exitCode=2;}
}
module.exports={append,read,list,event,prune,main,TYPES};
