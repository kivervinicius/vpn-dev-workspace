BeforeAll {
    $script:ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $script:VpnScript = Join-Path $script:ProjectRoot 'scripts\vpn.ps1'
    $script:PowerShellExecutable = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
    if (-not $script:PowerShellExecutable) { $script:PowerShellExecutable = (Get-Command powershell -ErrorAction Stop).Source }
    $script:TempRoot = Join-Path ([IO.Path]::GetTempPath()) ('vpn-tests-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $script:TempRoot -Force | Out-Null
    $script:MockBin = Join-Path $script:TempRoot 'bin'
    New-Item -ItemType Directory -Path $script:MockBin -Force | Out-Null
    $script:MockLog = Join-Path $script:TempRoot 'docker.log'
    @'
@echo off
echo %*>>"%MOCK_DOCKER_LOG%"
if /I "%~1"=="compose" if /I "%~2"=="version" (
  echo %MOCK_COMPOSE_VERSION%
  exit /b 0
)
if /I "%~1"=="compose" if not "%MOCK_DOCKER_EXEC_EXIT_CODE%"=="0" (
  echo %*| findstr /I /C:" exec " >nul
  if not errorlevel 1 exit /b %MOCK_DOCKER_EXEC_EXIT_CODE%
)
exit /b 0
'@ | Set-Content -LiteralPath (Join-Path $script:MockBin 'docker.cmd') -Encoding ASCII
    $script:OldPath = $env:Path
    $env:Path = $script:MockBin + ';' + $env:Path
    $env:MOCK_DOCKER_LOG = $script:MockLog
    $env:MOCK_COMPOSE_VERSION = 'v2.24.4'
    $env:MOCK_DOCKER_EXEC_EXIT_CODE = '0'

    function Invoke-VpnTest {
        param([string[]]$Arguments)
        $output = @(& $script:PowerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $script:VpnScript @Arguments 2>&1)
        [pscustomobject]@{ Code = $LASTEXITCODE; Output = ($output -join "`n") }
    }

    function Get-FreeTcpPort {
        for ($attempt = 0; $attempt -lt 5; $attempt++) {
            $listener = [System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
            $listener.Start()
            try { $port = [int]$listener.LocalEndpoint.Port }
            finally { $listener.Stop() }
            $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
            if (@($listeners | Where-Object { $_.Port -eq $port }).Count -eq 0) { return $port }
        }
        throw 'Could not find a free TCP port for the Windows validation test.'
    }
}

AfterAll {
    $env:Path = $script:OldPath
    Remove-Item -LiteralPath $script:TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Describe 'vpn.ps1 Windows interface' {
    It 'lê valores .env citados, comentários, duplicatas e rejeita aspas inválidas' {
        . (Join-Path $script:ProjectRoot 'scripts\dotenv-read.ps1')
        $envFile = Join-Path $script:TempRoot 'parser.env'
        @'
export QUOTED="value # kept" # comment
DUPLICATE=old
DUPLICATE='new value'
ESCAPED="line\nnext \"quoted\""
'@ | Set-Content -LiteralPath $envFile -Encoding UTF8
        (Read-DotEnvValue -Path $envFile -Name 'QUOTED') | Should -Be 'value # kept'
        (Read-DotEnvValue -Path $envFile -Name 'DUPLICATE') | Should -Be 'new value'
        (Read-DotEnvValue -Path $envFile -Name 'ESCAPED') | Should -Be "line`nnext `"quoted`""
        'BROKEN="unterminated' | Set-Content -LiteralPath $envFile -Encoding UTF8
        { Read-DotEnvValue -Path $envFile -Name 'BROKEN' } | Should -Throw
    }

    It 'rejeita perfil inválido antes de chamar Docker' {
        $result = Invoke-VpnTest @('start', 'perfil-inexistente')
        $result.Code | Should -Be 2
        $result.Output | Should -Match 'perfil inválido'
    }

    It 'aceita arquivo hosts em caminho com espaços' {
        $hostsFile = Join-Path $script:TempRoot 'hosts with spaces'
        "192.168.240.10 gitlab.internal.example`n" | Set-Content -LiteralPath $hostsFile -Encoding ASCII
        $result = Invoke-VpnTest @('hosts-import', '--domain', 'internal.example', '--hosts-file', $hostsFile)
        $result.Code | Should -Be 0
        $result.Output | Should -Match 'LOCAL_HOSTS=gitlab.internal.example=192.168.240.10'
    }

    It 'rejeita hosts locais inválidos' {
        $old = $env:LOCAL_HOSTS
        $env:LOCAL_HOSTS = 'nome inválido=192.168.240.10'
        try {
            $result = Invoke-VpnTest @('hosts-apply')
            $result.Code | Should -Be 2
            $result.Output | Should -Match 'LOCAL_HOSTS inválida|hostname inválido'
        } finally {
            if ($null -eq $old) { Remove-Item Env:LOCAL_HOSTS -ErrorAction SilentlyContinue } else { $env:LOCAL_HOSTS = $old }
        }
    }

    It 'falha claramente quando segredos do perfil estão ausentes' {
        $missing = Join-Path $script:TempRoot 'missing-secret'
        $env:GLUETUN_API_KEY_FILE = $missing
        $env:NORDVPN_USER_FILE = $missing
        $env:NORDVPN_PASSWORD_FILE = $missing
        $result = Invoke-VpnTest @('start', 'nordvpn-openvpn')
        $result.Code | Should -Be 1
        $result.Output | Should -Match 'arquivo de segredo ausente'
    }

    It 'valida XKIRO_API_KEY_FILE também no checklist Windows' {
        $secret = Join-Path $script:TempRoot 'secret-ok'
        'conteudo-de-teste' | Set-Content -LiteralPath $secret -Encoding ASCII
        $oldApi = $env:GLUETUN_API_KEY_FILE
        $oldUser = $env:NORDVPN_USER_FILE
        $oldPassword = $env:NORDVPN_PASSWORD_FILE
        $oldXkiro = $env:XKIRO_API_KEY_FILE
        $env:GLUETUN_API_KEY_FILE = $secret
        $env:NORDVPN_USER_FILE = $secret
        $env:NORDVPN_PASSWORD_FILE = $secret
        $env:XKIRO_API_KEY_FILE = Join-Path $script:TempRoot 'xkiro-missing'
        try {
            $result = Invoke-VpnTest @('start', 'nordvpn-openvpn')
            $result.Code | Should -Be 1
            $result.Output | Should -Match 'XKIRO_API_KEY_FILE aponta para arquivo ausente'
        } finally {
            if ($null -eq $oldApi) { Remove-Item Env:GLUETUN_API_KEY_FILE -ErrorAction SilentlyContinue } else { $env:GLUETUN_API_KEY_FILE = $oldApi }
            if ($null -eq $oldUser) { Remove-Item Env:NORDVPN_USER_FILE -ErrorAction SilentlyContinue } else { $env:NORDVPN_USER_FILE = $oldUser }
            if ($null -eq $oldPassword) { Remove-Item Env:NORDVPN_PASSWORD_FILE -ErrorAction SilentlyContinue } else { $env:NORDVPN_PASSWORD_FILE = $oldPassword }
            if ($null -eq $oldXkiro) { Remove-Item Env:XKIRO_API_KEY_FILE -ErrorAction SilentlyContinue } else { $env:XKIRO_API_KEY_FILE = $oldXkiro }
        }
    }

    It 'rejeita VPN_PORT_RANGE acima de 65535 antes de iniciar os containers' {
        $secret = Join-Path $script:TempRoot 'secret-ok'
        'conteudo-de-teste' | Set-Content -LiteralPath $secret -Encoding ASCII
        $names = @('GLUETUN_API_KEY_FILE', 'NORDVPN_USER_FILE', 'NORDVPN_PASSWORD_FILE', 'XKIRO_API_KEY_FILE', 'HOST_BIND_ADDRESS', 'VPN_PORT_RANGE', 'VPN_HTTP_PROXY')
        $old = @{}
        foreach ($name in $names) { $old[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
        $env:GLUETUN_API_KEY_FILE = $secret
        $env:NORDVPN_USER_FILE = $secret
        $env:NORDVPN_PASSWORD_FILE = $secret
        $env:XKIRO_API_KEY_FILE = ''
        $env:HOST_BIND_ADDRESS = '127.0.0.1'
        $env:VPN_PORT_RANGE = '65536'
        $env:VPN_HTTP_PROXY = 'off'
        try {
            $result = Invoke-VpnTest @('start', 'nordvpn-openvpn')
            $result.Code | Should -Be 2
            $result.Output | Should -Match 'VPN_PORT_RANGE fora de 1-65535'
        } finally {
            foreach ($name in $names) {
                if ($null -eq $old[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
                else { [Environment]::SetEnvironmentVariable($name, $old[$name], 'Process') }
            }
        }
    }

    It 'rejeita WORKSPACE_DIR inexistente antes de tocar a ponte SSH' {
        $secret = Join-Path $script:TempRoot 'secret-ok'
        'conteudo-de-teste' | Set-Content -LiteralPath $secret -Encoding ASCII
        $env:GLUETUN_API_KEY_FILE = $secret
        $env:NORDVPN_USER_FILE = $secret
        $env:NORDVPN_PASSWORD_FILE = $secret
        # Porta unica fora do range efemero + env controlados: o teste nao pode
        # depender do host (a faixa padrao fica ocupada com o ambiente no ar).
        $oldBind = $env:HOST_BIND_ADDRESS
        $oldRange = $env:VPN_PORT_RANGE
        $oldProxy = $env:VPN_HTTP_PROXY
        $env:HOST_BIND_ADDRESS = '127.0.0.1'
        $env:VPN_PORT_RANGE = [string](Get-FreeTcpPort)
        $env:VPN_HTTP_PROXY = 'off'
        $oldWorkspace = $env:WORKSPACE_DIR
        $env:WORKSPACE_DIR = Join-Path $script:TempRoot 'workspace-inexistente'
        try {
            $result = Invoke-VpnTest @('start', 'nordvpn-openvpn')
            $result.Code | Should -Be 2
            $result.Output | Should -Match 'WORKSPACE_DIR nao encontrado'
        } finally {
            if ($null -eq $oldWorkspace) { Remove-Item Env:WORKSPACE_DIR -ErrorAction SilentlyContinue } else { $env:WORKSPACE_DIR = $oldWorkspace }
            if ($null -eq $oldBind) { Remove-Item Env:HOST_BIND_ADDRESS -ErrorAction SilentlyContinue } else { $env:HOST_BIND_ADDRESS = $oldBind }
            if ($null -eq $oldRange) { Remove-Item Env:VPN_PORT_RANGE -ErrorAction SilentlyContinue } else { $env:VPN_PORT_RANGE = $oldRange }
            if ($null -eq $oldProxy) { Remove-Item Env:VPN_HTTP_PROXY -ErrorAction SilentlyContinue } else { $env:VPN_HTTP_PROXY = $oldProxy }
        }
    }

    It 'rejeita bind LAN do painel sem OPENCODE_GUI_PASSWORD_FILE' {
        $secret = Join-Path $script:TempRoot 'secret-ok'
        if (-not (Test-Path -LiteralPath $secret)) { 'conteudo-de-teste' | Set-Content -LiteralPath $secret -Encoding ASCII }
        $env:GLUETUN_API_KEY_FILE = $secret
        $env:NORDVPN_USER_FILE = $secret
        $env:NORDVPN_PASSWORD_FILE = $secret
        $oldBind = $env:HOST_BIND_ADDRESS
        $oldPw = $env:OPENCODE_GUI_PASSWORD_FILE
        $oldRange = $env:VPN_PORT_RANGE
        $oldProxy = $env:VPN_HTTP_PROXY
        $env:HOST_BIND_ADDRESS = '192.168.50.10'
        # Caminho inexistente (nao vazio): Get-ConfigValue no Windows nao
        # distingue env vazio de ausente, mas caminho ruim cai no mesmo erro.
        $env:OPENCODE_GUI_PASSWORD_FILE = Join-Path $script:TempRoot 'senha-inexistente'
        $env:VPN_PORT_RANGE = [string](Get-FreeTcpPort)
        $env:VPN_HTTP_PROXY = 'off'
        try {
            $result = Invoke-VpnTest @('start', 'nordvpn-openvpn')
            $result.Code | Should -Be 2
            $result.Output | Should -Match 'OPENCODE_GUI_PASSWORD_FILE'
        } finally {
            if ($null -eq $oldBind) { Remove-Item Env:HOST_BIND_ADDRESS -ErrorAction SilentlyContinue } else { $env:HOST_BIND_ADDRESS = $oldBind }
            if ($null -eq $oldPw) { Remove-Item Env:OPENCODE_GUI_PASSWORD_FILE -ErrorAction SilentlyContinue } else { $env:OPENCODE_GUI_PASSWORD_FILE = $oldPw }
            if ($null -eq $oldRange) { Remove-Item Env:VPN_PORT_RANGE -ErrorAction SilentlyContinue } else { $env:VPN_PORT_RANGE = $oldRange }
            if ($null -eq $oldProxy) { Remove-Item Env:VPN_HTTP_PROXY -ErrorAction SilentlyContinue } else { $env:VPN_HTTP_PROXY = $oldProxy }
        }
    }

    It 'segue alem da checagem de senha do painel com OPENCODE_GUI_PASSWORD_FILE valido' {
        $secret = Join-Path $script:TempRoot 'secret-ok'
        if (-not (Test-Path -LiteralPath $secret)) { 'conteudo-de-teste' | Set-Content -LiteralPath $secret -Encoding ASCII }
        $pwFile = Join-Path $script:TempRoot 'gui-password'
        'senha-de-teste' | Set-Content -LiteralPath $pwFile -Encoding ASCII
        $env:GLUETUN_API_KEY_FILE = $secret
        $env:NORDVPN_USER_FILE = $secret
        $env:NORDVPN_PASSWORD_FILE = $secret
        $oldBind = $env:HOST_BIND_ADDRESS
        $oldPw = $env:OPENCODE_GUI_PASSWORD_FILE
        $oldRange = $env:VPN_PORT_RANGE
        $oldProxy = $env:VPN_HTTP_PROXY
        $oldWorkspace = $env:WORKSPACE_DIR
        $env:HOST_BIND_ADDRESS = '192.168.50.10'
        $env:OPENCODE_GUI_PASSWORD_FILE = $pwFile
        $env:VPN_PORT_RANGE = [string](Get-FreeTcpPort)
        $env:VPN_HTTP_PROXY = 'off'
        # WORKSPACE_DIR inexistente ancora o resultado: chega na mesma trava
        # do teste acima, provando que a checagem de senha do painel passou.
        $env:WORKSPACE_DIR = Join-Path $script:TempRoot 'workspace-inexistente'
        try {
            $result = Invoke-VpnTest @('start', 'nordvpn-openvpn')
            $result.Code | Should -Be 2
            $result.Output | Should -Match 'WORKSPACE_DIR nao encontrado'
            $result.Output | Should -Not -Match 'OPENCODE_GUI_PASSWORD_FILE'
        } finally {
            if ($null -eq $oldWorkspace) { Remove-Item Env:WORKSPACE_DIR -ErrorAction SilentlyContinue } else { $env:WORKSPACE_DIR = $oldWorkspace }
            if ($null -eq $oldBind) { Remove-Item Env:HOST_BIND_ADDRESS -ErrorAction SilentlyContinue } else { $env:HOST_BIND_ADDRESS = $oldBind }
            if ($null -eq $oldPw) { Remove-Item Env:OPENCODE_GUI_PASSWORD_FILE -ErrorAction SilentlyContinue } else { $env:OPENCODE_GUI_PASSWORD_FILE = $oldPw }
            if ($null -eq $oldRange) { Remove-Item Env:VPN_PORT_RANGE -ErrorAction SilentlyContinue } else { $env:VPN_PORT_RANGE = $oldRange }
            if ($null -eq $oldProxy) { Remove-Item Env:VPN_HTTP_PROXY -ErrorAction SilentlyContinue } else { $env:VPN_HTTP_PROXY = $oldProxy }
        }
    }

    It 'rejeita proxy em bind LAN sem VPN_HTTP_PROXY_PASSWORD_FILE' {
        $secret = Join-Path $script:TempRoot 'secret-ok'
        $guiPassword = Join-Path $script:TempRoot 'gui-password-proxy'
        'conteudo-de-teste' | Set-Content -LiteralPath $secret -Encoding ASCII
        'senha-de-teste' | Set-Content -LiteralPath $guiPassword -Encoding ASCII
        $names = @('GLUETUN_API_KEY_FILE', 'NORDVPN_USER_FILE', 'NORDVPN_PASSWORD_FILE', 'XKIRO_API_KEY_FILE', 'HOST_BIND_ADDRESS', 'OPENCODE_GUI_PASSWORD_FILE', 'VPN_PORT_RANGE', 'VPN_HTTP_PROXY', 'VPN_HTTP_PROXY_PORT', 'VPN_HTTP_PROXY_USER', 'VPN_HTTP_PROXY_PASSWORD_FILE')
        $old = @{}
        foreach ($name in $names) { $old[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
        $env:GLUETUN_API_KEY_FILE = $secret
        $env:NORDVPN_USER_FILE = $secret
        $env:NORDVPN_PASSWORD_FILE = $secret
        $env:XKIRO_API_KEY_FILE = ''
        $env:HOST_BIND_ADDRESS = '192.168.50.10'
        $env:OPENCODE_GUI_PASSWORD_FILE = $guiPassword
        $proxyTestPort = Get-FreeTcpPort
        $env:VPN_PORT_RANGE = [string]$proxyTestPort
        $env:VPN_HTTP_PROXY = 'on'
        $env:VPN_HTTP_PROXY_PORT = [string]$proxyTestPort
        $env:VPN_HTTP_PROXY_USER = ''
        $env:VPN_HTTP_PROXY_PASSWORD_FILE = Join-Path $script:TempRoot 'proxy-password-missing'
        try {
            $result = Invoke-VpnTest @('start', 'nordvpn-openvpn')
            $result.Code | Should -Be 2 -Because "vpn.ps1 output: $($result.Output)"
            $result.Output | Should -Match 'proxy HTTP exposto na LAN exige VPN_HTTP_PROXY_USER e VPN_HTTP_PROXY_PASSWORD_FILE'
        } finally {
            foreach ($name in $names) {
                if ($null -eq $old[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
                else { [Environment]::SetEnvironmentVariable($name, $old[$name], 'Process') }
            }
        }
    }

    It 'encaminha comandos simulados ao Compose Windows' {
        Remove-Item -LiteralPath $script:MockLog -Force -ErrorAction SilentlyContinue
        $result = Invoke-VpnTest @('status', '--json')
        $result.Code | Should -Be 0
        $result.Output | Should -Not -Match 'Erro:'
        $log = Get-Content -LiteralPath $script:MockLog -Raw
        $log | Should -Match 'compose.windows.yml'
        $log | Should -Match 'vpn-status'
        $log | Should -Match '--json'
    }

    It 'sessions-sync encaminha o push ao terminal' {
        Remove-Item -LiteralPath $script:MockLog -Force -ErrorAction SilentlyContinue
        # HOST_HOME_DIR isolado: mesmo que a gravacao no host execute, vai para o temp.
        $oldHomeDir = $env:HOST_HOME_DIR
        $env:HOST_HOME_DIR = $script:TempRoot
        try {
            $result = Invoke-VpnTest @('sessions-sync', '--push')
            $result.Code | Should -Be 0
            $log = Get-Content -LiteralPath $script:MockLog -Raw
            $log | Should -Match 'vpn-session-sync'
            $log | Should -Match 'push'
        } finally {
            if ($null -eq $oldHomeDir) { Remove-Item Env:HOST_HOME_DIR -ErrorAction SilentlyContinue } else { $env:HOST_HOME_DIR = $oldHomeDir }
        }
    }

    It 'nao aplica staging anterior quando o push do container falha' {
        $oldHomeDir = $env:HOST_HOME_DIR
        $oldDockerCode = $env:MOCK_DOCKER_EXEC_EXIT_CODE
        $syncOut = Join-Path $script:ProjectRoot '.vpn\sync\out'
        $hostShare = Join-Path $script:TempRoot '.local\share\opencode'
        New-Item -ItemType Directory -Path $syncOut, $hostShare -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $syncOut 'opencode.db') -Value 'stale-staging' -Encoding ASCII
        Set-Content -LiteralPath (Join-Path $hostShare 'opencode.db') -Value 'host-before' -Encoding ASCII
        $env:HOST_HOME_DIR = $script:TempRoot
        $env:MOCK_DOCKER_EXEC_EXIT_CODE = '23'
        try {
            $result = Invoke-VpnTest @('sessions-sync', '--push')
            $result.Code | Should -Be 1
            $result.Output | Should -Match 'exportacao do container falhou'
            Get-Content -LiteralPath (Join-Path $hostShare 'opencode.db') -Raw | Should -Match 'host-before'
            Test-Path -LiteralPath (Join-Path $hostShare 'opencode.db.bak') | Should -BeFalse
        } finally {
            if ($null -eq $oldDockerCode) { Remove-Item Env:MOCK_DOCKER_EXEC_EXIT_CODE -ErrorAction SilentlyContinue } else { $env:MOCK_DOCKER_EXEC_EXIT_CODE = $oldDockerCode }
            if ($null -eq $oldHomeDir) { Remove-Item Env:HOST_HOME_DIR -ErrorAction SilentlyContinue } else { $env:HOST_HOME_DIR = $oldHomeDir }
            Remove-Item -LiteralPath (Join-Path $script:ProjectRoot '.vpn\sync') -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It 'encaminha status do supervisor OpenCode ao perfil opencode' {
        Remove-Item -LiteralPath $script:MockLog -Force -ErrorAction SilentlyContinue
        $result = Invoke-VpnTest @('opencode', 'supervise-status')
        $result.Code | Should -Be 0
        $log = Get-Content -LiteralPath $script:MockLog -Raw
        $log | Should -Match '--profile opencode'
        $log | Should -Match 'opencode-supervisor'
    }

    It 'rejeita Compose abaixo da versão necessária' {
        $old = $env:MOCK_COMPOSE_VERSION
        $env:MOCK_COMPOSE_VERSION = 'v2.24.3'
        try {
            $result = Invoke-VpnTest @('status')
            $result.Code | Should -Be 2
            $result.Output | Should -Match '2.24.4'
        } finally { $env:MOCK_COMPOSE_VERSION = $old }
    }
}
