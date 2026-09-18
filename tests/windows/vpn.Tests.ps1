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
if "%~1"=="compose" if "%~2"=="version" echo %MOCK_COMPOSE_VERSION%
exit /b 0
'@ | Set-Content -LiteralPath (Join-Path $script:MockBin 'docker.cmd') -Encoding ASCII
    $script:OldPath = $env:Path
    $env:Path = $script:MockBin + ';' + $env:Path
    $env:MOCK_DOCKER_LOG = $script:MockLog
    $env:MOCK_COMPOSE_VERSION = 'v2.24.4'
}

AfterAll {
    $env:Path = $script:OldPath
    Remove-Item -LiteralPath $script:TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

function Invoke-VpnTest {
    param([string[]]$Arguments)
    $output = @(& $script:PowerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $script:VpnScript @Arguments 2>&1)
    [pscustomobject]@{ Code = $LASTEXITCODE; Output = ($output -join "`n") }
}

Describe 'vpn.ps1 Windows interface' {
    It 'rejeita perfil inválido antes de chamar Docker' {
        $result = Invoke-VpnTest @('start', 'perfil-inexistente')
        $result.Code | Should -Be 2
        $result.Output | Should -Match 'perfil inválido'
    }

    It 'aceita arquivo hosts em caminho com espaços' {
        $hostsFile = Join-Path $script:TempRoot 'hosts with spaces'
        "10.0.0.5 gitlab.omega`n" | Set-Content -LiteralPath $hostsFile -Encoding ASCII
        $result = Invoke-VpnTest @('hosts-import', '--domain', 'omega', '--hosts-file', $hostsFile)
        $result.Code | Should -Be 0
        $result.Output | Should -Match 'LOCAL_HOSTS=gitlab.omega=10.0.0.5'
    }

    It 'rejeita hosts locais inválidos' {
        $old = $env:LOCAL_HOSTS
        $env:LOCAL_HOSTS = 'nome inválido=10.0.0.5'
        try {
            $result = Invoke-VpnTest @('hosts-apply')
            $result.Code | Should -Be 2
            $result.Output | Should -Match 'hostname inválido'
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
