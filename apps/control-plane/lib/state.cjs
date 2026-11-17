"use strict";
const { runJson, isObject, output } = require("./util.cjs");
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
  const vpn = s.vpn === "running" ? "ok" : (typeof s.vpn === "string" && s.vpn !== "desconhecido" ? "down" : "unknown");
  const hasChecks = typeof c.healthy === "boolean" && Array.isArray(c.checks);
  // DNS is a separate diagnostic; it must not stand in for tunnel health.
  const dns = hasChecks ? (c.checks.some(x => x && x.ok === false && /dns|resolv/i.test(String(x.name))) ? "degraded" : c.healthy ? "ok" : "unknown") : "unknown";
  const checksStatus = hasChecks ? (check.exitCode === 0 && c.healthy && c.checks.every(x => x && x.ok === true) ? "ok" : "degraded") : "unknown";
  const openCode = a.status === "ok" ? "ok" : a.status === "down" ? "down" : a.status === "quota" ? "degraded" : "unknown";
  const failures = hasChecks ? c.checks.filter(x => x && x.ok === false).map(x => ({name:String(x.name).slice(0,100),ok:false})) : [];
  const known = [vpn,checksStatus,dns,openCode].filter(x=>x!=="unknown");
  const overall = vpn === "down" ? "down" : !known.length ? "unknown" :
    known.some(x=>x==="down"||x==="degraded") ? "degraded" : "ok";
  const sources = ["status","check","opencode"].map(name=>({
    name: {status:"vpn-status",check:"vpn-check",opencode:"vpn-opencode"}[name],
    status:sourceStatus(results[name]), error: results[name] && results[name].failure || null
  }));
  return {
    schemaVersion:1, generatedAt:now().toISOString(), overall,
    components:{
      network:{status:checksStatus,dns},
      vpn:{status:vpn,provider:typeof s.provider==="string" ? s.provider : null,
        type:typeof s.type==="string" ? s.type : null,
        publicIp:typeof s.public_ip==="string" && s.public_ip ? s.public_ip : null,
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
