"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {runJson,output}=require("./util.cjs");
const {spawn}=require("node:child_process");
function fileHash(p){try{return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")}catch{return null}}
function pluginFiles(name) {return name==="v1" ? ["vpn-recovery.js"] : ["package.json","classify.js","server-core.js","server.js","tui-core.js","tui.js"];}
function versionFrom(p) {
  return new Promise(resolve=>{
    let stdout="", child;
    try{child=spawn(p,["--version"],{shell:false,stdio:["ignore","pipe","ignore"]});}
    catch{return resolve(null)}
    const timer=setTimeout(()=>child.kill("SIGKILL"),3500);
    child.stdout.on("data",chunk=>{stdout+=chunk.toString().slice(0,128)});
    child.on("error",()=>{});
    child.on("close",()=>{clearTimeout(timer);resolve((stdout.match(/(\d+\.\d+\.\d+)/)||[])[1]||null)});
  });
}
async function diagnose(options={}) {
  const home=options.home||process.env.HOME||"";
  const root=options.root||path.resolve(__dirname,"../../..");
  const expected={v1:"1.19.5",v2:"2.1.3"};
  const definitions={
    v1:{binary:process.env.OPENCODE_V1_BIN||path.join(home,".opencode-v1/bin/opencode"),
      installed:path.join(home,".opencode-v1/.config/opencode/plugins"),source:path.join(root,"opencode/v1")},
    v2:{binary:process.env.OPENCODE_V2_BIN||path.join(home,".opencode/bin/opencode"),
      installed:path.join(home,".config/opencode/plugins/vpn-recovery"),source:path.join(root,"opencode/v2/vpn-recovery")}
  };
  const versions={};
  for(const name of ["v1","v2"]) {
    const d=definitions[name];
    const pluginDir=name==="v1"?d.installed:d.installed;
    const checks=pluginFiles(name).map(file=>{
      const source=fileHash(path.join(d.source,file));
      const installed=fileHash(path.join(pluginDir,file));
      return {file,present:installed!==null,hashMatches:source!==null&&installed===source,
        sourcePresent:source!==null};
    });
    const installed=options.versionProbe?await options.versionProbe(d.binary,name):await versionFrom(d.binary);
    const fileStatus=checks.some(c=>!c.sourcePresent)?"unverified":checks.some(c=>!c.present)?"missing":checks.some(c=>!c.hashMatches)?"incompatible":"supported";
    const status=!installed?"missing":installed!==expected[name]?"incompatible":fileStatus;
    versions[name]={expected:expected[name],installed:installed||null,status,
      binaryPresent:fs.existsSync(d.binary),plugin:{status:fileStatus,checks,loaded:"unverified"},
      behavior:{freeModelAcceptance:"unverified",requestAcceptance:"unverified"},evidence:"static"};
  }
  return {schemaVersion:1,generatedAt:new Date().toISOString(),versions,
    note:"Static compatibility only. Runtime provider access and plugin loading are not proven."};
}
async function main(argv){
  if(argv.includes("--help")||argv.includes("-h")){process.stdout.write("Uso: opencode-compat --json (verificacao estatica sem alteracoes)\n");return}
  if(argv.length && (argv.length!==1||argv[0]!=="--json")){process.exitCode=2;process.stderr.write("Argumentos invalidos\n");return}
  output(await diagnose());
}
module.exports={diagnose,main,pluginFiles,versionFrom};
