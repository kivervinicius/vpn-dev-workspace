import { spawn } from "node:child_process"
import { classifyV2Error } from "./classify.js"

const RECOVERABLE = new Set(["free_tier_limit", "rate_limit"])

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function runRecovery(eventClass) {
  return new Promise((resolve, reject) => {
    const recoveryBin = process.env.OPENCODE_LIMIT_RECOVER_BIN || "/usr/local/bin/opencode-limit-recover"
    const child = spawn(recoveryBin, ["--event", eventClass], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      finish(new Error("recovery timeout"))
    }, 600_000)
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", () => finish(new Error("recovery process failed")))
    child.on("close", (code) => {
      let result
      try {
        result = JSON.parse(stdout)
      } catch {
        finish(new Error("invalid recovery response"))
        return
      }
      const expectedKeys = ["status", "reason", "before_ip", "after_ip", "target"]
      if (!object(result) || Object.keys(result).length !== expectedKeys.length ||
          expectedKeys.some((key) => !Object.hasOwn(result, key)) ||
          !["changed", "skipped", "failed"].includes(result.status) ||
          typeof result.reason !== "string" || !result.reason ||
          typeof result.before_ip !== "string" || typeof result.after_ip !== "string" ||
          typeof result.target !== "string" ||
          (result.status === "changed" && (!result.target || !result.before_ip || !result.after_ip || result.before_ip === result.after_ip))) {
        finish(new Error("invalid recovery response"))
        return
      }
      if ((code === 0 && ["changed", "skipped"].includes(result.status)) ||
          (code === 1 && result.status === "failed") || (code === 75 && result.status === "skipped")) {
        finish(undefined, result)
        return
      }
      finish(new Error(stderr.trim() ? "recovery process failed" : "inconsistent recovery exit status"))
    })
  })
}

function recoveryMessage(result) {
  if (result.status === "changed") return `IP de saída mudou após solicitar ${result.target}. Reenvie manualmente.`
  if (result.status === "skipped") return `Recuperação VPN ignorada (${result.reason}).`
  return `Recuperação VPN falhou (${result.reason}).`
}

function notification(eventClass) {
  switch (eventClass) {
    case "free_tier_limit": return "Limite estruturado do plano gratuito detectado."
    case "rate_limit": return "Limite estruturado de requisições (HTTP 429) detectado."
    case "account_limit": return "Limite da conta detectado; a VPN não foi alterada."
    case "credit_limit": return "Limite de crédito detectado; a VPN não foi alterada."
    default: return "Limite do provider detectado; a VPN não foi alterada."
  }
}

export function setupTuiPlugin(ctx) {
  const handledSessions = new Set()
  const listener = async (event) => {
    const data = event?.data
    const sessionID = data?.sessionID
    if (!data || typeof sessionID !== "string" || !sessionID || handledSessions.has(sessionID)) return
    const eventClass = classifyV2Error(data.error)
    if (!eventClass) return
    handledSessions.add(sessionID)
    try {
      let message = notification(eventClass)
      let variant = "info"
      if (RECOVERABLE.has(eventClass)) {
        try {
          const result = await runRecovery(eventClass)
          message = recoveryMessage(result)
          if (result.status === "failed") variant = "error"
          else if (result.status === "changed") variant = "success"
        } catch {
          message = "Recuperação VPN falhou. Nenhuma mensagem foi reenviada."
          variant = "error"
        }
      }
      try {
        await ctx.ui.toast.show({ sessionID, title: "VPN recovery", message, variant, duration: 8000 })
      } catch {
        // Notification delivery does not repeat recovery.
      }
    } finally {
      handledSessions.delete(sessionID)
    }
  }
  const unsubscribe = ctx.data.on("session.execution.failed", listener)
  return () => {
    if (typeof unsubscribe === "function") unsubscribe()
    else unsubscribe?.dispose?.()
  }
}
