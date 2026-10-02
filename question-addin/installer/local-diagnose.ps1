# محلل الأسئلة - تشخيص: يكتب تقريراً على سطح المكتب لترسله لمن يساعدك
$ErrorActionPreference = 'Continue'
$App = Join-Path $env:LOCALAPPDATA 'QuestionParserWord'
$Out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'qparser-diagnose.txt'
$L = New-Object System.Collections.Generic.List[string]
function Add([string]$k, $v) { $L.Add(("{0,-34} {1}" -f $k, $v)) }

Add 'Windows' ([Environment]::OSVersion.VersionString)
Add 'PowerShell' $PSVersionTable.PSVersion
$w = Get-Process WINWORD -ErrorAction SilentlyContinue
Add 'Word مفتوح الآن' ([bool]$w)
foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\ClickToRun\Configuration') {
    $c = Get-ItemProperty $k -ErrorAction SilentlyContinue
    if ($c) { Add 'Office (ClickToRun)' ("$($c.ProductReleaseIds) v$($c.VersionToReport) channel=$($c.CDNBaseUrl)") }
}
Add 'مجلد التثبيت موجود' (Test-Path $App)
foreach ($f in 'QParserServer.exe','cert.pfx','cert.cer','manifest.xml','web\qparser.html','web\qparser-assets\js\qparser-core.js','server.log') {
    Add ("ملف: $f") (Test-Path (Join-Path $App $f))
}
$p = Get-Process QParserServer -ErrorAction SilentlyContinue
Add 'عملية QParserServer تعمل' ([bool]$p)
$lst = Get-NetTCPConnection -LocalPort 44381 -State Listen -ErrorAction SilentlyContinue
Add 'المنفذ 44381 يستمع' ([bool]$lst)

$key = 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'
$id = '8954e29a-fba6-45e7-8097-ab26f5196080'
$reg = (Get-ItemProperty $key -ErrorAction SilentlyContinue).$id
Add 'تسجيل الإضافة في السجل' $(if ($reg) { $reg } else { 'غير موجود' })
if ($reg) { Add 'ملف manifest موجود' (Test-Path $reg) }
Add 'تشغيل تلقائي (Run)' ((Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue).QuestionParserLocal)

$t = if (Test-Path (Join-Path $App 'cert.thumb')) { (Get-Content (Join-Path $App 'cert.thumb')).Trim() } else { '' }
Add 'الشهادة في Root (موثوقة)' $(if ($t) { Test-Path "Cert:\CurrentUser\Root\$t" } else { 'لا توجد بصمة' })

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $r = Invoke-WebRequest -Uri 'https://localhost:44381/qparser.html' -UseBasicParsing -TimeoutSec 15
    Add 'اختبار https://localhost:44381' ("نجح - الحالة " + $r.StatusCode + " - " + $r.RawContentLength + " بايت")
} catch { Add 'اختبار https://localhost:44381' ('فشل: ' + $_.Exception.Message) }

$sl = Join-Path $App 'server.log'
if (Test-Path $sl) { $L.Add(''); $L.Add('--- server.log (آخر 25 سطراً) ---'); (Get-Content $sl -Tail 25) | ForEach-Object { $L.Add($_) } }
$il = Join-Path $App 'install.log'
if (Test-Path $il) { $L.Add(''); $L.Add('--- install.log (آخر 40 سطراً) ---'); (Get-Content $il -Tail 40) | ForEach-Object { $L.Add($_) } }

[IO.File]::WriteAllLines($Out, $L, (New-Object Text.UTF8Encoding($true)))
Start-Process notepad.exe $Out
