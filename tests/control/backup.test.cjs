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
