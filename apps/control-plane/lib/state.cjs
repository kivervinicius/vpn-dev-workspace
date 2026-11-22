"use strict";
const { runJson, isObject, output, validIp } = require("./util.cjs");
const STATUSES = new Set(["ok","degraded","down","unknown"]);
function sourceStatus(result) {
  if (!result || !isObject(result.data)) return "unknown";
  return result.exitCode === 0 ? "ok" : "degraded";
}
function collectFrom(results, now = () => new Date()) {
  const status = results.status || {};
  const check = results.check || {};
  const app = results.opencode || {};
  const s = isObject(status.data) ? status.data : {};
  const c = isObject(check.data) ? check.data : {};
  const a = isObject(app.data) ? app.data : {};
  const statusSource=sourceStatus(status),checkSource=sourceStatus(check),opencodeSource=sourceStatus(app);
  const hasChecks=typeof c.healthy==="boolean"&&Array.isArray(c.checks);
  const checks=hasChecks?c.checks.filter(isObject):[];
  const failures=checks.filter(x=>x.ok===false).map(x=>({name:String(x.name||"unknown").slice(0,100),ok:false}));
  const criticalFailure=failures.some(x=>/t[uú]nel|tunnel|ip p[uú]blico|public.?ip|egress/i.test(x.name));
  let vpn=s.vpn==="running"?"ok":
    typeof s.vpn==="string"&&!["","desconhecido","unknown"].includes(s.vpn)?"down":"unknown";
  if(vpn==="ok"&&(!validIp(s.public_ip)||criticalFailure))vpn="down";
  else if(vpn==="ok"&&statusSource!=="ok")vpn="degraded";
  const dnsChecks=checks.filter(x=>/dns|resolv/i.test(String(x.name||"")));
  const dns=dnsChecks.some(x=>x.ok===false)?"degraded":
    dnsChecks.length>0&&dnsChecks.every(x=>x.ok===true)?"ok":"unknown";
  const network=!hasChecks?"unknown":c.healthy===false||checkSource!=="ok"?"degraded":
    c.healthy===true?"ok":"unknown";
  const openCode=a.status==="ok"?"ok":a.status==="down"?"down":
    a.status==="quota"?"degraded":"unknown";
  // Missing or stale source data cannot produce a green aggregate.
  const components=[vpn,network,openCode];
  const overall=vpn==="down"?"down":
    components.some(x=>x==="down"||x==="degraded") ||
    [statusSource,checkSource,opencodeSource].some(x=>x==="degraded")?"degraded":
    components.some(x=>x==="unknown") ||
    [statusSource,checkSource,opencodeSource].some(x=>x!=="ok")?"unknown":"ok";
  const sources=["status","check","opencode"].map(name=>({
    name:{status:"vpn-status",check:"vpn-check",opencode:"vpn-opencode"}[name],
    status:sourceStatus(results[name]),error:results[name]&&results[name].failure||null
  }));
  return {
    schemaVersion:1, generatedAt:now().toISOString(), overall,
    components:{
      network:{status:network,dns},
      vpn:{status:vpn,provider:typeof s.provider==="string" ? s.provider : null,
        type:typeof s.type==="string" ? s.type : null,
        publicIp:validIp(s.public_ip)?s.public_ip:null,
        location:typeof s.location==="string" ? s.location : null},
      opencode:{status:openCode,port:Number.isInteger(a.port)?a.port:null,
        detail:typeof a.detail==="string" ? a.detail.slice(0,100):null,
        limitSignal:a.status==="quota" ? {kind:"observational",classification:"unverified"}:null},
      llm:{status:"unknown",provider:null,model:null,requestAccepted:"unverified"}
    },
    checks:failures,sources,stale:false
  };
}
async function collectState(options={}) {
  const runner = options.runner || runJson;
  const cmds = options.commands || {
    status:process.env.VPN_STATE_STATUS_BIN || "vpn-status",
    check:process.env.VPN_STATE_CHECK_BIN || "vpn-check",
    opencode:process.env.VPN_STATE_OPENCODE_BIN || "vpn-opencode"
  };
  const [status,check,opencode] = await Promise.all([
    runner(cmds.status,["--json"]),runner(cmds.check,["--json"]),runner(cmds.opencode,["check","--json"])
  ]);
  return collectFrom({status,check,opencode},options.now);
}
async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write("Uso: vpn-state --json (somente leitura; schemaVersion=1)\n");return;
  }
  if (argv.length && (argv.length!==1 || argv[0]!=="--json")) {process.stderr.write("Argumentos invalidos\n");process.exitCode=2;return;}
  output(await collectState());
}
module.exports={collectState,collectFrom,main,STATUSES};
