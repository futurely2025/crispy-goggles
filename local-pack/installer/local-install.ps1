# محلل الأسئلة - إضافة Word منفصلة (تعمل محلياً بدون استضافة وبدون Python). لا تلمس أي إضافة أخرى.
$ErrorActionPreference = 'Stop'
$Log = Join-Path $env:TEMP 'qparser-local-install.log'
try { Start-Transcript -Path $Log -Force | Out-Null } catch { }
$AddinId = 'c9720014-1fbb-4c7c-a750-dc0d07cc4fbd'
$Port = 44381; $Base = "https://localhost:$Port/"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $Here
$App  = Join-Path $env:LOCALAPPDATA 'QuestionParserWord'
function Step([string]$t) { Write-Host ''; Write-Host $t -ForegroundColor Cyan }
function Ok([string]$t)   { Write-Host "    OK  $t" -ForegroundColor Green }
function Warn([string]$t) { Write-Host "    !!  $t" -ForegroundColor Yellow }
Write-Host '=== محلل الأسئلة - إضافة Word منفصلة ===' -ForegroundColor White
try {
    Step '[1/8] التأكد من إغلاق Word'
    while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
        Warn 'Word مفتوح (قد يعمل في الخلفية). أغلقه واضغط Enter، أو اكتب K ثم Enter لإغلاقه تلقائياً (دون حفظ!)'
        $a = Read-Host '     >'
        if ($a -match '^[kK]') { Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 2 }
    }
    Get-Process -Name QParserServer -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 500
    Ok 'Word مغلق'

    Step '[2/8] نسخ الملفات'
    New-Item -ItemType Directory -Force -Path $App | Out-Null
    Copy-Item (Join-Path $Root 'web') $App -Recurse -Force
    Ok $App

    Step '[3/8] ترجمة الخادم المحلي (بمترجم .NET الموجود في Windows)'
    $csc = Join-Path $env:windir 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    if (-not (Test-Path $csc)) { $csc = Join-Path $env:windir 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
    $exe = Join-Path $App 'QParserServer.exe'
    & $csc /nologo /target:winexe "/out:$exe" /r:System.dll /r:System.Core.dll (Join-Path $Root 'local\QParserServer.cs') | Out-Null
    if (-not (Test-Path $exe)) { throw 'فشلت ترجمة الخادم المحلي.' }
    Ok $exe

    Step '[4/8] شهادة localhost (مرة واحدة) - سيظهر تحذير أمان من Windows: اضغط (نعم / Yes)'
    $pfx = Join-Path $App 'cert.pfx'; $cer = Join-Path $App 'cert.cer'; $tf = Join-Path $App 'cert.thumb'
    if (-not (Test-Path $pfx)) {
        $c = New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation 'Cert:\CurrentUser\My' -FriendlyName 'QParser Local' -NotAfter (Get-Date).AddYears(10) -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable
        $pw = ConvertTo-SecureString 'qparser' -AsPlainText -Force
        Export-PfxCertificate -Cert $c -FilePath $pfx -Password $pw | Out-Null
        Export-Certificate -Cert $c -FilePath $cer | Out-Null
        Set-Content -Path $tf -Value $c.Thumbprint
    }
    Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
    Ok 'الشهادة موثوقة'

    Step '[5/8] تشغيل الخادم'
    New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'QuestionParserLocal' -Value ('"' + $exe + '"') -PropertyType String -Force | Out-Null
    Start-Process -FilePath $exe -WorkingDirectory $App
    Start-Sleep -Seconds 2
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    try { $r = Invoke-WebRequest -Uri ($Base + 'qparser.html') -UseBasicParsing -TimeoutSec 15; Ok ("https://localhost يعمل (الحالة " + $r.StatusCode + ')') }
    catch { Warn ('اختبار https://localhost فشل: ' + $_.Exception.Message) }

    Step '[6/8] تسجيل الإضافة في Word (معرّف مستقل)'
    $tpl = [IO.File]::ReadAllText((Join-Path $Here 'manifest.template.xml'), [Text.Encoding]::UTF8)
    $xml = $tpl.Replace('{{BASE_URL}}', $Base).Replace('{{ORIGIN}}', $Base.TrimEnd('/'))
    $manifest = Join-Path $App 'manifest.xml'
    [IO.File]::WriteAllText($manifest, $xml, (New-Object Text.UTF8Encoding($false)))
    $key = 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name $AddinId -Value $manifest -PropertyType String -Force | Out-Null
    Ok $manifest

    Step '[7/8] تفريغ كاش إضافات Office'
    $wef = Join-Path $env:LOCALAPPDATA 'Microsoft\Office\16.0\Wef'
    if (Test-Path $wef) { Get-ChildItem $wef -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }
    Ok 'تم'

    Step '[8/8] فحص التسجيل - الإضافات المسجّلة الآن في Word:'
    $props = Get-ItemProperty $key
    $props.PSObject.Properties | Where-Object { $_.Name -match '^[0-9a-f]{8}-' } | ForEach-Object {
        $exists = Test-Path $_.Value
        Write-Host ('    ' + $_.Name + '  ->  ' + $_.Value + $(if ($exists) { '' } else { '   (الملف غير موجود!)' }))
    }
    Write-Host ''
    Write-Host '  ✔ اكتمل. افتح Word الآن. يجب أن يظهر تبويب (محلل الأسئلة) بجانب (معادلات عربية).' -ForegroundColor Green
    Write-Host '  إن لم يظهر: صوّر هذه النافذة (أو انسخ ما فيها) وأرسلها لي.'
}
catch {
    Write-Host ''
    Write-Host ('  ✘ فشل: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host "  السجل: $Log"
}
finally { try { Stop-Transcript | Out-Null } catch { } }
