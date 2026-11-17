"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {DatabaseSync}=require("node:sqlite");
const {create,list,loadBackup,restore,recover,plan}=require("../../apps/control-plane/lib/backup.cjs");
test("offline backup, checksum, pre-restore snapshot and rollback-safe restore",async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),"vpn-backup-test-"));
 const opts={home,backups:path.join(home,"backups"),offline:true};
 const root=path.join(home,".local/share/opencode");
 fs.mkdirSync(root,{recursive:true});
 const db=new DatabaseSync(path.join(root,"opencode.db"));
 db.exec("create table item (value text); insert into item values ('before')");
 db.close();
 try{
  const original=await create("v2",opts);
  assert.equal(loadBackup(original.id,opts).manifest.scope,"v2");
  assert.equal(list(opts).backups.length,1);
  const current=new DatabaseSync(path.join(root,"opencode.db"));
  current.exec("delete from item; insert into item values ('later')");current.close();
  assert.equal(plan(original.id,"v2",opts).preRestoreBackup,true);
  const restored=await restore(original.id,"v2",opts);
  assert.ok(restored.preRestoreId);
  const verify=new DatabaseSync(path.join(root,"opencode.db"),{readOnly:true});
  assert.equal(verify.prepare("select value from item").get().value,"before");verify.close();
  assert.equal(recover(opts).status,"clean");
  assert.equal(list(opts).backups.length,2);
 } finally{fs.rmSync(home,{recursive:true,force:true})}
});
test("checksum manipulation is detected",async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),"vpn-backup-test-")),opts={home,backups:path.join(home,"backups")};
 const root=path.join(home,".local/share/opencode");fs.mkdirSync(root,{recursive:true});
 const db=new DatabaseSync(path.join(root,"opencode.db"));db.exec("create table item (value text)");db.close();
 try{
  const r=await create("v2",opts);
  fs.appendFileSync(path.join(opts.backups,r.id,"opencode.db"),"corrupt");
  assert.throws(()=>loadBackup(r.id,opts),/checksum_or_manifest_mismatch/);
 }finally{fs.rmSync(home,{recursive:true,force:true})}
});

test("interrupted applying restore reverts original database from the recovery journal",async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),"vpn-recovery-test-"));
 const opts={home,backups:path.join(home,"backups")};
 const root=path.join(home,".local/share/opencode"),staging=path.join(home,"restore-staged");
 fs.mkdirSync(root,{recursive:true});fs.mkdirSync(staging,{recursive:true});
 const db=new DatabaseSync(path.join(root,"opencode.db"));
 db.exec("create table item (value text); insert into item values ('original')");db.close();
 try{
   const snap=await create("v2",opts);
   const undo=path.join(opts.backups,".undo-"+snap.id);
   fs.mkdirSync(undo,{recursive:true});
   const backupCopy=path.join(undo,"opencode.db");
   fs.renameSync(path.join(root,"opencode.db"),backupCopy);
   fs.writeFileSync(path.join(root,"opencode.db"),"interrupted-new-db");
   fs.writeFileSync(path.join(opts.backups,"restore-journal.json"),JSON.stringify({
     schemaVersion:1,phase:"applying",scope:"v2",backupId:snap.id,preRestoreId:snap.id,
     target:root,staging,originals:{"opencode.db":true,"opencode.db-wal":false,"opencode.db-shm":false,storage:false}
   }));
   assert.equal(recover(opts).status,"rolled_back");
   const verified=new DatabaseSync(path.join(root,"opencode.db"),{readOnly:true});
   assert.equal(verified.prepare("select value from item").get().value,"original");verified.close();
 }finally{fs.rmSync(home,{recursive:true,force:true})}
});
