# Arabic Math add-in for Word (Windows) - installer
# One add-in, two tools: Arabic equations + the exam-paper builder (question analyzer).
# Two ways to run it (you choose, and can switch any time by running this installer again):
#   server : the web folder is hosted on your website (HTTPS). The address is optional and editable.
#   local  : a tiny server (https://localhost) runs on this PC and serves the add-in. No site, no internet.
param([ValidateSet('', 'server', 'local')][string]$Mode = '', [string]$Url = '', [string]$UserProfileDir = $env:LOCALAPPDATA, [string]$PkgRoot = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$AddinId     = 'e9182039-0176-4a6e-a259-145b24db2436'
$OldExamId   = '5b7c3e0a-6d1f-4c52-9a38-2f4e8d0b7a91'      # the former stand-alone exam add-in (now merged)
$Title       = 'معادلات عربية - تثبيت'
$Port        = 43892
$TaskName    = 'ArabicMathLocalServer'
$CertName    = 'ArabicMathLocal'
$Here        = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $PkgRoot) { $PkgRoot = Split-Path -Parent $Here }
$Dest        = Join-Path $UserProfileDir 'ArabicMathWord'
$opts = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading

function Show-Msg([string]$text, [string]$icon = 'Information') { [void][System.Windows.Forms.MessageBox]::Show($text, $Title, 'OK', $icon, 'Button1', $opts) }
function Ask-YesNo([string]$text) { return [System.Windows.Forms.MessageBox]::Show($text, $Title, 'YesNo', 'Question', 'Button1', $opts) -eq 'Yes' }
# never throws (tools like schtasks print "cannot find the file" when there is nothing to delete)
function Run-Native([string]$exe, [string[]]$arguments) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { $text = (& $exe @arguments 2>&1 | Out-String); return @{ Code = $LASTEXITCODE; Text = $text.Trim() } }
    finally { $ErrorActionPreference = $old }
}
function Run-Must([string]$exe, [string[]]$arguments) {
    $r = Run-Native $exe $arguments
    if ($r.Code -ne 0) { throw "$exe فشل (الرمز $($r.Code)): $($r.Text)" }
}
function Test-Admin { return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }

# ---- previous choice -----------------------------------------------------------------------------
$cfgPath = Join-Path $Dest 'config.json'
$prev = $null
if (Test-Path $cfgPath) { try { $prev = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { } }
function Get-DefaultUrl {
    if ($prev -and $prev.url) { return [string]$prev.url }
    $f = Join-Path $Here 'addin-url.txt'
    if (Test-Path $f) {
        $u = (Get-Content $f -Encoding UTF8 | Where-Object { $_ -match '^\s*https://' } | Select-Object -First 1)
        if ($u) { return $u.Trim() }
    }
    return 'https://'
}

# ---- the choice window -------------------------------------------------------------------------------
function Show-Choice([string]$defMode, [string]$defUrl) {
    $f = New-Object System.Windows.Forms.Form
    $f.Text = $Title; $f.RightToLeft = 'Yes'; $f.RightToLeftLayout = $true
    $f.StartPosition = 'CenterScreen'; $f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false; $f.MinimizeBox = $false
    $f.ClientSize = New-Object System.Drawing.Size(540, 330)
    $f.Font = New-Object System.Drawing.Font('Segoe UI', 10)

    $intro = New-Object System.Windows.Forms.Label
    $intro.Text = "إضافة واحدة باسم (معادلات عربية) تضم: المعادلات الرياضية والكيميائية + نموذج الأسئلة (محلل الأسئلة).`nاختر أين يعمل ملف الإضافة:"
    $intro.SetBounds(20, 14, 500, 48)

    $rbS = New-Object System.Windows.Forms.RadioButton
    $rbS.Text = 'على خادم / موقع (HTTPS) — الرابط اختياري ويمكن تغييره'
    $rbS.SetBounds(20, 70, 500, 26)

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = 'رابط الخادم (مجلد web مرفوع عليه):'
    $lbl.SetBounds(46, 100, 474, 22)

    $tb = New-Object System.Windows.Forms.TextBox
    $tb.RightToLeft = 'No'; $tb.Text = $defUrl
    $tb.SetBounds(46, 124, 474, 26)

    $rbL = New-Object System.Windows.Forms.RadioButton
    $rbL.Text = 'على هذا الجهاز — بدون موقع وبدون إنترنت'
    $rbL.SetBounds(20, 170, 500, 26)

    $hint = New-Object System.Windows.Forms.Label
    $hint.Text = "يعمل خادم صغير داخل جهازك فقط (https://localhost). يحتاج موافقة المسؤول مرة واحدة،`nويحفظ قوالب Word كملفات حقيقية في المستندات\نموذج الأسئلة\القوالب."
    $hint.ForeColor = [System.Drawing.Color]::DimGray
    $hint.SetBounds(46, 198, 474, 48)

    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = 'تثبيت'; $ok.DialogResult = 'OK'; $ok.SetBounds(20, 280, 110, 34)
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'إلغاء'; $cancel.DialogResult = 'Cancel'; $cancel.SetBounds(140, 280, 110, 34)
    $f.AcceptButton = $ok; $f.CancelButton = $cancel

    $sync = { $tb.Enabled = $rbS.Checked; $lbl.Enabled = $rbS.Checked }
    $rbS.Add_CheckedChanged($sync); $rbL.Add_CheckedChanged($sync)
    if ($defMode -eq 'local') { $rbL.Checked = $true } else { $rbS.Checked = $true }
    & $sync
    $f.Controls.AddRange(@($intro, $rbS, $lbl, $tb, $rbL, $hint, $ok, $cancel))
    if ($f.ShowDialog() -ne 'OK') { return $null }
    if ($rbL.Checked) { return @{ Mode = 'local'; Url = '' } }
    return @{ Mode = 'server'; Url = $tb.Text.Trim() }
}

function Local-Installed { return ((Run-Native 'schtasks' @('/Query', '/TN', $TaskName)).Code -eq 0) -or ((Run-Native 'schtasks' @('/Query', '/TN', 'ExamTemplateAddinServer')).Code -eq 0) }

try {
    if (-not $Mode) {
        $defMode = 'server'; if ($prev -and $prev.mode) { $defMode = [string]$prev.mode }
        $c = Show-Choice $defMode (Get-DefaultUrl)
        if (-not $c) { exit 1 }
        $Mode = $c.Mode; $Url = $c.Url
    }

    # ---- validate -------------------------------------------------------------------------------------
    if ($Mode -eq 'server') {
        $Url = $Url.Trim()
        if ($Url -notmatch '^https://[^/\s]+') { Show-Msg "الرابط يجب أن يبدأ بـ https://`n$Url" 'Error'; exit 1 }
        if (-not $Url.EndsWith('/')) { $Url += '/' }
    } else {
        if (-not (Test-Path -LiteralPath (Join-Path $PkgRoot 'web\taskpane.html'))) {
            throw "لم أجد مجلد web بجانب ملف التثبيت.`nإذا فتحت الملف من داخل ملف zip فاستخرج (Extract All) المجلد كاملاً ثم شغّل (Install.cmd) من المجلد المستخرج.`nالمسار المفحوص: $PkgRoot"
        }
    }

    # ---- administrator rights are needed for local mode, and to clean up a previous local install ---------
    $needAdmin = ($Mode -eq 'local') -or (Local-Installed)
    if ($needAdmin -and -not (Test-Admin)) {
        $a = "-NoProfile -ExecutionPolicy Bypass -STA -File `"$($MyInvocation.MyCommand.Path)`" -Mode $Mode -Url `"$Url`" -UserProfileDir `"$env:LOCALAPPDATA`" -PkgRoot `"$PkgRoot`""
        Start-Process powershell.exe -ArgumentList $a -Verb RunAs
        exit 0
    }
    $admin = Test-Admin
    $InstallLog = Join-Path $UserProfileDir 'ArabicMath-install.log'
    try { Start-Transcript -Path $InstallLog -Force | Out-Null } catch { }

    # the signed-in user (the elevated account may be a different one)
    if ($admin) {
        $User = (Get-CimInstance Win32_ComputerSystem).UserName
        if (-not $User) { $User = "$env:USERDOMAIN\$env:USERNAME" }
        $sid = (New-Object Security.Principal.NTAccount($User)).Translate([Security.Principal.SecurityIdentifier]).Value
        $regBase = "Registry::HKEY_USERS\$sid"
    } else { $regBase = 'HKCU:' }
    $key = "$regBase\Software\Microsoft\Office\16.0\WEF\Developer"

    while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
        if (-not (Ask-YesNo "برنامج Word مفتوح الآن.`nاحفظ عملك وأغلق Word ثم اضغط (نعم) للمتابعة.")) { exit 1 }
    }

    # ---- 1) remove any previous local server (this one and the former stand-alone exam add-in) ---------------
    if ($admin) {
        foreach ($tn in $TaskName, 'ExamTemplateAddinServer') {
            [void](Run-Native 'schtasks' @('/End', '/TN', $tn)); [void](Run-Native 'schtasks' @('/Delete', '/TN', $tn, '/F'))
        }
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*math-server.ps1*' -or $_.CommandLine -like '*exam-server.ps1*' } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        foreach ($p in $Port, 43891) {
            [void](Run-Native 'netsh' @('http', 'delete', 'sslcert', "ipport=0.0.0.0:$p"))
            [void](Run-Native 'netsh' @('http', 'delete', 'sslcert', "ipport=[::]:$p"))
            [void](Run-Native 'netsh' @('http', 'delete', 'urlacl', "url=https://localhost:$p/"))
        }
        foreach ($store in 'My', 'Root') {
            Get-ChildItem "Cert:\LocalMachine\$store" | Where-Object { $_.FriendlyName -in $CertName, 'ExamTemplateAddin' } | Remove-Item -Force -ErrorAction SilentlyContinue
        }
        Remove-Item -Recurse -Force (Join-Path $UserProfileDir 'ExamTemplateAddin') -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
    # the old stand-alone exam add-in is now part of this one
    Remove-ItemProperty -Path $key -Name $OldExamId -ErrorAction SilentlyContinue

    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    $manifestTpl = [IO.File]::ReadAllText((Join-Path $Here 'manifest.template.xml'), [Text.Encoding]::UTF8)

    if ($Mode -eq 'server') {
        $origin = ([Uri]$Url).GetLeftPart([UriPartial]::Authority)
        $base = $Url
        if (Test-Path (Join-Path $Dest 'site')) { Remove-Item (Join-Path $Dest 'site') -Recurse -Force -ErrorAction SilentlyContinue }
        # check that the add-in files are reachable (the exam tool lives under /exam/ in the same web folder)
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $null = Invoke-WebRequest -Uri ($base + 'taskpane.html') -UseBasicParsing -TimeoutSec 20
            $null = Invoke-WebRequest -Uri ($base + 'exam/index.html') -UseBasicParsing -TimeoutSec 20
        } catch {
            if (-not (Ask-YesNo "تعذر فتح الرابط:`n${base}taskpane.html`n${base}exam/index.html`n`nتأكد أن مجلد web (بما فيه exam) مرفوع على الخادم.`nهل تريد المتابعة بالتثبيت رغم ذلك؟")) { exit 1 }
        }
    } else {
        $base = "https://localhost:$Port/"; $origin = "https://localhost:$Port"
        $Site = Join-Path $Dest 'site'
        # 2) copy the add-in files (robocopy: fast and restartable)
        $rc = Run-Native 'robocopy' @((Join-Path $PkgRoot 'web'), $Site, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1')
        if ($rc.Code -ge 8) { throw "نسخ ملفات الإضافة فشل (robocopy $($rc.Code)): $($rc.Text)" }
        Copy-Item (Join-Path $Here 'math-server.ps1') $Dest -Force

        # 3) certificate for https://localhost (trusted on this PC only)
        $cert = New-SelfSignedCertificate -DnsName 'localhost' -FriendlyName $CertName -CertStoreLocation Cert:\LocalMachine\My -NotAfter (Get-Date).AddYears(10)
        $cer = Join-Path $Dest 'localhost.cer'
        Export-Certificate -Cert $cert -FilePath $cer | Out-Null
        Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\Root | Out-Null

        # 4) bind the certificate and allow the user to listen on the port
        $appid = '{' + [guid]::NewGuid().ToString() + '}'
        Run-Must 'netsh' @('http', 'add', 'sslcert', "ipport=0.0.0.0:$Port", "certhash=$($cert.Thumbprint)", "appid=$appid")
        [void](Run-Native 'netsh' @('http', 'add', 'sslcert', "ipport=[::]:$Port", "certhash=$($cert.Thumbprint)", "appid=$appid"))   # IPv6 may be off
        Run-Must 'netsh' @('http', 'add', 'urlacl', "url=https://localhost:$Port/", "user=$User")

        # 5) start the server at every sign-in, and now
        $srv = Join-Path $Dest 'math-server.ps1'
        $out = Join-Path $Dest 'server-out.log'
        $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ("-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -Command `"& '$srv' -Port $Port *> '$out'`"")
        $trg = New-ScheduledTaskTrigger -AtLogOn -User $User
        $prn = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
        $set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
        [void](Register-ScheduledTask -TaskName $TaskName -Action $act -Trigger $trg -Principal $prn -Settings $set -Force)
        Start-ScheduledTask -TaskName $TaskName

        # Word's embedded browser blocks loopback addresses by default
        [void](Run-Native 'CheckNetIsolation' @('LoopbackExempt', '-a', '-n=microsoft.win32webviewhost_cw5n1h2txyewy'))
    }

    # ---- write the manifest and register it for the signed-in user (Word 2016/2019/2021/365 all use 16.0) ---------
    $xml = $manifestTpl.Replace('{{BASE_URL}}', $base).Replace('{{ORIGIN}}', $origin)
    $manifest = Join-Path $Dest 'manifest.xml'
    [IO.File]::WriteAllText($manifest, $xml, (New-Object Text.UTF8Encoding($false)))
    $cfg = @{ mode = $Mode; url = $(if ($Mode -eq 'server') { $base } else { '' }); version = '1.1.0' } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($cfgPath, $cfg, (New-Object Text.UTF8Encoding($false)))
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name $AddinId -Value $manifest -PropertyType String -Force | Out-Null

    # clear the Office add-in cache so the new version is picked up
    $wef = Join-Path $UserProfileDir 'Microsoft\Office\16.0\Wef'
    if (Test-Path $wef) { Get-ChildItem $wef -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }

    # ---- local mode: check that the server answers --------------------------------------------------------------------
    if ($Mode -eq 'local') {
        $ok = $false
        for ($i = 0; $i -lt 6 -and -not $ok; $i++) {
            Start-Sleep -Seconds 4
            try {
                $r = Invoke-WebRequest -Uri "${base}taskpane.html" -UseBasicParsing -TimeoutSec 10
                $e = Invoke-WebRequest -Uri "${base}exam/index.html" -UseBasicParsing -TimeoutSec 10
                $p = Invoke-WebRequest -Uri "${base}api/ping" -Headers @{ 'X-Exam' = '1' } -UseBasicParsing -TimeoutSec 10
                $ok = ($r.StatusCode -eq 200 -and $e.StatusCode -eq 200 -and $p.StatusCode -eq 200)
            } catch { }
        }
        if (-not $ok) {
            $log = Join-Path $Dest 'server.log'
            try { $ti = Get-ScheduledTaskInfo -TaskName $TaskName; $info = "المهمة: النتيجة $($ti.LastTaskResult) آخر تشغيل $($ti.LastRunTime)" } catch { $info = 'المهمة المجدولة غير موجودة' }
            $tail = if (Test-Path $log) { (Get-Content $log -Tail 6 -Encoding UTF8) -join "`n" } else { '(لا يوجد server.log)' }
            if (Test-Path $out) { $tail += "`n" + ((Get-Content $out -Tail 8 -Encoding UTF8) -join "`n") }
            "$info`n$tail" | Out-File (Join-Path $UserProfileDir 'ArabicMath-server-diag.log') -Encoding UTF8
            Show-Msg "تم التثبيت لكن الخادم المحلي لم يستجب بعد.`nأعد تشغيل الجهاز ثم افتح Word. إن لم يظهر التبويب فأرسل هذه الرسالة:`n`n$info`n$tail" 'Warning'
            try { Stop-Transcript | Out-Null } catch { }
            exit 0
        }
    }

    $where = if ($Mode -eq 'local') { 'على هذا الجهاز (بدون إنترنت)' } else { "على الخادم: $base" }
    Show-Msg "تم التثبيت بنجاح ✔`n`nافتح Word وستجد تبويباً باسم (معادلات عربية) فيه زرّان:`n  • محرر المعادلات`n  • نموذج الأسئلة (محلل الأسئلة)`n`nيعمل $where`nلتغيير الطريقة شغّل Install.cmd مرة أخرى."
    try { Stop-Transcript | Out-Null } catch { }
    exit 0
}
catch {
    Show-Msg ("حدث خطأ أثناء التثبيت:`n" + $_.Exception.Message + "`n`n(السطر: " + $_.InvocationInfo.ScriptLineNumber + ")`nالسجل: " + (Join-Path $UserProfileDir 'ArabicMath-install.log')) 'Error'
    try { Stop-Transcript | Out-Null } catch { }
    exit 1
}
