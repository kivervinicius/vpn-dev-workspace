#Requires -Version 7.0
<#
.SYNOPSIS
    Autocomplete para scripts\vpn.ps1 no PowerShell (Register-ArgumentCompleter).

.DESCRIPTION
    Dot-source este arquivo no perfil do PowerShell (winget: $PROFILE) para
    habilitar Tab nos comandos e perfis do vpn.ps1. Sem efeitos colaterais:
    apenas registra completers.

.EXAMPLE
    . .\scripts\windows\vpn-completion.ps1
#>

$script:VpnCompletionRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Register-ArgumentCompleter -Native -CommandName 'vpn.ps1','vpn' -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $commands = @(
        'start', 'up', 'stop', 'down', 'terminal', 'shell', 'status', 'check',
        'top', 'reconnect', 'rotate', 'opencode', 'hosts-import', 'hosts-apply',
        'agent-start', 'agent-stop', 'sessions-sync'
    )
    $rotateFlags = @('--list', '--random', '--to')
    $opencodeModes = @('web', 'serve', 'supervise', 'supervise-stop',
        'supervise-status', 'supervise-logs', 'stop', 'status', 'logs',
        'check', 'watch')

    # Perfis: lê profiles/*.yml relativos à instalação deste completion.
    $profiles = @()
    $profilesDir = Join-Path (Split-Path -Parent (Split-Path -Parent $script:VpnCompletionRoot)) 'profiles'
    if (Test-Path $profilesDir) {
        $profiles = Get-ChildItem -Path $profilesDir -Filter '*.yml' -ErrorAction SilentlyContinue |
            ForEach-Object { [System.IO.Path]::GetFileNameWithoutExtension($_.Name) }
    }

    $element = $commandAst.CommandElements
    $argumentCount = $element.Count - 1   # exclui o nome do comando
    $complete = {
        param([string[]]$Candidates)
        $Candidates | Where-Object { $_ -like "$wordToComplete*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_) }
    }

    if ($argumentCount -le 1) {
        return & $complete $commands
    }

    $subcommand = [string]$element[1]
    switch ($subcommand) {
        { $_ -in @('start', 'up') } { return & $complete $profiles }
        'rotate' { return & $complete $rotateFlags }
        'opencode' { return & $complete $opencodeModes }
        default { return @() }
    }
}