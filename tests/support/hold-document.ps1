param([Parameter(Mandatory=$true)][string]$DocumentPath)
$handle = [System.IO.File]::Open($DocumentPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
try {
    [Console]::Out.WriteLine('LOCKED')
    [Console]::Out.Flush()
    [void][Console]::In.ReadLine()
} finally {
    $handle.Dispose()
}
