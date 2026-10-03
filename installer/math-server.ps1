# Tiny web server for the Arabic Math add-in. Listens on https://localhost only (this PC): serves ./site and keeps the
# exam templates (.docx) in Documents\نموذج الأسئلة\القوالب so Word can open and save them like any file.
param([int]$Port = 43892)
$ErrorActionPreference = 'Continue'
$Root = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'site'
$RootSlash = $Root.TrimEnd('\') + '\'
$mime = @{ '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8';
           '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.txt'='text/plain; charset=utf-8'; '.xml'='application/xml; charset=utf-8';
           '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif'; '.webp'='image/webp'; '.svg'='image/svg+xml'; '.ico'='image/x-icon';
           '.woff2'='font/woff2'; '.woff'='font/woff'; '.ttf'='font/ttf'; '.otf'='font/otf'; '.wasm'='application/wasm'; '.onnx'='application/octet-stream';
           '.pdf'='application/pdf'; '.map'='application/json'; '.gz'='application/gzip';
           '.docx'='application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
$TplDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'نموذج الأسئلة\القوالب'
try { New-Item -ItemType Directory -Force -Path $TplDir | Out-Null } catch { }
$Origin = "https://localhost:$Port"
$Log = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'server.log'
try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("https://localhost:$Port/")
    $l.Start()
    "$(Get-Date -Format s) started on https://localhost:$Port/ as $env:USERNAME" | Out-File $Log -Encoding UTF8
} catch {
    "$(Get-Date -Format s) START FAILED: $($_.Exception.Message)" | Out-File $Log -Encoding UTF8
    exit 1
}

# The file name travels as base64url(UTF-8) in ?n= : HttpListener decodes plain query strings with the
# Windows ANSI code page, which turns Arabic names into mojibake.
function Get-TplName($req) {
    $v = $req.QueryString['n']
    if (-not $v) { return $null }
    try {
        $b = $v.Replace('-', '+').Replace('_', '/')
        while ($b.Length % 4 -ne 0) { $b += '=' }
        return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b))
    } catch { return $null }
}
function Send($ctx, [int]$code, [byte[]]$bytes, [string]$type) {
    $ctx.Response.StatusCode = $code
    $ctx.Response.ContentType = $type
    $ctx.Response.ContentLength64 = $bytes.Length
    if ($bytes.Length -gt 0) { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
}
function SendJson($ctx, [int]$code, $obj) {
    $j = ConvertTo-Json -InputObject $obj -Compress -Depth 4
    Send $ctx $code ([Text.Encoding]::UTF8.GetBytes($j)) 'application/json; charset=utf-8'
}
# only plain "name.docx" inside the templates folder is ever touched
function Tpl-Path([string]$name) {
    if (-not $name) { return $null }
    $n = [IO.Path]::GetFileName($name)
    if ($n -ne $name -or $n -notlike '*.docx' -or $n.StartsWith('~$') -or $n.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0) { return $null }
    return (Join-Path $TplDir $n)
}
function Read-Shared([string]$path) {            # works while Word has the file open
    $fs = New-Object IO.FileStream($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try { $ms = New-Object IO.MemoryStream; $fs.CopyTo($ms); return $ms.ToArray() } finally { $fs.Dispose() }
}
function Handle-Api($ctx) {
    $req = $ctx.Request
    # a web page on another site can't send this header (the browser would ask us first, and we never agree)
    if ($req.Headers['X-Exam'] -ne '1') { SendJson $ctx 403 @{ error = 'forbidden' }; return }
    $o = $req.Headers['Origin']
    if ($o -and $o -ne $Origin) { SendJson $ctx 403 @{ error = 'forbidden' }; return }
    $route = $req.Url.AbsolutePath.ToLower()
    $name = Get-TplName $req
    $method = $req.HttpMethod
    if ($route -eq '/api/ping') { SendJson $ctx 200 @{ ok = $true; exam = 1; dir = $TplDir }; return }
    if ($route -eq '/api/templates' -and $method -eq 'GET') {
        $items = @(Get-ChildItem -LiteralPath $TplDir -Filter *.docx -File -ErrorAction SilentlyContinue | Where-Object { -not $_.Name.StartsWith('~$') } | ForEach-Object {
            $n = $_.Name
            # Word keeps a hidden "~$..." lock file next to a document while it is open
            $open = $false
            foreach ($k in 0, 1, 2) { if ($n.Length -gt $k -and (Test-Path -LiteralPath (Join-Path $TplDir ('~$' + $n.Substring($k))))) { $open = $true } }
            [pscustomobject]@{ name = $n; size = $_.Length; modified = [long](($_.LastWriteTimeUtc - [datetime]'1970-01-01').TotalMilliseconds); open = $open } })
        SendJson $ctx 200 $items; return
    }
    if ($route -eq '/api/reveal' -and $method -eq 'POST') { Start-Process explorer.exe -ArgumentList "`"$TplDir`""; SendJson $ctx 200 @{ ok = $true }; return }
    if ($route -eq '/api/template') {
        $path = Tpl-Path $name
        if (-not $path) { SendJson $ctx 400 @{ error = 'bad name' }; return }
        if ($method -eq 'GET') {
            if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { SendJson $ctx 404 @{ error = 'not found' }; return }
            $ctx.Response.AddHeader('Cache-Control', 'no-store')
            Send $ctx 200 (Read-Shared $path) 'application/octet-stream'; return
        }
        if ($method -eq 'PUT') {
            $ms = New-Object IO.MemoryStream; $req.InputStream.CopyTo($ms); $buf = $ms.ToArray()
            if ($buf.Length -lt 4 -or $buf.Length -gt 40MB -or $buf[0] -ne 0x50 -or $buf[1] -ne 0x4B) { SendJson $ctx 400 @{ error = 'not a docx' }; return }
            try { [IO.File]::WriteAllBytes($path, $buf); SendJson $ctx 200 @{ ok = $true } }
            catch { SendJson $ctx 409 @{ error = 'الملف مفتوح في Word؛ أغلقه ثم أعد المحاولة' } }
            return
        }
        if ($method -eq 'DELETE') {
            try { Remove-Item -LiteralPath $path -Force -ErrorAction Stop; SendJson $ctx 200 @{ ok = $true } }
            catch { SendJson $ctx 409 @{ error = 'تعذر الحذف؛ الملف مفتوح في Word' } }
            return
        }
        if ($method -eq 'POST') {                                  # open in Word (the default app for .docx)
            if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { SendJson $ctx 404 @{ error = 'not found' }; return }
            Start-Process -FilePath $path
            SendJson $ctx 200 @{ ok = $true }; return
        }
    }
    SendJson $ctx 404 @{ error = 'unknown' }
}
while ($l.IsListening) {
    $ctx = $l.GetContext()
    try {
        if ($ctx.Request.Url.AbsolutePath.StartsWith('/api/', [StringComparison]::OrdinalIgnoreCase)) { Handle-Api $ctx; continue }
        $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/').Replace('/', '\')
        if (-not $rel) { $rel = 'taskpane.html' }
        $path = [IO.Path]::GetFullPath((Join-Path $Root $rel))
        if (-not $path.StartsWith($RootSlash, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
            $ctx.Response.StatusCode = 404
        } else {
            $bytes = [IO.File]::ReadAllBytes($path)
            $ext = [IO.Path]::GetExtension($path).ToLower()
            $ctx.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
            $static = $rel.StartsWith('vendor\') -or $rel.StartsWith('fonts\')
            $ctx.Response.AddHeader('Cache-Control', $(if ($static) { 'public, max-age=604800' } else { 'no-cache' }))
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
    } catch { try { $ctx.Response.StatusCode = 500 } catch { } }
    finally { try { $ctx.Response.Close() } catch { } }
}
