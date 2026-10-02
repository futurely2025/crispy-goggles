# استرجاع ملف (معادلات عربية) الأصلي كما كان قبل الدمج
$ErrorActionPreference = 'Stop'
$Dest = Join-Path $env:LOCALAPPDATA 'ArabicMathWord'
$m = Join-Path $Dest 'manifest.xml'; $b = Join-Path $Dest 'manifest.original.xml'
try {
    while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
        Write-Host 'Word مفتوح. أغلقه واضغط Enter (أو K لإغلاقه تلقائياً).' -ForegroundColor Yellow
        $a = Read-Host '>'
        if ($a -match '^[kK]') { Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 2 }
    }
    if (-not (Test-Path $b)) { throw 'لا توجد نسخة احتياطية. شغّل Install.cmd الخاص بمعادلات عربية من مجلده الأصلي.' }
    Copy-Item $b $m -Force
    $wef = Join-Path $env:LOCALAPPDATA 'Microsoft\Office\16.0\Wef'
    if (Test-Path $wef) { Get-ChildItem $wef -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }
    Write-Host '✔ عادت (معادلات عربية) كما كانت.' -ForegroundColor Green
} catch { Write-Host ('✘ ' + $_.Exception.Message) -ForegroundColor Red }
