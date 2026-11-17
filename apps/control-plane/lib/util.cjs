"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function runJson(command, args, options = {}) {
  return new Promise((resolve) => {
    const timeoutMs = options.timeoutMs || 8000;
    let stdout = "", done = false, exitCode = null, failure = null;
    let child;
    const finish = () => {
      if (done) return;
      done = true;
      let data = null;
      try { data = JSON.parse(stdout); } catch { failure = failure || "invalid_json"; }
      resolve({ data, exitCode, failure });
    };
    try {
      child = spawn(command, args, { shell: false, env: options.env || process.env, stdio: ["ignore","pipe","ignore"] });
    } catch { resolve({ data:null, exitCode:null, failure:"spawn_failed" }); return; }
    const timeout = setTimeout(() => { failure = "timeout"; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (piece) => {
      stdout += piece;
      if (stdout.length > 262144) { failure = "output_limit"; child.kill("SIGKILL"); }
    });
    child.on("error", () => { failure = "spawn_failed"; });
    child.on("close", (code) => {
      clearTimeout(timeout);
      exitCode = code;
      if (failure === "timeout" || failure === "output_limit" || failure === "spawn_failed") {
        resolve({data:null, exitCode, failure}); done = true; return;
      }
      finish();
    });
  });
}
function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function validIp(input) {
  if (typeof input !== "string" || input.length > 45 || !/^[0-9a-fA-F:.]+$/.test(input)) return false;
  const {isIP} = require("node:net");
  return isIP(input) !== 0;
}
function secureDir(directory) {
  fs.mkdirSync(directory, {recursive:true, mode:0o700});
  fs.chmodSync(directory, 0o700);
}
function writeAtomic(destination, data) {
  const dir = path.dirname(destination); secureDir(dir);
  const temp = path.join(dir, "." + path.basename(destination) + "." + process.pid + "." + require("node:crypto").randomBytes(4).toString("hex"));
  try {
    fs.writeFileSync(temp, data, {mode:0o600, flag:"wx"});
    fs.renameSync(temp, destination);
  } finally { try { fs.unlinkSync(temp); } catch {} }
}
function output(value) { process.stdout.write(JSON.stringify(value) + "\n"); }
module.exports = {runJson,isObject,validIp,secureDir,writeAtomic,output};
