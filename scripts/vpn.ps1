[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command,
    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$CommandArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($null -eq $CommandArgs) { $CommandArgs = @() }

$script:RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$script:ComposeFile = Join-Path $script:RootDir 'docker-compose.yml'
$script:WindowsComposeFile = Join-Path $script:RootDir 'compose.windows.yml'
$script:ProfilesDir = Join-Path $script:RootDir 'profiles'
$script:StateDir = Join-Path $script:RootDir '.vpn'
$script:BridgeStateFile = Join-Path $script:StateDir 'windows-ssh-agent.json'
$script:BridgeTokenFile = Join-Path $script:StateDir 'windows-ssh-agent.token'
$script:BridgeReadyFile = Join-Path $script:StateDir 'windows-ssh-agent.ready.json'
$script:AllowedProfiles = @(
    'nordvpn-openvpn', 'nordvpn-wireguard', 'protonvpn-openvpn',
    'protonvpn-wireguard', 'surfshark-openvpn', 'mullvad-wireguard',
    'custom-openvpn', 'custom-wireguard'
)

function Fail {
    param([string]$Message, [int]$Code = 1)
    [Console]::Error.WriteLine("Erro: $Message")
    exit $Code
}

function Show-Help {
    @'
Uso: .\scripts\vpn.ps1 <comando> [argumentos]

Ambiente:
  start|up <perfil>       valida segredos, inicia VPN e aplica hosts locais
  stop|down               para serviços e encerra a ponte SSH
  terminal|shell          abre Zsh dentro do terminal VPN
  status [opções]         consulta vpn-status
  check [opções]          consulta vpn-check
  top [opções]            abre o painel vpn-top
  reconnect               reconecta pelo controle do Gluetun
  rotate [opções]         troca servidor (--list|--random|--to <host>)
  opencode <modo>         web|serve|stop|status|logs
  hosts-import             importa /etc/hosts do Windows (--domain <sufixo>)
  hosts-apply              reaplica LOCAL_HOSTS nos contêineres ativos
  agent-start|agent-stop  gerencia a ponte para openssh-ssh-agent

O modo Windows exige Docker Desktop e Docker Compose >= 2.24.4. O workspace
Windows é montado em /workspace; a home Linux fica no volume vpn_windows_home.
'@ | Write-Output
}

function Get-ConfigValue {
    param(
        [Parameter(Mandatory = $true)] [string]$Name,
        [string]$Default = ''
    )
    $environment = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ($null -ne $environment) { return $environment }

    $envFile = Join-Path $script:RootDir '.env'
    if (Test-Path -LiteralPath $envFile -PathType Leaf) {
        foreach ($line in Get-Content -LiteralPath $envFile) {
            if ($line -match "^\s*$([regex]::Escape($Name))\s*=(.*)$") {
                $value = $Matches[1].Trim()
                if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
                return $value
            }
        }
    }
    return $Default
}

function Resolve-ProjectPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
    return [IO.Path]::GetFullPath((Join-Path $script:RootDir $Path))
}

function Ensure-DockerCompose {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Fail 'Docker Desktop não está disponível no PATH.' 2
    }
    $versionOutput = (& docker compose version --short 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { Fail 'não foi possível consultar a versão do Docker Compose.' 2 }
    if ($versionOutput -notmatch 'v?(\d+)\.(\d+)\.(\d+)') {
        Fail "versão do Docker Compose não reconhecida: $versionOutput" 2
    }
    $version = New-Object -TypeName System.Version -ArgumentList ([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
    $minimum = New-Object -TypeName System.Version -ArgumentList 2, 24, 4
    if ($version -lt $minimum) {
        Fail "Docker Compose $version encontrado; o modo Windows exige 2.24.4 ou superior para !override." 2
    }
}

function Set-WindowsComposeEnvironment {
    param(
        [Parameter(Mandatory = $true)] [string]$Workspace,
        [int]$BridgePort = 1,
        [string]$BridgeToken = '00000000000000000000000000000000'
    )
    $env:WINDOWS_WORKSPACE_DIR = $Workspace
    $env:WINDOWS_SSH_BRIDGE_HOST = 'host.docker.internal'
    $env:WINDOWS_SSH_BRIDGE_PORT = [string]$BridgePort
    $env:WINDOWS_SSH_BRIDGE_TOKEN = $BridgeToken
}

function Get-ComposeArguments {
    param([string]$Profile)
    $composeArgs = @('--profile', 'vpn', '-f', $script:ComposeFile, '-f', $script:WindowsComposeFile)
    if ($Profile) { $composeArgs += @('-f', (Join-Path $script:ProfilesDir "$Profile.yml")) }
    return $composeArgs
}

function Invoke-Compose {
    param(
        [Parameter(Mandatory = $true)] [string[]]$Arguments,
        [switch]$IgnoreFailure
    )
    & docker compose @Arguments
    $code = $LASTEXITCODE
    if (-not $IgnoreFailure -and $code -ne 0) { throw "docker compose falhou (exit $code)." }
    return $code
}

function Validate-Profile {
    param([string]$Profile)
    if (-not $Profile -or $script:AllowedProfiles -notcontains $Profile) {
        Fail "perfil inválido: '$Profile'. Use: $($script:AllowedProfiles -join '|')." 2
    }
    $profileFile = Join-Path $script:ProfilesDir "$Profile.yml"
    if (-not (Test-Path -LiteralPath $profileFile -PathType Leaf)) { Fail "perfil ausente: $profileFile" }
}

function Get-ProfileSecretNames {
    param([Parameter(Mandatory = $true)] [string]$Profile)
    $required = @('GLUETUN_API_KEY_FILE')
    switch ($Profile) {
        'nordvpn-openvpn' { $required += 'NORDVPN_USER_FILE', 'NORDVPN_PASSWORD_FILE' }
        'nordvpn-wireguard' { $required += 'NORDVPN_WIREGUARD_PRIVATE_KEY_FILE' }
        'protonvpn-openvpn' { $required += 'PROTONVPN_USER_FILE', 'PROTONVPN_PASSWORD_FILE' }
        'protonvpn-wireguard' { $required += 'PROTONVPN_WIREGUARD_PRIVATE_KEY_FILE' }
        'surfshark-openvpn' { $required += 'SURFSHARK_USER_FILE', 'SURFSHARK_PASSWORD_FILE' }
        'mullvad-wireguard' { $required += 'MULLVAD_WIREGUARD_PRIVATE_KEY_FILE' }
        'custom-openvpn' { $required += 'CUSTOM_OPENVPN_CONFIG_FILE', 'CUSTOM_OPENVPN_USER_FILE', 'CUSTOM_OPENVPN_PASSWORD_FILE' }
        'custom-wireguard' { $required += 'CUSTOM_WIREGUARD_CONFIG_FILE' }
    }
    return $required
}

function Validate-ProfileSecrets {
    param([Parameter(Mandatory = $true)] [string]$Profile)
    foreach ($name in Get-ProfileSecretNames $Profile) {
        $configured = Get-ConfigValue $name
        if (-not $configured) { Fail "$name não está configurado em .env ou no ambiente." 1 }
        $path = Resolve-ProjectPath $configured
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Fail "arquivo de segredo ausente: $path" 1 }
        if ((Get-Item -LiteralPath $path).Length -eq 0) { Fail "arquivo de segredo vazio: $path" 1 }
    }
}

function Get-PortBounds {
    param([string]$PortRange)
    if ($PortRange -match '^([1-9][0-9]{0,4})-([1-9][0-9]{0,4})$') {
        $start = [int]$Matches[1]; $end = [int]$Matches[2]
    } elseif ($PortRange -match '^[1-9][0-9]{0,4}$') {
        $start = [int]$PortRange; $end = $start
    } else { Fail "VPN_PORT_RANGE inválida: $PortRange" 2 }
    if ($start -gt $end -or $end -gt 65535) { Fail "VPN_PORT_RANGE fora de 1-65535: $PortRange" 2 }
    return @($start, $end)
}

function Get-CurrentProjectPublishedPorts {
    $project = Split-Path -Leaf $script:RootDir
    $ports = @()
    $containers = @(& docker ps -q --filter "label=com.docker.compose.project=$project" 2>$null)
    foreach ($container in $containers) {
        foreach ($line in @(& docker port $container 2>$null)) {
            if ($line -match ':(\d+)(?:$|\s)') { $ports += [int]$Matches[1] }
        }
    }
    return $ports | Select-Object -Unique
}

function Validate-PortRange {
    $bindAddress = Get-ConfigValue 'HOST_BIND_ADDRESS' '127.0.0.1'
    if ($bindAddress -eq '0.0.0.0' -or $bindAddress -eq '::') { Fail 'use um IP específico em HOST_BIND_ADDRESS; 0.0.0.0/:: expõe as portas publicamente.' 2 }
    $range = Get-ConfigValue 'VPN_PORT_RANGE' '10000-10100'
    $bounds = Get-PortBounds $range
    $busy = @()
    $currentProjectPorts = @(Get-CurrentProjectPublishedPorts)
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        for ($port = $bounds[0]; $port -le $bounds[1]; $port++) {
            $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
            if ($listeners.Count -gt 0 -and $currentProjectPorts -notcontains $port) { $busy += $port }
        }
    }
    if ($busy.Count -gt 0) { Fail "portas TCP ocupadas no Windows: $($busy -join ', '). Escolha outra VPN_PORT_RANGE." 1 }

    $proxy = Get-ConfigValue 'VPN_HTTP_PROXY' 'off'
    if ($proxy.ToLowerInvariant() -eq 'on') {
        $proxyPortText = Get-ConfigValue 'VPN_HTTP_PROXY_PORT' '10080'
        if ($proxyPortText -notmatch '^[1-9][0-9]{0,4}$' -or [int]$proxyPortText -gt 65535) { Fail "VPN_HTTP_PROXY_PORT inválida: $proxyPortText" 2 }
        $proxyPort = [int]$proxyPortText
        if ($proxyPort -lt $bounds[0] -or $proxyPort -gt $bounds[1]) { Fail "VPN_HTTP_PROXY_PORT ($proxyPort) fora de VPN_PORT_RANGE ($range)." 2 }
    }
}

function Test-WindowsSshAgent {
    $pipe = $null
    try {
        $pipe = New-Object -TypeName System.IO.Pipes.NamedPipeClientStream -ArgumentList '.', 'openssh-ssh-agent', ([System.IO.Pipes.PipeDirection]::InOut)
        $pipe.Connect(1000)
        return $true
    } catch { return $false }
    finally { if ($null -ne $pipe) { $pipe.Dispose() } }
}

function Quote-ProcessArgument {
    param([string]$Value)
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Get-BridgeInfo {
    if (-not (Test-Path -LiteralPath $script:BridgeStateFile -PathType Leaf)) { return $null }
    try {
        $state = Get-Content -LiteralPath $script:BridgeStateFile -Raw | ConvertFrom-Json
        $process = Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
        if ($null -eq $process -or -not (Test-Path -LiteralPath $state.tokenFile -PathType Leaf)) { return $null }
        $token = (Get-Content -LiteralPath $state.tokenFile -Raw).Trim()
        return [pscustomobject]@{ pid = [int]$state.pid; port = [int]$state.port; token = $token; tokenFile = $state.tokenFile }
    } catch { return $null }
}

function Start-SshAgentBridge {
    if (-not (Test-WindowsSshAgent)) {
        throw 'O agente OpenSSH do Windows não está disponível em \\.\pipe\openssh-ssh-agent. Inicie o serviço ssh-agent e carregue uma chave com ssh-add antes de usar o modo Windows.'
    }
    $existing = Get-BridgeInfo
    if ($null -ne $existing) { return $existing }
    Stop-SshAgentBridge
    New-Item -ItemType Directory -Path $script:StateDir -Force | Out-Null
    $token = ([Guid]::NewGuid().ToString('N'))
    [IO.File]::WriteAllText($script:BridgeTokenFile, $token, (New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false))
    Remove-Item -LiteralPath $script:BridgeReadyFile -Force -ErrorAction SilentlyContinue
    $powershell = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
    if (-not $powershell) { $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' }
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $script:RootDir 'scripts/vpn-ssh-agent-bridge.ps1'), '-TokenFile', $script:BridgeTokenFile, '-ReadyFile', $script:BridgeReadyFile)
    $argumentLine = (($arguments | ForEach-Object { Quote-ProcessArgument $_ }) -join ' ')
    $process = Start-Process -FilePath $powershell -ArgumentList $argumentLine -WindowStyle Hidden -PassThru
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        Start-Sleep -Milliseconds 100
        if (Test-Path -LiteralPath $script:BridgeReadyFile -PathType Leaf) { break }
        if ($process.HasExited) { throw 'A ponte SSH encerrou antes de publicar a porta TCP.' }
    }
    if (-not (Test-Path -LiteralPath $script:BridgeReadyFile -PathType Leaf)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw 'Tempo limite iniciando a ponte SSH do Windows.'
    }
    $ready = Get-Content -LiteralPath $script:BridgeReadyFile -Raw | ConvertFrom-Json
    $state = [ordered]@{ pid = $process.Id; port = [int]$ready.port; tokenFile = $script:BridgeTokenFile }
    [IO.File]::WriteAllText($script:BridgeStateFile, ($state | ConvertTo-Json -Compress), (New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false))
    return [pscustomobject]@{ pid = $process.Id; port = [int]$ready.port; token = $token; tokenFile = $script:BridgeTokenFile }
}

function Stop-SshAgentBridge {
    $state = Get-BridgeInfo
    if ($null -ne $state) { Stop-Process -Id $state.pid -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $script:BridgeStateFile, $script:BridgeReadyFile, $script:BridgeTokenFile -Force -ErrorAction SilentlyContinue
}

function Set-ActiveComposeEnvironment {
    param([switch]$StartBridge)
    $workspace = [IO.Path]::GetFullPath($script:RootDir)
    if ($StartBridge) {
        $bridge = Start-SshAgentBridge
        Set-WindowsComposeEnvironment -Workspace $workspace -BridgePort $bridge.port -BridgeToken $bridge.token
        return $bridge
    }
    $bridge = Get-BridgeInfo
    if ($null -ne $bridge) {
        Set-WindowsComposeEnvironment -Workspace $workspace -BridgePort $bridge.port -BridgeToken $bridge.token
    } else {
        Set-WindowsComposeEnvironment -Workspace $workspace
    }
    return $bridge
}

function Get-LocalHostEntries {
    $raw = Get-ConfigValue 'LOCAL_HOSTS'
    if (-not $raw.Trim()) { return @() }
    $entries = @()
    foreach ($part in ($raw -split ',')) {
        foreach ($token in ($part.Trim() -split '\s+')) {
            if (-not $token) { continue }
            if ($token -notmatch '^([^=]+)=(.+)$') { Fail "entrada LOCAL_HOSTS inválida: $token" 2 }
            $name = $Matches[1].Trim(); $ip = $Matches[2].Trim()
            $parsedIp = $null
            if (-not [Net.IPAddress]::TryParse($ip, [ref]$parsedIp)) { Fail "IP inválido em LOCAL_HOSTS: $ip" 2 }
            if ($name -notmatch '^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$' -or $name.Contains('..') -or $name.Contains('*')) { Fail "hostname inválido em LOCAL_HOSTS: $name" 2 }
            $entries = @($entries | Where-Object { $_.name -ne $name })
            $entries += [pscustomobject]@{ name = $name; ip = $ip }
        }
    }
    return $entries
}

function Apply-LocalHosts {
    $entries = @(Get-LocalHostEntries)
    if ($entries.Count -eq 0) { Write-Output 'Sem LOCAL_HOSTS; nada a aplicar.'; return }
    $compose = Get-ComposeArguments
    foreach ($service in @('terminal', 'vpn-auto-reconnect')) {
        $idOutput = @(& docker compose @($compose + @('ps', '-q', $service)) 2>$null | Select-Object -First 1)
        $id = if ($idOutput.Count -gt 0) { [string]$idOutput[0].Trim() } else { '' }
        if (-not $id) { throw "contêiner '$service' não está ativo para aplicar LOCAL_HOSTS." }
        foreach ($entry in $entries) {
            $ipPattern = [regex]::Escape($entry.ip)
            $namePattern = [regex]::Escape($entry.name)
            $pattern = '^' + $ipPattern + '[[:space:]]+' + $namePattern + '([[:space:]]|$)'
            & docker exec -u 0 $id sh -c "grep -Eq '$pattern' /etc/hosts" 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Output "[$service] $($entry.name) já mapeado; pulando."
            } else {
                & docker exec -u 0 $id sh -c "printf '%s %s\n' '$($entry.ip)' '$($entry.name)' >> /etc/hosts"
                if ($LASTEXITCODE -ne 0) { throw "falha aplicando $($entry.name) em $service." }
                Write-Output "[$service] $($entry.ip) $($entry.name) aplicado."
            }
        }
    }
}

function Wait-ForHealthyVpn {
    param([Parameter(Mandatory = $true)] [string[]]$Compose)
    $id = ''
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $idOutput = @(& docker compose @($Compose + @('ps', '-q', 'vpn')) 2>$null | Select-Object -First 1)
        $id = if ($idOutput.Count -gt 0) { [string]$idOutput[0].Trim() } else { '' }
        if ($id) {
            $health = (& docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' $id 2>$null | Out-String).Trim()
            if ($health -eq 'healthy') { return }
            if ($health -eq 'unhealthy') { throw 'o perfil VPN falhou no healthcheck; consulte docker compose logs vpn.' }
        }
        Start-Sleep -Seconds 2
    }
    throw 'tempo limite aguardando o healthcheck do perfil VPN.'
}

function Start-Vpn {
    param([string]$Profile)
    Validate-Profile $Profile
    Ensure-DockerCompose
    Validate-ProfileSecrets $Profile
    Validate-PortRange
    if (-not (Get-ConfigValue 'FIREWALL_SUBNETS')) { Write-Warning 'FIREWALL_SUBNETS não definido: a LAN do Windows permanecerá bloqueada. Configure a sub-rede explicitamente se precisar de acesso interno.' }
    if (Get-ConfigValue 'INTERNAL_DNS') {
        $env:DNS_UPSTREAM_RESOLVER_TYPE = 'plain'
        if ((Get-ConfigValue 'INTERNAL_DNS_RESOLVERS').Trim()) { Write-Warning 'INTERNAL_DNS ativo: deixe INTERNAL_DNS_RESOLVERS vazio para usar somente o upstream plain.' }
    }
    $bridge = Set-ActiveComposeEnvironment -StartBridge
    $compose = Get-ComposeArguments $Profile
    try {
        Invoke-Compose -Arguments @($compose + @('config', '--quiet')) | Out-Null
        Invoke-Compose -Arguments @($compose + @('down', '--remove-orphans')) | Out-Null
        Invoke-Compose -Arguments @($compose + @('up', '-d', '--build', '--remove-orphans')) | Out-Null
        Wait-ForHealthyVpn $compose
        Write-Output "Perfil $Profile conectado no Docker Desktop."
        Apply-LocalHosts
    } catch {
        Stop-SshAgentBridge
        throw
    }
}

function Stop-Vpn {
    param([string]$Profile)
    Ensure-DockerCompose
    Set-ActiveComposeEnvironment | Out-Null
    if ($Profile) { Validate-Profile $Profile }
    $compose = Get-ComposeArguments $Profile
    try { Invoke-Compose -Arguments @($compose + @('down', '--remove-orphans')) | Out-Null }
    finally { Stop-SshAgentBridge }
}

function Invoke-TerminalScript {
    param([Parameter(Mandatory = $true)] [string]$Script, [string[]]$Arguments = @())
    Ensure-DockerCompose
    Set-ActiveComposeEnvironment | Out-Null
    $compose = Get-ComposeArguments
    Invoke-Compose -Arguments @($compose + @('exec', 'terminal', $Script) + $Arguments) | Out-Null
}

function Open-Terminal {
    Ensure-DockerCompose
    Set-ActiveComposeEnvironment | Out-Null
    $compose = Get-ComposeArguments
    & docker compose @($compose + @('exec', 'terminal', 'zsh'))
    exit $LASTEXITCODE
}

function Import-WindowsHosts {
    param([string[]]$Arguments)
    $domain = ''
    $hostsFile = if ($env:SystemRoot) { Join-Path $env:SystemRoot 'System32\drivers\etc\hosts' } else { '/etc/hosts' }
    for ($i = 0; $i -lt $Arguments.Count; $i++) {
        switch ($Arguments[$i]) {
            '--domain' { if ($i + 1 -ge $Arguments.Count) { Fail '--domain exige um valor.' 2 }; $domain = $Arguments[++$i] }
            '--hosts-file' { if ($i + 1 -ge $Arguments.Count) { Fail '--hosts-file exige um valor.' 2 }; $hostsFile = $Arguments[++$i] }
            '-h' { Show-Help; exit 0 }
            '--help' { Show-Help; exit 0 }
            default { Fail "argumento desconhecido: $($Arguments[$i])" 2 }
        }
    }
    if (-not $domain -or $domain.Contains('*')) { Fail 'use --domain <sufixo> sem curingas.' 2 }
    if (-not (Test-Path -LiteralPath $hostsFile -PathType Leaf)) { Fail "arquivo hosts ausente: $hostsFile" 1 }
    $found = @{}
    foreach ($line in Get-Content -LiteralPath $hostsFile) {
        $clean = ($line -split '#', 2)[0].Trim()
        if (-not $clean) { continue }
        $fields = $clean -split '\s+'
        if ($fields.Count -lt 2) { continue }
        foreach ($name in $fields[1..($fields.Count - 1)]) {
            if ($name.ToLowerInvariant() -eq $domain.ToLowerInvariant() -or $name.ToLowerInvariant().EndsWith('.' + $domain.ToLowerInvariant())) {
                $found[$name.ToLowerInvariant()] = "$name=$($fields[0])"
            }
        }
    }
    if ($found.Count -eq 0) { Fail "nenhuma entrada *.$domain encontrada em $hostsFile" 1 }
    Write-Output ('# Cole no .env:')
    Write-Output ('LOCAL_HOSTS=' + (($found.Values | Sort-Object) -join ','))
}

function Invoke-OpenCode {
    param([string[]]$Arguments)
    if ($Arguments.Count -eq 0 -or @('web', 'serve', 'stop', 'status', 'logs') -notcontains $Arguments[0]) { Fail 'use opencode web|serve|stop|status|logs.' 2 }
    $mode = $Arguments[0]
    $portText = Get-ConfigValue 'OPENCODE_GUI_PORT' '10001'
    if ($portText -notmatch '^[1-9][0-9]{0,4}$') { Fail "OPENCODE_GUI_PORT inválida: $portText" 2 }
    $port = [int]$portText
    $detach = $false; $tail = '50'
    for ($i = 1; $i -lt $Arguments.Count; $i++) {
        switch ($Arguments[$i]) {
            '--detach' { $detach = $true }
            '-d' { $detach = $true }
            '--port' {
                if ($i + 1 -ge $Arguments.Count) { Fail '--port exige valor.' 2 }
                $portText = $Arguments[++$i]
                if ($portText -notmatch '^[1-9][0-9]{0,4}$') { Fail "porta inválida: $portText" 2 }
                $port = [int]$portText
            }
            '--tail' {
                if ($i + 1 -ge $Arguments.Count) { Fail '--tail exige valor.' 2 }
                $tail = $Arguments[++$i]
                if ($tail -notmatch '^[1-9][0-9]*$') { Fail "--tail inválido: $tail" 2 }
            }
            '-h' { Show-Help; exit 0 }
            '--help' { Show-Help; exit 0 }
            default { Fail "opção desconhecida: $($Arguments[$i])" 2 }
        }
    }
    if ($port -lt 1 -or $port -gt 65535) { Fail "porta inválida: $port" 2 }
    Ensure-DockerCompose; Set-ActiveComposeEnvironment | Out-Null
    $compose = Get-ComposeArguments
    if ($mode -eq 'logs') { Invoke-Compose -Arguments @($compose + @('logs', '--tail', $tail, 'terminal')) | Out-Null; return }
    if ($mode -eq 'status') {
        if (Get-Command Test-NetConnection -ErrorAction SilentlyContinue) {
            $ok = (Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue)
        } else { $ok = $false }
        if ($ok) { Write-Output "OpenCode ouvindo em 127.0.0.1:$port (pela VPN)." } else { Fail "nada ouvindo em 127.0.0.1:$port" 1 }
        return
    }
    if ($mode -eq 'stop') {
        $command = 'for d in /proc/[0-9]*; do if tr "\0" " " < "$d/cmdline" 2>/dev/null | grep -Eq "opencode (web|serve)"; then kill "${d#/proc/}" 2>/dev/null || true; fi; done'
        Invoke-Compose -Arguments @($compose + @('exec', 'terminal', 'sh', '-c', $command)) | Out-Null
        return
    }
    $exec = @('exec')
    if ($detach) { $exec += '-d' }
    $passwordPath = Get-ConfigValue 'OPENCODE_GUI_PASSWORD_FILE' (Join-Path $script:RootDir '.secrets\opencode_gui_password')
    $passwordPath = Resolve-ProjectPath $passwordPath
    if (Test-Path -LiteralPath $passwordPath -PathType Leaf) {
        $password = (Get-Content -LiteralPath $passwordPath -Raw).Trim()
        if ($password) { $exec += @('-e', "OPENCODE_SERVER_PASSWORD=$password", '-e', 'OPENCODE_SERVER_USER=opencode') }
    } else { Write-Warning "sem arquivo de senha em $passwordPath; o painel ficará sem autenticação." }
    $exec += @('terminal', 'opencode', $mode, '--port', [string]$port, '--hostname', '0.0.0.0')
    & docker compose @($compose + $exec)
    exit $LASTEXITCODE
}

try {
    $name = if ($Command) { $Command.ToLowerInvariant() } else { 'help' }
    switch ($name) {
        { $_ -in @('help', '-h', '--help') } { Show-Help; exit 0 }
        { $_ -in @('start', 'up') } { if ($CommandArgs.Count -ne 1) { Fail 'start exige exatamente um perfil.' 2 }; Start-Vpn $CommandArgs[0] }
        { $_ -in @('stop', 'down') } {
            if ($CommandArgs.Count -gt 1) { Fail 'stop aceita no máximo um perfil.' 2 }
            $stopProfile = $null
            if ($CommandArgs.Count -eq 1) { $stopProfile = $CommandArgs[0] }
            Stop-Vpn $stopProfile
        }
        { $_ -in @('terminal', 'shell') } { Open-Terminal }
        'status' { Invoke-TerminalScript 'vpn-status' $CommandArgs }
        'check' { Invoke-TerminalScript 'vpn-check' $CommandArgs }
        'top' { Invoke-TerminalScript 'vpn-top' $CommandArgs }
        'reconnect' { Invoke-TerminalScript 'vpn-reconnect' $CommandArgs }
        'rotate' { Invoke-TerminalScript 'vpn-server-rotate' $CommandArgs }
        'opencode' { Invoke-OpenCode $CommandArgs }
        'hosts-import' { Import-WindowsHosts $CommandArgs }
        'hosts-apply' { Ensure-DockerCompose; Set-ActiveComposeEnvironment | Out-Null; Apply-LocalHosts }
        'agent-start' { Ensure-DockerCompose; $bridge = Start-SshAgentBridge; Write-Output "Ponte SSH ativa na porta $($bridge.port)." }
        'agent-stop' { Stop-SshAgentBridge; Write-Output 'Ponte SSH encerrada.' }
        default { Fail "comando desconhecido: $Command" 2 }
    }
} catch {
    [Console]::Error.WriteLine("Erro: $($_.Exception.Message)")
    exit 1
}
