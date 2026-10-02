# محلل الأسئلة - إزالة التثبيت من Word
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
$Title = 'محلل الأسئلة - إزالة'
$opts = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading
while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
    if ([System.Windows.Forms.MessageBox]::Show("أغلق برنامج Word ثم اضغط (نعم).", $Title, 'YesNo', 'Question', 'Button1', $opts) -ne 'Yes') { exit 1 }
}
Remove-Item (Join-Path $env:APPDATA 'Microsoft\Word\STARTUP\QuestionParser.dotm') -Force
Remove-Item (Join-Path $env:LOCALAPPDATA 'QuestionParser') -Recurse -Force
[void][System.Windows.Forms.MessageBox]::Show("تمت إزالة محلل الأسئلة من Word. مستنداتك لم تتأثر.", $Title, 'OK', 'Information', 'Button1', $opts)
