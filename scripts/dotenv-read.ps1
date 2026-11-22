function Read-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)] [string]$Path,
        [Parameter(Mandatory = $true)] [string]$Name,
        [string]$Default = ''
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $Default }
    $found = $false
    $result = ''
    foreach ($originalLine in Get-Content -LiteralPath $Path) {
        $line = $originalLine.TrimStart()
        if (-not $line -or $line.StartsWith('#')) { continue }
        if ($line.StartsWith('export ')) { $line = $line.Substring(7).TrimStart() }
        $equals = $line.IndexOf('=')
        if ($equals -lt 0 -or $line.Substring(0, $equals).Trim() -cne $Name) { continue }
        $raw = $line.Substring($equals + 1).TrimStart()
        if ($raw.StartsWith('"') -or $raw.StartsWith("'")) {
            $quote = $raw.Substring(0, 1)
            $escaped = $false
            $closed = $false
            $value = [Text.StringBuilder]::new()
            for ($i = 1; $i -lt $raw.Length; $i++) {
                $char = $raw.Substring($i, 1)
                if ($quote -eq '"' -and $escaped) {
                    switch ($char) {
                        'n' { [void]$value.Append("`n") }
                        'r' { [void]$value.Append("`r") }
                        't' { [void]$value.Append("`t") }
                        default { [void]$value.Append($char) }
                    }
                    $escaped = $false
                } elseif ($quote -eq '"' -and $char -eq '\') {
                    $escaped = $true
                } elseif ($char -eq $quote) {
                    $closed = $true
                    $tail = $raw.Substring($i + 1).Trim()
                    if ($tail -and -not $tail.StartsWith('#')) { throw "Valor inválido para $Name no .env." }
                    break
                } else {
                    [void]$value.Append($char)
                }
            }
            if (-not $closed -or $escaped) { throw "Aspas não fechadas para $Name no .env." }
            $result = $value.ToString()
        } else {
            $result = [regex]::Replace($raw, '\s+#.*$', '').TrimEnd()
        }
        $found = $true
    }
    if ($found) { return $result }
    return $Default
}
