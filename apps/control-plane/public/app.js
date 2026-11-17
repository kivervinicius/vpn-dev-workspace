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
async function get(path){const r=await fetch(path,{credentials:"same-origin",cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}
async function load(){
 $("refresh").disabled=true;
 try{
 const [state,compat,events,backups]=await Promise.all([
 get("/api/v1/state"),get("/api/v1/compatibility"),get("/api/v1/events?limit=100"),get("/api/v1/backups")]);
 badge($("overall"),state.overall);badge($("vpn-status"),state.components?.vpn?.status);
 badge($("oc-status"),state.components?.opencode?.status);
 text("vpn-provider",state.components?.vpn?.provider);text("vpn-type",state.components?.vpn?.type);
 text("vpn-ip",state.components?.vpn?.publicIp);text("vpn-location",state.components?.vpn?.location);
 text("oc-port",state.components?.opencode?.port==null?"—":"Porta "+state.components.opencode.port);
 text("oc-detail",state.components?.opencode?.detail);
 text("last-update",state.generatedAt?new Date(state.generatedAt).toLocaleString("pt-BR"):"Sem coleta");
 $("banner").textContent=state.stale?"Dados indisponíveis ou desatualizados. Verifique o observer e os containers.":"";
 mount("sources",table([["Coletor","Resultado","Falha"],...(state.sources||[]).map(s=>[s.name,s.status,s.error||"—"])]));
 const versions=compat.versions||{};
 mount("compat-result",compat.stale?"Relatório não disponível ou desatualizado. Execute opencode-compat --json no ambiente correspondente e publique apenas o resultado sanitizado.":table([["Versão","Instalada","Esperada","Plugin"],...Object.entries(versions).map(([key,v])=>[key,v.installed,v.expected,v.plugin?.status])]));
 mount("events-result",table([["Data","Evento","Origem","Verificação"],...(events.events||[]).map(e=>[e.occurredAt,e.type,e.source,e.verification])]));
 mount("backups-result",backups.stale?"Índice de backups ainda não publicado.":table([["ID","Escopo","Data"],...(backups.backups||[]).map(b=>[b.id,b.scope,b.createdAt])]));
 }catch{
 $("banner").textContent="Não foi possível ler a API local. Confirme autenticação e estado do serviço.";
 }finally{$("refresh").disabled=false}
}
$("refresh").addEventListener("click",load);
load();
