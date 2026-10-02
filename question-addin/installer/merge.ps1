# يدمج ملفات محلل الأسئلة داخل مجلد web الخاص بالمشروع الأول (دومين واحد لمشروعين)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$Title = 'محلل الأسئلة - دمج مع الموقع'
$opts = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Src  = Join-Path (Split-Path -Parent $Here) 'web'

try {
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = 'اختر مجلد web الخاص بالمشروع الأول (الذي فيه taskpane.html)'
    if ($dlg.ShowDialog() -ne 'OK') { exit 1 }
    $target = $dlg.SelectedPath
    if (-not (Test-Path (Join-Path $target 'taskpane.html'))) {
        [void][System.Windows.Forms.MessageBox]::Show("هذا ليس مجلد web الصحيح (لا يوجد فيه taskpane.html):`n$target", $Title, 'OK', 'Error', 'Button1', $opts)
        exit 1
    }
    Copy-Item (Join-Path $Src 'qparser.html')          $target -Force
    Copy-Item (Join-Path $Src 'qparser-commands.html') $target -Force
    Copy-Item (Join-Path $Src 'qparser-assets')        $target -Recurse -Force
    [void][System.Windows.Forms.MessageBox]::Show("تم الدمج ✔`n`nالآن ارفع مجلد web هذا كاملاً إلى موقعك مرة واحدة (فيه المشروعان).`nلم يُستبدل أي ملف من المشروع الأول.", $Title, 'OK', 'Information', 'Button1', $opts)
}
catch {
    [void][System.Windows.Forms.MessageBox]::Show("حدث خطأ:`n" + $_.Exception.Message, $Title, 'OK', 'Error', 'Button1', $opts)
    exit 1
}
