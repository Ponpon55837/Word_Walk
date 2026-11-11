param([switch]$Sign, [switch]$InitializePublisher)
$ErrorActionPreference = 'Stop'
if ($InitializePublisher -and -not $Sign) { throw 'Use -Sign with -InitializePublisher' }
$root = Split-Path $PSScriptRoot
$source = Join-Path $root 'plugin'
$build = Join-Path $root 'build'
$null = New-Item -ItemType Directory -Force -Path $build
$outputPath = Join-Path $build 'word-walk.agentpet-plugin'
$tempPath = Join-Path $build ([guid]::NewGuid().ToString() + '.tmp')

# Keep the installable archive independent of editor files and local test output.
$entries = @(
  'plugin.json', 'source.js', 'legal/openjlpt.json',
  'worker/main.js', 'worker/provider.js', 'worker/study.js', 'worker/profile.js',
  'ui/copy.js', 'ui/daily.js', 'ui/index.html', 'ui/panel.css', 'ui/panel.js'
)
try {
  $archive = [IO.Compression.ZipFile]::Open($tempPath, 'Create')
  try {
    $digests = [Collections.Generic.List[string]]::new()
    foreach ($name in $entries) {
      $entry = $archive.CreateEntry($name)
      $entry.LastWriteTime = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
      $stream = $entry.Open()
      try {
        $bytes = [IO.File]::ReadAllBytes((Join-Path $source $name))
        $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
        $digests.Add($name + [char]9 + $hash)
        $stream.Write($bytes)
      } finally {
        $stream.Dispose()
      }
    }
    if ($Sign) {
      $options = @()
      if ($InitializePublisher) { $options += '--initialize' }
      $signature = (ConvertTo-Json -Compress -InputObject $digests) | node (Join-Path $PSScriptRoot 'sign.mjs') @options
      if ($LASTEXITCODE -ne 0) { throw 'Publisher signing failed' }
      $entry = $archive.CreateEntry('signature.json')
      $entry.LastWriteTime = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
      $stream = $entry.Open()
      try { $stream.Write([Text.Encoding]::UTF8.GetBytes($signature)) } finally { $stream.Dispose() }
    }
  } finally {
    $archive.Dispose()
  }
  [IO.File]::Move($tempPath, $outputPath, $true)
} finally {
  if ([IO.File]::Exists($tempPath)) { [IO.File]::Delete($tempPath) }
}
Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath
