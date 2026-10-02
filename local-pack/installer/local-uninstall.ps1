# إزالة محلل الأسئلة (الإضافة المنفصلة) فقط - لا تلمس أي إضافة أخرى
$ErrorActionPreference = 'SilentlyContinue'
$Ids = @('c9720014-1fbb-4c7c-a750-dc0d07cc4fbd', '8954e29a-fba6-45e7-8097-ab26f5196080')    # الحالي + القديم (من المحاولات السابقة)
while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
    Write-Host 'Word مفتوح. أغلقه واضغط Enter (أو K لإغلاقه تلقائياً).' -ForegroundColor Yellow
    $a = Read-Host '>'
    if ($a -match '^[kK]') { Get-Process -Name WINWORD | Stop-Process -Force; Start-Sleep -Seconds 2 }
}
Get-Process -Name QParserServer | Stop-Process -Force
foreach ($i in $Ids) { Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer' -Name $i }
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'QuestionParserLocal'
$app = Join-Path $env:LOCALAPPDATA 'QuestionParserWord'
$tf = Join-Path $app 'cert.thumb'
if (Test-Path $tf) { $t = (Get-Content $tf).Trim(); Remove-Item "Cert:\CurrentUser\Root\$t"; Remove-Item "Cert:\CurrentUser\My\$t" }
Start-Sleep -Milliseconds 500
Remove-Item $app -Recurse -Force
Remove-Item (Join-Path $env:LOCALAPPDATA 'QuestionParser') -Recurse -Force
Remove-Item (Join-Path $env:APPDATA 'Microsoft\Word\STARTUP\QuestionParser.dotm') -Force
$wef = Join-Path $env:LOCALAPPDATA 'Microsoft\Office\16.0\Wef'
if (Test-Path $wef) { Get-ChildItem $wef -Force | Remove-Item -Recurse -Force }
Write-Host '✔ تمت إزالة محلل الأسئلة فقط. (معادلات عربية لم تُمس)' -ForegroundColor Green
