<#
.SYNOPSIS
    Static file server for local development.

.DESCRIPTION
    The app uses ES modules, which browsers subject to CORS — opening
    index.html with file:// leaves a blank page. This serves the project folder
    over HTTP so modules load.

    Exists because this machine has no Node and no Python. If you have either,
    `npx serve` or `python -m http.server` do the same job; see README.md.

    Built on .NET HttpListener, which ships with Windows. No install, no
    dependencies.

.PARAMETER Port
    Port to listen on. Defaults to 5173.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
#>

[CmdletBinding()]
param(
    [int]$Port = 5173
)

$ErrorActionPreference = 'Stop'

# Serve the project root, which is this script's parent folder.
$root = Split-Path -Parent $PSScriptRoot
$prefix = "http://localhost:$Port/"

# Correct types matter here: a .js file served as text/plain is refused by the
# browser's module loader, which is the exact failure this server exists to avoid.
$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.ico'  = 'image/x-icon'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
    '.md'   = 'text/markdown; charset=utf-8'
    '.gs'   = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
}
catch {
    Write-Host "Could not listen on $prefix" -ForegroundColor Red
    Write-Host "Try a different port:  scripts/serve.ps1 -Port 8080" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "  Flow Tribe dev server" -ForegroundColor Magenta
Write-Host "  serving $root"
Write-Host ""
Write-Host "  member app  $prefix" -ForegroundColor Cyan
Write-Host "  admin app   ${prefix}admin.html" -ForegroundColor Cyan
Write-Host "  gallery     ${prefix}gallery.html" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Ctrl+C to stop"
Write-Host ""

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $relative = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }

        $path = Join-Path $root $relative

        # Refuse anything resolving outside the project root — a served folder
        # should never expose the rest of the disk, even locally.
        $fullRoot = [System.IO.Path]::GetFullPath($root)
        $fullPath = [System.IO.Path]::GetFullPath($path)

        if (-not $fullPath.StartsWith($fullRoot, [StringComparison]::OrdinalIgnoreCase)) {
            $response.StatusCode = 403
            $response.Close()
            continue
        }

        if (Test-Path -LiteralPath $fullPath -PathType Container) {
            $fullPath = Join-Path $fullPath 'index.html'
        }

        if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
            $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()

            $contentType = 'application/octet-stream'
            if ($mimeTypes.ContainsKey($extension)) { $contentType = $mimeTypes[$extension] }

            $bytes = [System.IO.File]::ReadAllBytes($fullPath)

            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            # No caching: a refresh after an edit must show the edit.
            $response.Headers.Add('Cache-Control', 'no-store')
            $response.OutputStream.Write($bytes, 0, $bytes.Length)

            Write-Host "  200  $relative" -ForegroundColor DarkGray
        }
        else {
            $body = [System.Text.Encoding]::UTF8.GetBytes("404 - $relative")
            $response.StatusCode = 404
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $body.Length
            $response.OutputStream.Write($body, 0, $body.Length)

            Write-Host "  404  $relative" -ForegroundColor DarkYellow
        }

        $response.Close()
    }
    catch {
        Write-Host "  error  $($_.Exception.Message)" -ForegroundColor Red
    }
}

$listener.Stop()
