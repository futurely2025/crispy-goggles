# تثبيت إضافة واحدة تحمل زرّين: (معادلات عربية) + (محلل الأسئلة)  — Word يقبل تسجيل إضافة واحد فقط عندك
$ErrorActionPreference = 'Stop'
$Log = Join-Path $env:TEMP 'qparser-both-install.log'
try { Start-Transcript -Path $Log -Force | Out-Null } catch { }
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$AddinId = 'e9182039-0176-4a6e-a259-145b24db2436'          # معرّف (معادلات عربية) نفسه
$Dest = Join-Path $env:LOCALAPPDATA 'ArabicMathWord'
function Step([string]$t) { Write-Host ''; Write-Host $t -ForegroundColor Cyan }
function Ok([string]$t)   { Write-Host "    OK  $t" -ForegroundColor Green }
function Warn([string]$t) { Write-Host "    !!  $t" -ForegroundColor Yellow }
Write-Host '=== تثبيت (معادلات عربية + محلل الأسئلة) في Word ===' -ForegroundColor White
try {
    Step '[1/5] قراءة رابط الموقع'
    $url = (Get-Content (Join-Path $Here 'addin-url.txt') -Encoding UTF8 | Where-Object { $_ -match '^\s*https://' } | Select-Object -First 1)
    if (-not $url) { throw 'ضع رابط موقعك (https://...) في ملف installer\addin-url.txt ثم أعد التشغيل.' }
    $url = $url.Trim(); if (-not $url.EndsWith('/')) { $url += '/' }
    $origin = ([Uri]$url).GetLeftPart([UriPartial]::Authority)
    Ok $url

    Step '[2/5] التحقق من أن الملفات مرفوعة على الموقع'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    foreach ($p in 'taskpane.html', 'qparser.html') {
        try { $null = Invoke-WebRequest -Uri ($url + $p) -UseBasicParsing -TimeoutSec 20; Ok ($p + ' يعمل') }
        catch { Warn ($p + ' لا يفتح على الموقع — تأكد من رفع المجلد web بعد نسخ ملفات المحلل إليه') }
    }

    Step '[3/5] التأكد من إغلاق Word'
    while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
        Warn 'Word مفتوح (قد يعمل في الخلفية). أغلقه واضغط Enter، أو اكتب K ثم Enter لإغلاقه تلقائياً (دون حفظ!)'
        $a = Read-Host '     >'
        if ($a -match '^[kK]') { Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 2 }
    }
    Ok 'Word مغلق'

    Step '[4/5] كتابة ملف التعريف الموحّد'
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    $manifest = Join-Path $Dest 'manifest.xml'
    $backup   = Join-Path $Dest 'manifest.original.xml'
    if ((Test-Path $manifest) -and -not (Test-Path $backup)) { Copy-Item $manifest $backup; Ok 'نسخة احتياطية من ملفك الأصلي' }
    $tpl = [IO.File]::ReadAllText((Join-Path $Here 'manifest.both.template.xml'), [Text.Encoding]::UTF8)
    $xml = $tpl.Replace('{{BASE_URL}}', $url).Replace('{{ORIGIN}}', $origin)
    [IO.File]::WriteAllText($manifest, $xml, (New-Object Text.UTF8Encoding($false)))
    $key = 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'
    if (-not (Test-Path $key)) { New-Item -Path $key | Out-Null }   # بدون -Force: لا يمسح إضافات أخرى مسجّلة
    New-ItemProperty -Path $key -Name $AddinId -Value $manifest -PropertyType String -Force | Out-Null
    Ok $manifest

    Step '[5/5] تفريغ كاش إضافات Office'
    $wef = Join-Path $env:LOCALAPPDATA 'Microsoft\Office\16.0\Wef'
    if (Test-Path $wef) { Get-ChildItem $wef -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }
    Ok 'تم'

    Write-Host ''
    Write-Host '  ✔ تم التثبيت. افتح Word: في تبويب (معادلات عربية) ستجد الزرّين: محرر المعادلات + محلل الأسئلة.' -ForegroundColor Green
}
catch {
    Write-Host ''
    Write-Host ('  ✘ فشل: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host "  السجل: $Log"
}
finally { try { Stop-Transcript | Out-Null } catch { } }
