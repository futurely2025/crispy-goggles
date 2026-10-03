# Arabic Math add-in for Word - uninstaller (removes the server or the local installation, whichever is present)
param([string]$UserProfileDir = $env:LOCALAPPDATA)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
$AddinId   = 'e9182039-0176-4a6e-a259-145b24db2436'
$OldExamId = '5b7c3e0a-6d1f-4c52-9a38-2f4e8d0b7a91'
$Title     = 'معادلات عربية - إزالة'
$Port      = 43892
$opts = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

function HasTask([string]$n) { & schtasks /Query /TN $n *> $null; return ($LASTEXITCODE -eq 0) }
$hasLocal = (HasTask 'ArabicMathLocalServer') -or (HasTask 'ExamTemplateAddinServer')
if ($hasLocal -and -not $isAdmin) {
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -STA -File `"$($MyInvocation.MyCommand.Path)`" -UserProfileDir `"$env:LOCALAPPDATA`"" -Verb RunAs
    exit 0
}
while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
    $r = [System.Windows.Forms.MessageBox]::Show("أغلق برنامج Word ثم اضغط (نعم).", $Title, 'YesNo', 'Question', 'Button1', $opts)
    if ($r -ne 'Yes') { exit 1 }
}
if ($isAdmin) {
    foreach ($tn in 'ArabicMathLocalServer', 'ExamTemplateAddinServer') { & schtasks /End /TN $tn | Out-Null; & schtasks /Delete /TN $tn /F | Out-Null }
    Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*math-server.ps1*' -or $_.CommandLine -like '*exam-server.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    foreach ($p in $Port, 43891) {
        & netsh http delete sslcert ipport=0.0.0.0:$p | Out-Null
        & netsh http delete sslcert ipport=[::]:$p | Out-Null
        & netsh http delete urlacl url=https://localhost:$p/ | Out-Null
    }
    Get-ChildItem Cert:\LocalMachine\My, Cert:\LocalMachine\Root | Where-Object { $_.FriendlyName -in 'ArabicMathLocal', 'ExamTemplateAddin' } | Remove-Item -Force
    Remove-Item -Recurse -Force (Join-Path $UserProfileDir 'ExamTemplateAddin')
    $User = (Get-CimInstance Win32_ComputerSystem).UserName
    $sid = (New-Object Security.Principal.NTAccount($User)).Translate([Security.Principal.SecurityIdentifier]).Value
    $key = "Registry::HKEY_USERS\$sid\Software\Microsoft\Office\16.0\WEF\Developer"
} else { $key = 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer' }
Remove-ItemProperty -Path $key -Name $AddinId
Remove-ItemProperty -Path $key -Name $OldExamId
Remove-Item -Recurse -Force (Join-Path $UserProfileDir 'ArabicMathWord')
$wef = Join-Path $UserProfileDir 'Microsoft\Office\16.0\Wef'
if (Test-Path $wef) { Get-ChildItem $wef -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }

[void][System.Windows.Forms.MessageBox]::Show("تمت إزالة الإضافة. المعادلات والنماذج في مستنداتك وقوالبك في المستندات\نموذج الأسئلة تبقى كما هي.", $Title, 'OK', 'Information', 'Button1', $opts)
