[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$TokenFile,
    [Parameter(Mandatory = $true)]
    [string]$ReadyFile,
    [string]$PipeName = 'openssh-ssh-agent',
    [int]$Port = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-ExactBytes {
    param(
        [Parameter(Mandatory = $true)] [System.IO.Stream]$Stream,
        [Parameter(Mandatory = $true)] [int]$Count
    )
    $buffer = New-Object byte[] $Count
    $offset = 0
    while ($offset -lt $Count) {
        $read = $Stream.Read($buffer, $offset, $Count - $offset)
        if ($read -le 0) { return $null }
        $offset += $read
    }
    return $buffer
}

function Copy-AgentConnection {
    param([Parameter(Mandatory = $true)] [System.Net.Sockets.TcpClient]$TcpClient)

    $tcpStream = $null
    $pipe = $null
    try {
        $tcpStream = $TcpClient.GetStream()
        $expectedToken = [System.IO.File]::ReadAllText($TokenFile).Trim()
        if ($expectedToken.Length -ne 32) { throw 'token da ponte inválido' }
        $received = Read-ExactBytes -Stream $tcpStream -Count 32
        if ($null -eq $received) { return }
        $receivedToken = [System.Text.Encoding]::ASCII.GetString($received)
        if ($receivedToken -cne $expectedToken) {
            throw 'token da ponte SSH inválido'
        }

        $pipe = New-Object -TypeName System.IO.Pipes.NamedPipeClientStream -ArgumentList '.', $PipeName, ([System.IO.Pipes.PipeDirection]::InOut), ([System.IO.Pipes.PipeOptions]::Asynchronous)
        $pipe.Connect(3000)
        $toPipe = $tcpStream.CopyToAsync($pipe)
        $toTcp = $pipe.CopyToAsync($tcpStream)
        [System.Threading.Tasks.Task]::WhenAny($toPipe, $toTcp).GetAwaiter().GetResult() | Out-Null
    } catch {
        [Console]::Error.WriteLine("vpn-ssh-agent-bridge: $($_.Exception.Message)")
    } finally {
        if ($null -ne $pipe) { $pipe.Dispose() }
        if ($null -ne $tcpStream) { $tcpStream.Dispose() }
        $TcpClient.Dispose()
    }
}

if (-not (Test-Path -LiteralPath $TokenFile -PathType Leaf)) {
    throw "Arquivo de token ausente: $TokenFile"
}
$listener = New-Object -TypeName System.Net.Sockets.TcpListener -ArgumentList ([System.Net.IPAddress]::Any), $Port
$listener.Start()
$actualPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$ready = [ordered]@{ port = $actualPort; pid = $PID; pipe = $PipeName }
[System.IO.File]::WriteAllText($ReadyFile, ($ready | ConvertTo-Json -Compress), (New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false))

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        Copy-AgentConnection -TcpClient $client
    }
} finally {
    $listener.Stop()
    Remove-Item -LiteralPath $ReadyFile -Force -ErrorAction SilentlyContinue
}
