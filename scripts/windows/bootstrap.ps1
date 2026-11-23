#Requires -Version 7.0
<#
.SYNOPSIS
    Bootstrap idempotente do ambiente Windows do VPN Dev Workspace.

.DESCRIPTION
    Verifica e instala, via winget, as dependências do modo Windows:
    Docker Desktop (backend WSL2), Git e Node.js LTS. Cada pacote só é
    instalado quando ausente, então rodar várias vezes é seguro.

    Não baixa imagens, não sobe containers e não toca em .secrets/.
    Sem -DryRun nada é alterado no sistema; use -DryRun para apenas relatar.

.PARAMETER DryRun
    Apenas relata o que faria; não instala nada.

.PARAMETER SkipDocker
    Não tenta instalar o Docker Desktop (quando já gerenciado por outra via).

.EXAMPLE
    pwsh -File .\scripts\windows\bootstrap.ps1 -DryRun

.EXAMPLE
    pwsh -File .\scripts\windows\bootstrap.ps1
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$SkipDocker
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    [Console]::Error.WriteLine('Erro: PowerShell 7+ (pwsh) é obrigatório.')
    exit 2
}

if (-not $IsWindows) {
    [Console]::Error.WriteLine('Erro: este bootstrap é exclusivo do Windows.')
    exit 2
}

$packages = @(
    [pscustomobject]@{ Id = 'Docker.DockerDesktop'; Name = 'Docker Desktop'; Required = (-not $SkipDocker) }
    [pscustomobject]@{ Id = 'Git.Git'; Name = 'Git'; Required = $true }
    [pscustomobject]@{ Id = 'OpenJS.NodeJS.LTS'; Name = 'Node.js LTS'; Required = $true }
)

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Test-WingetPackage {
    param([string]$Id)
    # `winget list --id` sai 0 mesmo sem correspondência em algumas versões;
    # filtra a saída para exigir o Id exato na tabela.
    $output = & winget list --id $Id --exact --accept-source-agreements 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    return [bool]($output | Select-String -SimpleMatch -Pattern $Id)
}

$winget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $winget) {
    [Console]::Error.WriteLine('Erro: winget não encontrado. Instale o App Installer da Microsoft Store e repita.')
    exit 2
}

$missing = @()
foreach ($package in $packages) {
    if (-not $package.Required) {
        Write-Step "ignorado por opção: $($package.Name) ($($package.Id))"
        continue
    }
    if (Test-WingetPackage -Id $package.Id) {
        Write-Step "presente: $($package.Name)"
        continue
    }
    $missing += $package
    if ($DryRun) {
        Write-Step "faltando (DryRun): $($package.Name) ($($package.Id))"
        continue
    }
    Write-Step "instalando: $($package.Name)"
    & winget install --id $package.Id --exact --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        [Console]::Error.WriteLine("Erro: falha ao instalar $($package.Name) ($($package.Id)); código $LASTEXITCODE.")
        exit 1
    }
}

if ($missing.Count -eq 0) {
    Write-Step 'todas as dependências já estão presentes.'
} elseif ($DryRun) {
    Write-Step "$($missing.Count) dependência(s) faltando; rode sem -DryRun para instalar."
}

Write-Step 'próximos passos:'
Write-Host '  1. Abra o Docker Desktop e habilite o backend WSL2 + File Sharing da pasta do projeto.'
Write-Host '  2. Copie .env.example para .env e preencha as credenciais em .secrets/.'
Write-Host '  3. pwsh -File .\scripts\vpn.ps1 start <perfil>'
Write-Host '  4. Opcional: . .\scripts\windows\vpn-completion.ps1 (autocomplete no perfil).'

exit 0