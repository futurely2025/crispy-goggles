# نسخ ملفات المحلل إلى مجلد web الخاص بموقعك (بجانب taskpane.html) — لا يستبدل أي ملف من مشروعك
Add-Type -AssemblyName System.Windows.Forms
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Src  = Join-Path (Split-Path -Parent $Here) 'qparser-files'
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = 'اختر مجلد web الخاص بمعادلات عربية (الذي فيه taskpane.html)'
if ($dlg.ShowDialog() -ne 'OK') { exit 1 }
$t = $dlg.SelectedPath
if (-not (Test-Path (Join-Path $t 'taskpane.html'))) { Write-Host "✘ هذا ليس مجلد web الصحيح (لا يوجد فيه taskpane.html): $t" -ForegroundColor Red; exit 1 }
Copy-Item (Join-Path $Src 'qparser.html')          $t -Force
Copy-Item (Join-Path $Src 'qparser-commands.html') $t -Force
Copy-Item (Join-Path $Src 'qparser-assets')        $t -Recurse -Force
Write-Host '✔ تم النسخ. الآن ارفع مجلد web كاملاً إلى موقعك كما تفعل دائماً.' -ForegroundColor Green
