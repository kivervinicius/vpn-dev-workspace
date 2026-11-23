"use strict";
const http=require("node:http"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {read}=require("./events.cjs"),{isObject}=require("./util.cjs");
const root=process.env.VPN_CONTROL_STATE_DIR||"/var/lib/vpn-control/observability";
const passwordFile=process.env.CONTROL_UI_PASSWORD_FILE||"/run/secrets/control_ui_password";
const port=Number(process.env.CONTROL_UI_PORT||10003);
const htmlPath=path.join(__dirname,"../public/index.html");
const ALLOWED_HOSTS=new Set(["127.0.0.1","localhost","[::1]"]);
function readJson(file){
 try {const st=fs.statSync(file);if(st.size>262144)return null;const v=JSON.parse(fs.readFileSync(file,"utf8"));return isObject(v)?v:null}catch{return null}
}
function stale(payload){
 if(!payload || !payload.generatedAt)return true;
 const ms=Date.parse(payload.generatedAt);
 return !Number.isFinite(ms)||Date.now()-ms>120000||ms>Date.now()+10000;
}
function loadState(){
 const v=readJson(path.join(root,"state.json"));
 if(!v)return {schemaVersion:1,overall:"unknown",stale:true,reason:"observer_not_running",
   components:{network:{status:"unknown"},vpn:{status:"unknown"},opencode:{status:"unknown"},llm:{status:"unknown"}}};
 return {...v,stale:stale(v),overall:stale(v)?"unknown":v.overall};
}
function safeEqual(actual,expected){
 const a=crypto.createHash("sha256").update(actual).digest();
 const b=crypto.createHash("sha256").update(expected).digest();
 return crypto.timingSafeEqual(a,b);
}
function createServer(options={}){
 const password=options.password;
 if(typeof password!=="string" || password.length<16)throw new Error("password_missing_or_too_short");
 return http.createServer((req,res)=>{
  const host=req.headers.host||"";
  const hostname=host.replace(/:\d+$/,"");
  if(!ALLOWED_HOSTS.has(hostname)){res.writeHead(403,{"Cache-Control":"no-store"});res.end();return}
  if(req.method!=="GET" && req.method!=="HEAD"){res.writeHead(405,{"Allow":"GET, HEAD"});res.end();return}
  const authorization=req.headers.authorization||"";
  const expected="Basic "+Buffer.from("control:"+password).toString("base64");
  if(!safeEqual(authorization,expected)){
    res.writeHead(401,{"WWW-Authenticate":'Basic realm="VPN Control (local)", charset="UTF-8"',
      "Cache-Control":"no-store"});res.end();return
  }
  let url;
  try{url=new URL(req.url,"http://127.0.0.1:"+port)}catch{res.writeHead(400);res.end();return}
  const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
   "Referrer-Policy":"no-referrer","X-Frame-Options":"DENY",
   "Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
  const send=(code,obj)=>{res.writeHead(code,{...headers,"Content-Type":"application/json; charset=utf-8"});if(req.method==="HEAD"){res.end();return}res.end(JSON.stringify(obj));};
  if(url.pathname==="/api/v1/state")return send(200,loadState());
  if(url.pathname==="/api/v1/checks"){const v=loadState();return send(200,{schemaVersion:1,checks:v.checks||[],sources:v.sources||[],stale:v.stale});}
  if(url.pathname==="/api/v1/compatibility"){
    const v=readJson(path.join(root,"compatibility.json"));
    return send(200,v?{...v,stale:stale(v)}:{schemaVersion:1,stale:true,status:"unverified",reason:"compatibility_report_missing"});
  }
  if(url.pathname==="/api/v1/events"){
    const raw=url.searchParams.get("limit")||"50";
    if(!/^[1-9]\d{0,2}$/.test(raw)||Number(raw)>200)return send(400,{error:"invalid_limit"});
    try{return send(200,{schemaVersion:1,events:read({limit:Number(raw)})})}
    catch{return send(503,{error:"journal_unavailable"})}
  }
  if(url.pathname==="/api/v1/provider-probe") {
    const v=readJson(path.join(root,"provider-probe.json"));
    return send(200,v?{...v,stale:stale({generatedAt:v.observedAt})}:{schemaVersion:1,status:"unverified",stale:true,reason:"probe_not_run"});
  }
  if(url.pathname==="/api/v1/backups"){
    const v=readJson(path.join(root,"backups.json"));
    return send(200,v?{...v,stale:stale(v)}:{schemaVersion:1,backups:[],stale:true,reason:"backup_index_missing"});
  }
  if(url.pathname==="/"||url.pathname==="/index.html"||url.pathname==="/app.js"||url.pathname==="/app.css"){
   const file=url.pathname==="/app.js"?"app.js":url.pathname==="/app.css"?"app.css":"index.html";
   const ct=file.endsWith(".js")?"text/javascript; charset=utf-8":file.endsWith(".css")?"text/css; charset=utf-8":"text/html; charset=utf-8";
   try{
    res.writeHead(200,{...headers,"Content-Type":ct});
    if(req.method==="HEAD"){res.end();return}
    const stream=fs.createReadStream(path.join(__dirname,"../public",file));
    // Erro de leitura é assíncrono: sem handler, derruba o processo (unhandled "error").
    stream.on("error",()=>{if(!res.headersSent){res.writeHead(500,{...headers,"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify({error:"static_unavailable"}))}else{res.destroy()}});
    res.on("error",()=>stream.destroy());
    stream.pipe(res);return;
   }
   catch{return send(500,{error:"static_unavailable"})}
  }
  return send(404,{error:"not_found"});
 });
}
function main(){
 const password=fs.readFileSync(passwordFile,"utf8").replace(/[\r\n]+$/,"");
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error("invalid_port");
 const bind=process.env.HOST_BIND_ADDRESS||"127.0.0.1";
 if(!["127.0.0.1","localhost","::1"].includes(bind))throw new Error("local_only_bind_required");
 const server=createServer({password});
 server.listen(port,"0.0.0.0",()=>process.stdout.write("VPN Control UI: listening on internal port "+port+"\n"));
}
if(require.main===module){try{main()}catch(e){process.stderr.write("vpn-control-ui: "+e.message+"\n");process.exitCode=1;}}
module.exports={createServer,loadState,stale,safeEqual,main};
