param([Parameter(ValueFromRemainingArguments=$true)][string[]]$NpmArguments)
$ErrorActionPreference = 'Stop'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '../..')
$runtimePath = Join-Path $projectRoot '.local/toolchain'
$nodePath = Join-Path $runtimePath 'node.exe'
$npmPath = Join-Path $runtimePath 'node_modules/npm/bin/npm-cli.js'
if (!(Test-Path -LiteralPath $nodePath) -or !(Test-Path -LiteralPath $npmPath)) {
  throw 'Falta el toolchain local Node 24.22.3/npm 12.2.2. Consulta docs/local-environment.md.'
}
if ((& $nodePath --version) -ne 'v24.22.3') { throw 'Versión Node inesperada.' }
if ((& $nodePath $npmPath --version) -ne '12.2.2') { throw 'Versión npm inesperada.' }
$previousPath = $env:PATH
try {
  $env:PATH = "$runtimePath;$previousPath"
  Push-Location $projectRoot
  try { & $nodePath $npmPath @NpmArguments; $result = $LASTEXITCODE }
  finally { Pop-Location }
} finally { $env:PATH = $previousPath }
exit $result
