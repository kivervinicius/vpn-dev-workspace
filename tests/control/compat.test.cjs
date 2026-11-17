"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {mkdtempSync,mkdirSync,writeFileSync,cpSync,rmSync}=require("node:fs");
const {tmpdir}=require("node:os"),{join}=require("node:path");
const {diagnose,compareVersion}=require("../../apps/control-plane/lib/compat.cjs");
test("semver differentiates latest major release from tested older v2",()=>{
 assert.equal(compareVersion("2.3.0","2.1.3"),1);
 assert.equal(compareVersion("2.1.3","2.1.3"),0);
 assert.equal(compareVersion("2.1.2","2.1.3"),-1);
 assert.equal(compareVersion("2.3.0-rc.1","2.1.3"),null);
});
test("v2 newer than the tested release is unverified, not falsely incompatible or supported",async()=>{
 const tmp=mkdtempSync(join(tmpdir(),"vpn-compat-")),home=join(tmp,"home"),root=join(tmp,"repository");
 try {
   const v1Src=join(root,"opencode/v1"),v2Src=join(root,"opencode/v2/vpn-recovery");
   mkdirSync(v1Src,{recursive:true});mkdirSync(v2Src,{recursive:true});
   writeFileSync(join(v1Src,"vpn-recovery.js"),"source v1");
   for(const f of ["package.json","classify.js","server-core.js","server.js","tui-core.js","tui.js"]){
      writeFileSync(join(v2Src,f), f==="package.json" ? '{"dependencies":{"@opencode/plugin":"2.1.3"}}':"source "+f);
   }
   const v1Install=join(home,".opencode-v1/.config/opencode/plugins");
   const v2Install=join(home,".config/opencode/plugins/vpn-recovery");
   mkdirSync(v1Install,{recursive:true});mkdirSync(v2Install,{recursive:true});
   cpSync(join(v1Src,"vpn-recovery.js"),join(v1Install,"vpn-recovery.js"));
   for(const f of ["package.json","classify.js","server-core.js","server.js","tui-core.js","tui.js"])
     cpSync(join(v2Src,f),join(v2Install,f));
   const result=await diagnose({home,root,versionProbe:async(_,name)=>name==="v1"?"1.19.5":"2.3.0"});
   assert.equal(result.versions.v2.status,"unverified");
   assert.equal(result.versions.v2.installerAcceptsVersion,false);
   assert.equal(result.versions.v2.plugin.status,"supported");
   assert.equal(result.versions.v2.plugin.loaded,"unverified");
   assert.equal(result.versions.v2.verification.releaseSupportsArchivedProbe,true);
   assert.ok(result.warnings.includes("v2_version_drift_revalidate_plugin_runtime"));
   assert.equal(result.versions.v1.status,"supported");
 }finally{rmSync(tmp,{recursive:true,force:true})}
});
