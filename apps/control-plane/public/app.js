"use strict";
const $=id=>document.getElementById(id);
const string=v=>v==null||v===""?"—":String(v);
const stateLabel={ok:"Saudável",degraded:"Degradado",down:"Indisponível",unknown:"Desconhecido"};
function badge(node,status){const value=stateLabel[status]?status:"unknown";node.className="status "+value;node.textContent=stateLabel[value]}
function text(id,value){$(id).textContent=string(value)}
function table(rows){
 if(!rows.length)return document.createTextNode("Nenhum registro.");
 const t=document.createElement("table");t.className="table";
 const head=document.createElement("thead");const tr=document.createElement("tr");
 rows[0].forEach((v)=>{const th=document.createElement("th");th.textContent=v;tr.append(th)});head.append(tr);t.append(head);
 const body=document.createElement("tbody");
 rows.slice(1).forEach(row=>{const tr=document.createElement("tr");row.forEach(v=>{const td=document.createElement("td");td.textContent=string(v);tr.append(td)});body.append(tr)});
 t.append(body);return t;
}
function mount(id,content){const el=$(id);el.replaceChildren(typeof content==="string"?document.createTextNode(content):content)}
function sparkline(values){
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.setAttribute("viewBox","0 0 320 64");svg.setAttribute("class","spark");
 svg.setAttribute("role","img");svg.setAttribute("aria-label","Série de latência recente");
 const valid=values.filter(v=>Number.isFinite(v));
 if(valid.length===0)return svg;
 const max=Math.max(...valid),min=Math.min(...valid),span=max-min||1;
 const step=valid.length>1?320/(valid.length-1):320;
 const points=valid.map((v,i)=>`${(i*step).toFixed(1)},${(60-((v-min)/span)*56).toFixed(1)}`).join(" ");
 const line=document.createElementNS("http://www.w3.org/2000/svg","polyline");
 line.setAttribute("points",points);line.setAttribute("class","spark-line");
 svg.append(line);return svg;
}
function historyPanel(history){
 const entries=Array.isArray(history&&history.entries)?history.entries:[];
 const latencies=entries.map(e=>e.latencyMs).filter(v=>Number.isFinite(v));
 if(history&&history.stale||!entries.length)return "Sem amostras de latência registradas.";
 const last=entries[entries.length-1];
 const box=document.createElement("div");
 const svg=sparkline(latencies);
 const min=Math.min(...latencies),max=Math.max(...latencies);
 svg.setAttribute("aria-label",`Latência recente: ${latencies.length} amostras, mínimo ${min}ms, máximo ${max}ms`);
 box.append(svg);
 const summary=document.createElement("p");summary.className="explain";
 summary.textContent=`${latencies.length} amostras · última ${last.timestamp||"—"} · ${last.latencyMs==null?"latência —":last.latencyMs+"ms"} · IP ${last.publicIp||"—"}`;
 box.append(summary);
 const rows=[["Data","Latência","IP"],...entries.slice(-10).map(e=>[e.timestamp||"—",e.latencyMs==null?"—":e.latencyMs+"ms",e.publicIp||"—"])];
 const details=document.createElement("details");
 const caption=document.createElement("summary");caption.textContent="Últimas amostras";
 details.append(caption);details.append(table(rows));
 box.append(details);
 return box;
}
async function get(path){const r=await fetch(path,{credentials:"same-origin",cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}
async function load(){
 $("refresh").disabled=true;
 try{
 const [state,compat,events,backups,provider,history]=await Promise.all([
 get("/api/v1/state"),get("/api/v1/compatibility"),get("/api/v1/events?limit=100"),get("/api/v1/backups"),get("/api/v1/provider-probe"),get("/api/v1/history?limit=60")]);
 badge($("overall"),state.overall);badge($("vpn-status"),state.components?.vpn?.status);
 badge($("oc-status"),state.components?.opencode?.status);
 text("vpn-provider",state.components?.vpn?.provider);text("vpn-type",state.components?.vpn?.type);
 text("vpn-ip",state.components?.vpn?.publicIp);text("vpn-location",state.components?.vpn?.location);
 text("oc-port",state.components?.opencode?.port==null?"—":"Porta "+state.components.opencode.port);
 text("oc-detail",state.components?.opencode?.detail);
 badge($("provider-status"),provider.stale?"unknown":provider.status==="accepted"?"ok":provider.status==="rejected"?"down":"unknown");
 text("provider-model",provider.model);
 text("provider-detail",provider.stale?"Sem resultado recente verificado":provider.reason+(provider.egressStable?" · IP "+provider.publicIp:" · IP não confirmado"));
 text("last-update",state.generatedAt?new Date(state.generatedAt).toLocaleString("pt-BR"):"Sem coleta");
 $("banner").textContent=state.stale?"Dados indisponíveis ou desatualizados. Verifique o observer e os containers.":"";
 mount("sources",table([["Coletor","Resultado","Falha"],...(state.sources||[]).map(s=>[s.name,s.status,s.error||"—"])]));
 const versions=compat.versions||{};
 mount("compat-result",compat.stale?"Relatório não disponível ou desatualizado. Execute opencode-compat --json no ambiente correspondente e publique apenas o resultado sanitizado.":table([["Versão","Instalada","Testada","Status","Plugin","Hooks runtime"],...Object.entries(versions).map(([key,v])=>[key,v.installed,v.expected,v.status,v.plugin?.status,v.verification?.runtimeHooks||"unverified"])]));
 mount("events-result",table([["Data","Evento","Origem","Verificação"],...(events.events||[]).map(e=>[e.occurredAt,e.type,e.source,e.verification])]));
 mount("history-result",historyPanel(history));
 mount("backups-result",backups.stale?"Índice de backups ainda não publicado.":table([["ID","Escopo","Data"],...(backups.backups||[]).map(b=>[b.id,b.scope,b.createdAt])]));
 }catch{
 $("banner").textContent="Não foi possível ler a API local. Confirme autenticação e estado do serviço.";
 }finally{$("refresh").disabled=false}
}
$("refresh").addEventListener("click",load);
load();
