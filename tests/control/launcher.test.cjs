"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const bin=path.resolve(__dirname,"../../scripts/opencode2-service");
test("managed OpenCode entrypoint rejects v1, unverified v2, and unhealthy VPN",()=>{
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
      VPN_CHECK_BIN:check,OPENCODE_V2_BIN:mock,OPENCODE_V2_EXPECTED_VERSION:"2.1.3",
      OPENCODE_V2_ALLOW_UNVERIFIED:canary?"true":"false"}});
  };
  const v1=run("1.18.31",false);assert.equal(v1.status,1);
  assert.match(v1.stderr,/expected OpenCode v2/);
  const v2=run("2.1.3",false);assert.equal(v2.status,0);
  assert.match(v2.stdout,/serve --port 10001/);
  const wrong=run("2.3.0",false);assert.equal(wrong.status,1);
  assert.match(wrong.stderr,/not been homologated/);
  const canary=run("2.3.0",true);assert.equal(canary.status,0);
  assert.match(canary.stderr,/unverified/);
  const display=run("2.3.0",true,true);assert.equal(display.status,0);
  assert.equal(JSON.parse(display.stdout).homologated,false);
  const unhealthy=run("2.1.3",false,false,false);assert.equal(unhealthy.status,1);
  assert.match(unhealthy.stderr,/VPN tunnel unhealthy/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
