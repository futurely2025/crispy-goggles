# Arabic Math add-in for Word - uninstaller
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
$AddinId = 'e9182039-0176-4a6e-a259-145b24db2436'
$Title   = 'معادلات عربية - إزالة'
$opts = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading

while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
    $r = [System.Windows.Forms.MessageBox]::Show("أغلق برنامج Word ثم اضغط (نعم).", $Title, 'YesNo', 'Question', 'Button1', $opts)
    if ($r -ne 'Yes') { exit 1 }
}

Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer' -Name $AddinId -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $env:LOCALAPPDATA 'ArabicMathWord') -ErrorAction SilentlyContinue
$wef = Join-Path $env:LOCALAPPDATA 'Microsoft\Office\16.0\Wef'
if (Test-Path $wef) { Get-ChildItem $wef -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }

[void][System.Windows.Forms.MessageBox]::Show("تمت إزالة الإضافة. المعادلات الموجودة في مستنداتك تبقى كما هي (كصور).", $Title, 'OK', 'Information', 'Button1', $opts)
