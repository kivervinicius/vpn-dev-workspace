"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const {DatabaseSync,backup}=require("node:sqlite");
const {secureDir,writeAtomic,output}=require("./util.cjs");
const ITEMS=["opencode.db","opencode.db-wal","opencode.db-shm","storage"];
function context(options={}) {
 const home=path.resolve(options.home||process.env.VPN_BACKUP_HOME||process.env.HOME||"");
 if(home==="/")throw new Error("invalid_home");
 const root=path.resolve(options.backups||process.env.VPN_BACKUP_ROOT||path.join(home,".local/state/vpn-dev-workspace/backups"));
 return {home,root};
}
function source(scope,home) {
 if(scope!=="v1"&&scope!=="v2")throw new Error("invalid_scope");
 return path.join(home,scope==="v1"?".opencode-v1/.local/share/opencode":".local/share/opencode");
}
function idValid(id){return typeof id==="string"&&/^b-[0-9]{14}-[0-9a-f]{12}$/.test(id)}
function newId() {
 const stamp=new Date().toISOString().replace(/\D/g,"").slice(0,14);
 return "b-"+stamp+"-"+crypto.randomBytes(6).toString("hex");
}
function hash(file){return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}
function safeEntries(directory){
 if(!fs.existsSync(directory))return [];
 const st=fs.lstatSync(directory);
 if(!st.isDirectory()||st.isSymbolicLink())throw new Error("invalid_storage");
 const files=[];
 function walk(dir,relative) {
   for(const item of fs.readdirSync(dir,{withFileTypes:true})){
     if(item.isSymbolicLink())throw new Error("symlink_in_storage");
     const rel=path.join(relative,item.name),full=path.join(dir,item.name);
     if(item.isDirectory())walk(full,rel);
     else if(item.isFile()){
       if(["auth.json","credentials.json"].includes(item.name))throw new Error("sensitive_data_in_storage");
       files.push(rel);
       if(files.length>50000)throw new Error("too_many_storage_files");
     } else throw new Error("unexpected_storage_entry");
   }
 }
 walk(directory,"");
 return files;
}
function copyStorage(from,to){
 const files=safeEntries(from);
 for(const rel of files){
   const target=path.join(to,rel);
   fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
   fs.copyFileSync(path.join(from,rel),target);
   fs.chmodSync(target,0o600);
 }
 return files;
}
function enumerate(base){
 const results=[];
 function visit(dir,relative=""){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
   if(e.isSymbolicLink())throw new Error("backup_symlink_forbidden");
   const rel=path.posix.join(relative,e.name),full=path.join(dir,e.name);
   if(e.isDirectory())visit(full,rel);
   else if(e.isFile())results.push({path:rel,bytes:fs.statSync(full).size,sha256:hash(full)});
  }
 }
 visit(base);return results.sort((a,b)=>a.path.localeCompare(b.path));
}
function checkDb(filename){
 const db=new DatabaseSync(filename,{readOnly:true});
 try{const r=db.prepare("PRAGMA integrity_check").all();if(r.length!==1||r[0].integrity_check!=="ok")throw new Error("sqlite_integrity_failed")}
 finally{db.close()}
}
async function create(scope,options={}) {
 const ctx=context(options),from=source(scope,ctx.home);
 if(!fs.existsSync(path.join(from,"opencode.db")))throw new Error("database_missing");
 secureDir(ctx.root);
 const id=newId(),staging=path.join(ctx.root,".staging-"+id),final=path.join(ctx.root,id);
 if(fs.existsSync(staging)||fs.existsSync(final))throw new Error("id_collision");
 secureDir(staging);
 try{
   const sourceDb=new DatabaseSync(path.join(from,"opencode.db"),{readOnly:true});
   try{await backup(sourceDb,path.join(staging,"opencode.db"))}
   finally{sourceDb.close()}
   checkDb(path.join(staging,"opencode.db"));
   if(fs.existsSync(path.join(from,"storage")))copyStorage(path.join(from,"storage"),path.join(staging,"storage"));
   const manifest={schemaVersion:1,id,scope,createdAt:new Date().toISOString(),files:enumerate(staging)};
   writeAtomic(path.join(staging,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
   fs.renameSync(staging,final);
   exportIndex(ctx);
   return {id,scope,createdAt:manifest.createdAt,files:manifest.files.length,
      verified:true,verifiedMeaning:"file_hashes_and_sqlite_integrity",
      storageConsistency:"unverified",restorable:false};
 }catch(error){fs.rmSync(staging,{recursive:true,force:true});throw error}
}
function loadBackup(id,options={}) {
 const ctx=context(options);
 if(!idValid(id))throw new Error("invalid_backup_id");
 const base=path.join(ctx.root,id),file=path.join(base,"manifest.json");
 const manifest=JSON.parse(fs.readFileSync(file,"utf8"));
 if(manifest.schemaVersion!==1||manifest.id!==id||!["v1","v2"].includes(manifest.scope)||!Array.isArray(manifest.files))throw new Error("invalid_manifest");
 const actual=enumerate(base).filter(e=>e.path!=="manifest.json");
 const listed=manifest.files;
 if(JSON.stringify(actual)!==JSON.stringify(listed))throw new Error("checksum_or_manifest_mismatch");
 if(!listed.some(e=>e.path==="opencode.db"))throw new Error("missing_backup_database");
 checkDb(path.join(base,"opencode.db"));
 return {base,manifest};
}
function list(options={}) {
 const ctx=context(options);
 if(!fs.existsSync(ctx.root))return {schemaVersion:1,generatedAt:new Date().toISOString(),backups:[]};
 const rows=[];
 for(const id of fs.readdirSync(ctx.root)){
   if(!idValid(id))continue;
   try{const m=JSON.parse(fs.readFileSync(path.join(ctx.root,id,"manifest.json"),"utf8"));
     if(m.schemaVersion===1&&m.id===id) rows.push({id,scope:m.scope,createdAt:m.createdAt,files:m.files?.length||0});
   }catch{}
 }
 return {schemaVersion:1,generatedAt:new Date().toISOString(),backups:rows.sort((a,b)=>b.id.localeCompare(a.id))};
}
function exportIndex(ctx){
 try{
   const file=process.env.VPN_BACKUP_INDEX_FILE;
   if(file)writeAtomic(file,JSON.stringify(list(ctx))+"\n");
 }catch{ /* metadata publication must not invalidate backup */ }
}
function plan(id,scope,options={}) {
 const {manifest}=loadBackup(id,options);
 if(manifest.scope!==scope)throw new Error("scope_mismatch");
 const c=context(options),target=source(scope,c.home);
 return {schemaVersion:1,id,scope,files:manifest.files.length,
   targetPresent:fs.existsSync(path.join(target,"opencode.db")),
   requiresOffline:true,preRestoreBackup:true,rollbackAvailable:false,restoreSupported:false,
   warning:"This replaces the database and storage for the selected scope only."};
}
function recoveryFile(ctx){return path.join(ctx.root,"restore-journal.json")}
function recover(options={}) {
 const ctx=context(options),journalPath=recoveryFile(ctx);
 if(!fs.existsSync(journalPath))return {status:"clean"};
 const j=JSON.parse(fs.readFileSync(journalPath,"utf8"));
 if(j.schemaVersion!==1 || !["v1","v2"].includes(j.scope) || !idValid(j.backupId) || !idValid(j.preRestoreId))throw new Error("invalid_journal");
 if(j.phase==="committed"){
   fs.rmSync(path.join(ctx.root,".undo-"+j.backupId),{recursive:true,force:true});
   fs.rmSync(j.staging,{recursive:true,force:true});
   fs.unlinkSync(journalPath);
   return {status:"committed",preRestoreId:j.preRestoreId};
 }
 const target=source(j.scope,ctx.home);
 if(path.resolve(j.target)!==path.resolve(target))throw new Error("journal_target_mismatch");
 const undo=path.join(ctx.root,".undo-"+j.backupId);
 // Only overwrite targets which were already moved into undo. Never delete a live file
 // for a planned transaction that had not started.
 for(const item of ITEMS) {
   const original=path.join(undo,item),active=path.join(target,item);
   if(fs.existsSync(original)){
     fs.rmSync(active,{recursive:true,force:true});
     fs.renameSync(original,active);
   } else if(j.phase==="applying" && j.originals[item]===false){
     // This item was absent in the original state and was introduced by restore.
     fs.rmSync(active,{recursive:true,force:true});
   }
 }
 fs.rmSync(undo,{recursive:true,force:true});
 fs.rmSync(j.staging,{recursive:true,force:true});
 fs.unlinkSync(journalPath);
 return {status:"rolled_back",preRestoreId:j.preRestoreId};
}
async function restore(id,scope,options={}){
 // Fixture-only until all OpenCode/Windows writers share a proven exclusive lock.
 if(options.__fixtureRestoreOnly!==true)throw new Error("restore_disabled_pending_quiescence");
 const ctx=context(options);
 if(fs.existsSync(recoveryFile(ctx)))throw new Error("recovery_required");
 const {base}=loadBackup(id,options),target=source(scope,ctx.home);
 const p=plan(id,scope,options);
 if(!p.requiresOffline||!options.offline)throw new Error("offline_acknowledgement_required");
 if(!fs.existsSync(path.join(target,"opencode.db")))throw new Error("target_database_missing");
 // Validate and preserve the live state *before* attempting any replacement.
 const before=await create(scope,options);
 const staged=path.join(path.dirname(target),"."+path.basename(target)+"-restore-"+id);
 const undo=path.join(ctx.root,".undo-"+id);
 if(fs.existsSync(staged)||fs.existsSync(undo))throw new Error("staging_conflict");
 secureDir(staged);secureDir(undo);
 try {
   fs.copyFileSync(path.join(base,"opencode.db"),path.join(staged,"opencode.db"));
   if(fs.existsSync(path.join(base,"storage")))copyStorage(path.join(base,"storage"),path.join(staged,"storage"));
   checkDb(path.join(staged,"opencode.db"));
   const originals=Object.fromEntries(ITEMS.map(item=>[item,fs.existsSync(path.join(target,item))]));
   const j={schemaVersion:1,phase:"prepared",scope,backupId:id,preRestoreId:before.id,target,staging:staged,originals};
   writeAtomic(recoveryFile(ctx),JSON.stringify(j));
   j.phase="applying";writeAtomic(recoveryFile(ctx),JSON.stringify(j));
   for(const item of ITEMS)if(originals[item])fs.renameSync(path.join(target,item),path.join(undo,item));
   fs.renameSync(path.join(staged,"opencode.db"),path.join(target,"opencode.db"));
   if(fs.existsSync(path.join(staged,"storage")))fs.renameSync(path.join(staged,"storage"),path.join(target,"storage"));
   checkDb(path.join(target,"opencode.db"));
   j.phase="committed";writeAtomic(recoveryFile(ctx),JSON.stringify(j));
   fs.rmSync(undo,{recursive:true,force:true});
   fs.rmSync(staged,{recursive:true,force:true});
   fs.unlinkSync(recoveryFile(ctx));
   return {status:"restored",backupId:id,preRestoreId:before.id};
 }catch(error){
   try{
     const outcome=recover(options);
     if(outcome.status==="committed")return {status:"restored",backupId:id,preRestoreId:before.id};
   }catch{throw new Error("restore_failed_recovery_required")}
   throw error;
 }
}
function lockedRun(args,options={}){
 const c=context(options);secureDir(c.root);
 const script=process.argv[1];
 const result=spawnSync("flock",["-x","-w","5",path.join(c.root,"operation.lock"),process.execPath,script,"--locked",...args],
   {stdio:"inherit",env:process.env,timeout:180000});
 if(result.error)throw new Error("flock_unavailable");
 process.exitCode=result.status===null?1:result.status;
}
async function main(argv){
 if(argv.includes("--help")||argv.includes("-h")||!argv.length){
  process.stdout.write("Uso: vpn-backup create --scope v1|v2 --offline | list | verify --id ID | plan-restore --scope v1|v2 --id ID\nAviso: restore/recover bloqueados ate garantia de quiescence Windows/Linux. Integridade != consistencia de storage.\n");
  return;
 }
 const locked=argv[0]==="--locked";if(locked)argv.shift();
 const mutates=["create","restore","recover"].includes(argv[0]);
 if(mutates&&!locked){lockedRun(argv);return}
 const action=argv.shift(),args={};
 if(argv.length%2!==0 && argv[argv.length-1]!=="--offline")throw new Error("invalid_args");
 for(let i=0;i<argv.length;i++){
   if(argv[i]==="--offline"){args.offline=true;continue}
   if(!["--scope","--id"].includes(argv[i])||!argv[i+1])throw new Error("invalid_args");
   args[argv[i].slice(2)]=argv[++i];
 }
 let result;
 switch(action){
   case "create":if(!args.offline)throw new Error("offline_acknowledgement_required");result=await create(args.scope);break;
   case "list":result=list();break;
   case "verify":result={verified:true,id:loadBackup(args.id).manifest.id};break;
   case "plan-restore":result=plan(args.id,args.scope);break;
   case "restore":throw new Error("restore_disabled_pending_quiescence");
   case "recover":throw new Error("recover_disabled_pending_quiescence");
   default:throw new Error("unknown_action");
 }
 output(result);
}
module.exports={create,restore,recover,plan,loadBackup,list,main,context};
