# Converts the given Word files to PDF using the Word installed on this PC (identical to File > Export > PDF).
# Usage: drag one or more .docx files onto docx-to-pdf.cmd
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Files)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$opts = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading
if (-not $Files -or $Files.Count -eq 0) {
    [void][System.Windows.Forms.MessageBox]::Show("اسحب ملف Word وأفلته على docx-to-pdf.cmd", 'تحويل إلى PDF', 'OK', 'Information', 'Button1', $opts); exit 1
}
$word = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $done = @()
    foreach ($f in $Files) {
        $in = (Resolve-Path -LiteralPath $f).Path
        $out = [IO.Path]::ChangeExtension($in, '.pdf')
        $doc = $word.Documents.Open($in, $false, $true)          # read-only
        $doc.ExportAsFixedFormat($out, 17, $false, 0, 0, 0, 0, 0, $true, $true, 0, $true, $true, $false)   # 17 = PDF
        $doc.Close($false)
        $done += $out
    }
    [void][System.Windows.Forms.MessageBox]::Show("تم إنشاء:`n" + ($done -join "`n"), 'تحويل إلى PDF', 'OK', 'Information', 'Button1', $opts)
} catch {
    [void][System.Windows.Forms.MessageBox]::Show("تعذر التحويل:`n" + $_.Exception.Message, 'تحويل إلى PDF', 'OK', 'Error', 'Button1', $opts); exit 1
} finally {
    if ($word) { $word.Quit($false) }
}
