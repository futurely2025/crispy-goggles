# محلل الأسئلة - إزالة التثبيت المحلي
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
$Title = 'محلل الأسئلة - إزالة'
$AddinId = '8954e29a-fba6-45e7-8097-ab26f5196080'
$App = Join-Path $env:LOCALAPPDATA 'QuestionParserWord'
$opts = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading
while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
    if ([System.Windows.Forms.MessageBox]::Show("أغلق برنامج Word ثم اضغط (نعم).", $Title, 'YesNo', 'Question', 'Button1', $opts) -ne 'Yes') { exit 1 }
}
Get-Process -Name QParserServer | Stop-Process -Force
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer' -Name $AddinId
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'QuestionParserLocal'
$tf = Join-Path $App 'cert.thumb'
if (Test-Path $tf) {
    $t = (Get-Content $tf).Trim()
    Remove-Item "Cert:\CurrentUser\Root\$t"
    Remove-Item "Cert:\CurrentUser\My\$t"
}
Start-Sleep -Milliseconds 500
Remove-Item -Recurse -Force $App
$wef = Join-Path $env:LOCALAPPDATA 'Microsoft\Office\16.0\Wef'
if (Test-Path $wef) { Get-ChildItem $wef -Force | Remove-Item -Recurse -Force }
[void][System.Windows.Forms.MessageBox]::Show("تمت إزالة محلل الأسئلة. مستنداتك لم تتأثر.", $Title, 'OK', 'Information', 'Button1', $opts)
