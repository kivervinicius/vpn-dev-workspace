"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const bin=path.resolve(__dirname,"../../scripts/opencode2-service");
test("managed OpenCode entrypoint rejects v1, below-minimum v2, and unhealthy VPN",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"vpn-v2-launcher-"));
 const mock=path.join(root,"opencode"),check=path.join(root,"vpn-check");
 try{
  const run=(version,canary,checkVersion=false,healthy=true)=>{
   fs.writeFileSync(mock,[
     "#!/bin/sh",
     'if [ "$1" = "--version" ]; then echo "'+version+'"; exit 0; fi',
     'printf "%s\\n" "$*"'
   ].join("\n")+"\n",{mode:0o755});
   fs.writeFileSync(check,"#!/bin/sh\nexit "+(healthy?0:1)+"\n",{mode:0o755});
   const args=checkVersion?["--check"]:["serve","--port","10001"];
   return spawnSync("bash",[bin,...args],{encoding:"utf8",env:{...process.env,HOME:root,
     VPN_CHECK_BIN:check,OPENCODE_V2_BIN:mock,
     OPENCODE_V2_MIN_VERSION:"2.2.6",OPENCODE_V2_EXPECTED_VERSION:"2.3.2",
     OPENCODE_V2_ALLOW_UNVERIFIED:canary?"true":"false"}});
  };
  const v1=run("1.18.31",false);assert.equal(v1.status,1);
  assert.match(v1.stderr,/expected OpenCode v2/);
  // Abaixo do baseline mínimo: falha fechada.
  const old=run("2.1.3",false);assert.equal(old.status,1);
  assert.match(old.stderr,/below the minimum baseline/);
  // Canary explícito aceita abaixo do mínimo, com aviso.
  const canaryOld=run("2.1.3",true);assert.equal(canaryOld.status,0);
  assert.match(canaryOld.stderr,/unverified/);
  const baseline=run("2.3.2",false);assert.equal(baseline.status,0);
  assert.match(baseline.stdout,/serve --port 10001/);
  // Acima do pin: aviso, não derruba o serviço (o auto-update instala latest).
  const newer=run("2.4.0",false);assert.equal(newer.status,0);
  assert.match(newer.stderr,/not the tested baseline/);
  const display=run("2.4.0",false,true);assert.equal(display.status,0);
  assert.equal(JSON.parse(display.stdout).homologated,false);
  assert.equal(JSON.parse(display.stdout).min,"2.2.6");
  const unhealthy=run("2.3.2",false,false,false);assert.equal(unhealthy.status,1);
  assert.match(unhealthy.stderr,/VPN tunnel unhealthy/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
