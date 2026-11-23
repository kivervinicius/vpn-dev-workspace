import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { canonicalPath, homeConfig } from "../../scripts/opencode-session-sync.mjs"

const root = resolve(import.meta.dirname, "../..")

function writeExecutable(file, content) {
  writeFileSync(file, content)
  chmodSync(file, 0o755)
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "opencode-launcher-sync-"))
  const home = join(directory, "home")
  const bin = join(directory, "bin")
  const capture = join(directory, "paths.json")
  const importLog = join(directory, "imports.log")
  mkdirSync(home, { recursive: true })
  mkdirSync(bin, { recursive: true })

  writeExecutable(join(bin, "vpn-check"), "#!/usr/bin/env bash\nexit 0\n")
  writeExecutable(join(bin, "opencode-session-sync"), `#!/usr/bin/env bash\nexec node "${resolve(root, "scripts/opencode-session-sync.mjs")}" "$@"\n`)
  symlinkSync(resolve(root, "scripts/opencode-session-sync.mjs"), join(bin, "opencode-session-sync.mjs"))

  const fakeCli = `#!/usr/bin/env bash
set -eu
if [[ "$#" -eq 1 && "$1" == "--version" ]]; then echo "2.3.2"; exit 0; fi
if [[ "$#" -ge 2 && "$1" == "session" && "$2" == "list" ]]; then echo '[]'; exit 0; fi
if [[ "$#" -ge 1 && ( "$1" == "import" || ( "$1" == "session" && "$2" == "import" ) ) ]]; then
  printf '%s\\n' "$*" >> "$IMPORT_LOG"
  exit 0
fi
if [[ "$#" -eq 0 ]]; then
  first="$(opencode-session-sync status --client v1)"
  second="$(opencode-session-sync status --client v2)"
  printf '{"v1":%s,"v2":%s}\\n' "$first" "$second" > "$CAPTURE"
fi
`
  const v1Bin = join(home, ".opencode-v1", "bin", "opencode")
  const v2Bin = join(home, ".opencode", "bin", "opencode")
  mkdirSync(join(v1Bin, ".."), { recursive: true })
  mkdirSync(join(v2Bin, ".."), { recursive: true })
  writeExecutable(v1Bin, fakeCli)
  writeExecutable(v2Bin, fakeCli)

  return { directory, home, bin, capture, importLog, v1Bin, v2Bin }
}

function launcherEnv(fixture, additions = {}) {
  return {
    ...process.env,
    PATH: `${fixture.bin}:${process.env.PATH}`,
    HOME: fixture.home,
    OPENCODE_HOST_HOME: fixture.home,
    OPENCODE_V1_HOME: join(fixture.home, ".opencode-v1"),
    VPN_WORKSPACE_CONTAINER: "1",
    CAPTURE: fixture.capture,
    IMPORT_LOG: fixture.importLog,
    ...additions,
  }
}

test("opencode1 and opencode2 preserve distinct session databases with default and custom XDG paths", () => {
  const temporary = fixture()
  const customData = join(temporary.directory, "custom-xdg-data")
  const customConfig = join(temporary.directory, "custom-xdg-config")
  const customState = join(temporary.directory, "custom-xdg-state")

  for (const launcher of ["opencode1", "opencode2"]) {
    const result = spawnSync(resolve(root, `scripts/${launcher}`), [], {
      cwd: root,
      env: launcherEnv(temporary, {
        XDG_DATA_HOME: customData,
        XDG_CONFIG_HOME: customConfig,
        XDG_STATE_HOME: customState,
      }),
      encoding: "utf8",
      timeout: 30000,
    })
    assert.equal(result.status, 0, `${launcher}: ${result.stderr}`)
    const paths = JSON.parse(readFileSync(temporary.capture, "utf8"))
    assert.equal(paths.v1.database, join(temporary.home, ".opencode-v1", ".local", "share", "opencode", "opencode.db"))
    assert.equal(paths.v2.database, join(customData, "opencode", "opencode.db"))
    assert.notEqual(canonicalPath(paths.v1.database), canonicalPath(paths.v2.database))
  }
  assert.equal(existsSync(temporary.importLog), false)
})

test("session sync fails before writing when XDG redirects both clients to the same database", () => {
  const temporary = fixture()
  const sharedData = join(temporary.home, ".opencode-v1", ".local", "share")
  const result = spawnSync("node", [resolve(root, "scripts/opencode-session-sync.mjs"), "before", "--client", "v1", "--workspace", root], {
    cwd: root,
    env: launcherEnv(temporary, { OPENCODE_V2_XDG_DATA_HOME: sharedData }),
    encoding: "utf8",
    timeout: 30000,
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /same OpenCode database/)
  assert.equal(existsSync(temporary.importLog), false)
})

test("database path comparison resolves symlinked directories", () => {
  const temporary = fixture()
  const target = join(temporary.directory, "real-data")
  const alias = join(temporary.directory, "data-alias")
  mkdirSync(target)
  symlinkSync(target, alias)
  assert.equal(canonicalPath(join(target, "opencode", "opencode.db")), canonicalPath(join(alias, "opencode", "opencode.db")))
})

test("custom v2 XDG directories override defaults in helper configuration", () => {
  const temporary = fixture()
  const data = join(temporary.directory, "xdg-data")
  const config = join(temporary.directory, "xdg-config")
  const state = join(temporary.directory, "xdg-state")
  const saved = Object.fromEntries(["HOME", "OPENCODE_HOST_HOME", "OPENCODE_V1_HOME", "OPENCODE_V2_HOME", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "OPENCODE_V2_XDG_DATA_HOME", "OPENCODE_V2_XDG_CONFIG_HOME", "OPENCODE_V2_XDG_STATE_HOME"].map((key) => [key, process.env[key]]))
  try {
    process.env.HOME = temporary.home
    process.env.OPENCODE_HOST_HOME = temporary.home
    process.env.OPENCODE_V1_HOME = join(temporary.home, ".opencode-v1")
    process.env.OPENCODE_V2_HOME = temporary.home
    process.env.XDG_DATA_HOME = join(temporary.home, ".opencode-v1", ".local", "share")
    process.env.XDG_CONFIG_HOME = join(temporary.home, ".opencode-v1", ".config")
    process.env.XDG_STATE_HOME = join(temporary.home, ".opencode-v1", ".local", "state")
    process.env.OPENCODE_V2_XDG_DATA_HOME = data
    process.env.OPENCODE_V2_XDG_CONFIG_HOME = config
    process.env.OPENCODE_V2_XDG_STATE_HOME = state
    const paths = homeConfig("v2")
    assert.equal(paths.v2Data, data)
    assert.equal(paths.v2Config, config)
    assert.equal(paths.v2State, state)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
