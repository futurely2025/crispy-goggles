# إزالة كل ما ثبّته "محلل الأسئلة" سابقاً (إضافة Word، الخادم المحلي، القالب) - لا يلمس "معادلات عربية" إطلاقاً
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
$Title = 'إزالة تثبيتات محلل الأسئلة'
$opts = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading
while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
    if ([System.Windows.Forms.MessageBox]::Show("أغلق برنامج Word ثم اضغط (نعم).", $Title, 'YesNo', 'Question', 'Button1', $opts) -ne 'Yes') { exit 1 }
}
$removed = New-Object System.Collections.Generic.List[string]

# 1) الخادم المحلي
if (Get-Process -Name QParserServer) { Get-Process -Name QParserServer | Stop-Process -Force; $removed.Add('إيقاف الخادم المحلي') }
Start-Sleep -Milliseconds 500

# 2) تسجيلات السجل الخاصة بمحلل الأسئلة فقط (المعرّف 8954e29a...)
$dev = 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'
if ((Get-ItemProperty $dev).'8954e29a-fba6-45e7-8097-ab26f5196080') {
    Remove-ItemProperty -Path $dev -Name '8954e29a-fba6-45e7-8097-ab26f5196080'; $removed.Add('تسجيل الإضافة في Word')
}
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if ((Get-ItemProperty $run).QuestionParserLocal) { Remove-ItemProperty -Path $run -Name 'QuestionParserLocal'; $removed.Add('التشغيل التلقائي للخادم') }

# 3) الشهادة المحلية
$app = Join-Path $env:LOCALAPPDATA 'QuestionParserWord'
$tf = Join-Path $app 'cert.thumb'
if (Test-Path $tf) {
    $t = (Get-Content $tf).Trim()
    Remove-Item "Cert:\CurrentUser\Root\$t"; Remove-Item "Cert:\CurrentUser\My\$t"; $removed.Add('شهادة localhost')
}

# 4) الملفات
foreach ($d in @($app, (Join-Path $env:LOCALAPPDATA 'QuestionParser'))) {
    if (Test-Path $d) { Remove-Item $d -Recurse -Force; $removed.Add("مجلد $d") }
}
$dotm = Join-Path $env:APPDATA 'Microsoft\Word\STARTUP\QuestionParser.dotm'
if (Test-Path $dotm) { Remove-Item $dotm -Force; $removed.Add('قالب Word (QuestionParser.dotm)') }

# 5) تفريغ كاش إضافات Office ليُعاد تحميلها نظيفة
$wef = Join-Path $env:LOCALAPPDATA 'Microsoft\Office\16.0\Wef'
if (Test-Path $wef) { Get-ChildItem $wef -Force | Remove-Item -Recurse -Force; $removed.Add('كاش إضافات Office') }

$msg = if ($removed.Count) { "تمت الإزالة:`n- " + ($removed -join "`n- ") } else { 'لم يوجد أي تثبيت لمحلل الأسئلة على هذا الجهاز.' }
$msg += "`n`nافتح Word الآن. إن لم يظهر تبويب (معادلات عربية) فشغّل Install.cmd الخاص به مرة أخرى (من مجلده)."
[void][System.Windows.Forms.MessageBox]::Show($msg, $Title, 'OK', 'Information', 'Button1', $opts)
