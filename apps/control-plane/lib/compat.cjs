"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {runJson,output,writeAtomic}=require("./util.cjs");
const {spawn}=require("node:child_process");
const TESTED_V2="2.1.3";
const MIN_SAFE_PROBE_V2="2.2.6";
function parseVersion(raw){const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(String(raw||""));return match?match.slice(1).map(Number):null}
function compareVersion(a,b){const x=parseVersion(a),y=parseVersion(b);if(!x||!y)return null;for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]?1:-1}return 0}

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
  const root=options.root||process.env.VPN_CONTROL_REPO_ROOT||path.resolve(__dirname,"../../..");
  const expected={v1:"1.19.5",v2:"2.1.3"};
  const definitions={
    v1:{binary:process.env.OPENCODE_V1_BIN||path.join(home,".opencode-v1/bin/opencode"),
      installed:path.join(home,".opencode-v1/.config/opencode/plugins"),source:path.join(root,"opencode/v1")},
    v2:{binary:process.env.OPENCODE_V2_BIN||path.join(home,".opencode/bin/opencode"),
      installed:path.join(home,".config/opencode/plugins/vpn-recovery"),source:path.join(root,"opencode/v2/vpn-recovery")}
  };
  const versions={};
  const warnings=[];
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
    const sameMajor=installed&&parseVersion(installed)&&parseVersion(expected[name])&&parseVersion(installed)[0]===parseVersion(expected[name])[0];
    const drift=installed&&installed!==expected[name];
    const status=!installed?"missing":fileStatus==="missing"?"missing":fileStatus==="incompatible"?"incompatible":
      drift?(sameMajor?"unverified":"incompatible"):fileStatus;
    const expectedPluginPackage=name==="v2"?(()=>{
      try {const json=JSON.parse(fs.readFileSync(path.join(d.installed,"package.json"),"utf8"));return json.dependencies?.["@opencode/plugin"]||null}
      catch{return null}
    })():null;
    const safeProbeByRelease=name==="v2" && installed && compareVersion(installed,MIN_SAFE_PROBE_V2)!==null &&
      compareVersion(installed,MIN_SAFE_PROBE_V2)>=0;
    if(name==="v2"&&drift)warnings.push("v2_version_drift_revalidate_plugin_runtime");
    if(name==="v2"&&drift&&expectedPluginPackage&&expectedPluginPackage!==installed)warnings.push("v2_plugin_dependency_version_differs");
    if(name==="v2"&&!safeProbeByRelease)warnings.push("v2_probe_requires_archived_flag");
    versions[name]={expected:expected[name],installed:installed||null,status,
      installerAcceptsVersion:installed===expected[name],
      binaryPresent:fs.existsSync(d.binary),
      plugin:{status:fileStatus,checks,loaded:"unverified",packageDependency:expectedPluginPackage,
        dependencyMatchesBinary:name==="v2"?expectedPluginPackage===installed:null},
      verification:{testedVersion:expected[name],releaseSupportsArchivedProbe:Boolean(safeProbeByRelease),
        archivedProbeMinVersion:name==="v2"?MIN_SAFE_PROBE_V2:null,
        runtimeHooks:"unverified",realProviderAccess:"unverified"},
      behavior:{freeModelAcceptance:name==="v1"?"unsupported_by_upstream":"unverified",requestAcceptance:"unverified"},evidence:"static"};
  }
  return {schemaVersion:1,generatedAt:new Date().toISOString(),versions,
    warnings,note:"Static compatibility only. Runtime provider access and plugin loading are not proven."};
}
async function main(argv){
  if(argv.includes("--help")||argv.includes("-h")){process.stdout.write("Uso: opencode-compat --json (verificacao estatica sem alteracoes)\n");return}
  const publish=argv.includes("--publish");
  const flags=argv.filter(x=>x!=="--publish");
  if(flags.length && (flags.length!==1||flags[0]!=="--json")){process.exitCode=2;process.stderr.write("Argumentos invalidos\n");return}
  const report=await diagnose();
  if(publish) {
    const dir=process.env.VPN_CONTROL_STATE_DIR;
    if(!dir)throw new Error("VPN_CONTROL_STATE_DIR is required for --publish");
    writeAtomic(path.join(dir,"compatibility.json"),JSON.stringify(report)+"\n");
  }
  output(report);
}
module.exports={diagnose,main,pluginFiles,versionFrom,compareVersion,parseVersion};
