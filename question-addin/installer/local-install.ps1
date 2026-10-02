# محلل الأسئلة - تثبيت محلي في Word (بدون استضافة وبدون Python) - Windows
# يعمل بدون صلاحيات مدير: ينسخ الملفات، يترجم الخادم المحلي، ينشئ شهادة localhost ويثق بها، يسجل الإضافة ويشغل الخادم.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$Title  = 'محلل الأسئلة - تثبيت محلي'
$AddinId = '8954e29a-fba6-45e7-8097-ab26f5196080'
$Port   = 44381
$Base   = "https://localhost:$Port/"
$Here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root   = Split-Path -Parent $Here
$App    = Join-Path $env:LOCALAPPDATA 'QuestionParserWord'
$opts   = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading
function Show-Msg([string]$t, [string]$icon = 'Information') { [void][System.Windows.Forms.MessageBox]::Show($t, $Title, 'OK', $icon, 'Button1', $opts) }
function Ask-YesNo([string]$t) { return [System.Windows.Forms.MessageBox]::Show($t, $Title, 'YesNo', 'Question', 'Button1', $opts) -eq 'Yes' }

New-Item -ItemType Directory -Force -Path $App | Out-Null
$Log = Join-Path $App 'install.log'
try { Start-Transcript -Path $Log -Force | Out-Null } catch { }

try {
    while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
        if (-not (Ask-YesNo "برنامج Word مفتوح الآن.`nاحفظ عملك وأغلق Word ثم اضغط (نعم) للمتابعة.")) { exit 1 }
    }
    Get-Process -Name QParserServer -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 400

    # 1) الملفات
    New-Item -ItemType Directory -Force -Path $App | Out-Null
    Copy-Item (Join-Path $Root 'web') $App -Recurse -Force

    # 2) ترجمة الخادم بمترجم .NET الموجود في Windows
    $csc = Join-Path $env:windir 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    if (-not (Test-Path $csc)) { $csc = Join-Path $env:windir 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
    if (-not (Test-Path $csc)) { throw 'لم يتم العثور على مترجم .NET Framework 4 في Windows.' }
    $exe = Join-Path $App 'QParserServer.exe'
    & $csc /nologo /target:winexe "/out:$exe" /r:System.dll /r:System.Core.dll (Join-Path $Here '..\local\QParserServer.cs') | Out-Null
    if (-not (Test-Path $exe)) { throw 'فشلت ترجمة الخادم المحلي.' }

    # 3) الشهادة (مرة واحدة) ثم الوثوق بها
    $pfx = Join-Path $App 'cert.pfx'; $cer = Join-Path $App 'cert.cer'; $thumbFile = Join-Path $App 'cert.thumb'
    if (-not (Test-Path $pfx)) {
        $c = New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation 'Cert:\CurrentUser\My' `
             -FriendlyName 'QParser Local' -NotAfter (Get-Date).AddYears(10) -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable
        $pw = ConvertTo-SecureString 'qparser' -AsPlainText -Force
        Export-PfxCertificate -Cert $c -FilePath $pfx -Password $pw | Out-Null
        Export-Certificate    -Cert $c -FilePath $cer | Out-Null
        Set-Content -Path $thumbFile -Value $c.Thumbprint
    }
    [void][System.Windows.Forms.MessageBox]::Show("الآن سيظهر تحذير أمان من Windows عن شهادة (localhost).`nاضغط (نعم / Yes) — الشهادة لجهازك فقط ليقبل Word العنوان https://localhost", $Title, 'OK', 'Information', 'Button1', $opts)
    Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null

    # 4) تسجيل الإضافة في Word
    $tpl = [IO.File]::ReadAllText((Join-Path $Here 'manifest.template.xml'), [Text.Encoding]::UTF8)
    $xml = $tpl.Replace('{{BASE_URL}}', $Base).Replace('{{ORIGIN}}', $Base.TrimEnd('/'))
    $manifest = Join-Path $App 'manifest.xml'
    [IO.File]::WriteAllText($manifest, $xml, (New-Object Text.UTF8Encoding($false)))
    $key = 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name $AddinId -Value $manifest -PropertyType String -Force | Out-Null
    $wef = Join-Path $env:LOCALAPPDATA 'Microsoft\Office\16.0\Wef'
    if (Test-Path $wef) { Get-ChildItem $wef -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }

    # 5) تشغيل تلقائي مع Windows + تشغيل الآن
    New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'QuestionParserLocal' -Value ('"' + $exe + '"') -PropertyType String -Force | Out-Null
    Start-Process -FilePath $exe -WorkingDirectory $App
    # بعض نسخ Word القديمة تمنع الاتصال بـ localhost حتى يُستثنى (قد يفشل بصمت وهذا عادي)
    try { & CheckNetIsolation LoopbackExempt -a -n=microsoft.win32webviewhost_cw5n1h2txyewy 2>$null | Out-Null } catch { }

    # 6) اختبار ذاتي: هل يردّ الخادم عبر HTTPS والشهادة موثوقة؟
    Start-Sleep -Seconds 2
    $procOk = [bool](Get-Process -Name QParserServer -ErrorAction SilentlyContinue)
    $httpsOk = $false; $httpsErr = ''
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $r = Invoke-WebRequest -Uri ($Base + 'qparser.html') -UseBasicParsing -TimeoutSec 15
        $httpsOk = ($r.StatusCode -eq 200)
    } catch { $httpsErr = $_.Exception.Message }
    $report = "الخادم يعمل: " + $(if ($procOk) { 'نعم' } else { 'لا' }) + "`nاختبار https://localhost: " + $(if ($httpsOk) { 'نجح ✔' } else { 'فشل ✘ ' + $httpsErr })
    if ($procOk -and $httpsOk) {
        Show-Msg "تم التثبيت بنجاح ✔`n`n$report`n`nافتح Word ثم تبويب (محلل الأسئلة) ثم زر (تحليل الأسئلة)."
    } else {
        Show-Msg "اكتمل التثبيت لكن الاختبار الذاتي فشل ✘`n`n$report`n`nشغّل ملف Diagnose.cmd وأرسل التقرير الذي يفتح لك.`nملف السجل: $Log" 'Warning'
    }
}
catch {
    Show-Msg ("حدث خطأ أثناء التثبيت:`n" + $_.Exception.Message) 'Error'
    exit 1
}
try { Stop-Transcript | Out-Null } catch { }
