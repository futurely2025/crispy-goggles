# محلل الأسئلة - تثبيت داخل Word (قالب ببدء التشغيل + زر في الشريط) - بدون استضافة وبدون خادم
# يعمل بدون صلاحيات مدير. يُنشئ الملف %APPDATA%\Microsoft\Word\STARTUP\QuestionParser.dotm
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Title = 'محلل الأسئلة - تثبيت في Word'
$Here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root  = Split-Path -Parent $Here
$opts  = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading
function Show-Msg([string]$t, [string]$icon = 'Information') { [void][System.Windows.Forms.MessageBox]::Show($t, $Title, 'OK', $icon, 'Button1', $opts) }
function Ask-YesNo([string]$t) { return [System.Windows.Forms.MessageBox]::Show($t, $Title, 'YesNo', 'Question', 'Button1', $opts) -eq 'Yes' }
function V([string]$s) { return (($s.ToCharArray() | ForEach-Object { 'ChrW(' + [int]$_ + ')' }) -join ' & ') }   # نص عربي آمن داخل VBA

$App     = Join-Path $env:LOCALAPPDATA 'QuestionParser'
$Startup = Join-Path $env:APPDATA 'Microsoft\Word\STARTUP'
$Dotm    = Join-Path $Startup 'QuestionParser.dotm'
$SecKey  = 'HKCU:\Software\Microsoft\Office\16.0\Word\Security'
$word = $null; $prevVbom = $null; $touchedVbom = $false

try {
    while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
        if (-not (Ask-YesNo "برنامج Word مفتوح الآن.`nاحفظ عملك وأغلق Word ثم اضغط (نعم) للمتابعة.")) { exit 1 }
    }

    # 1) صفحة المحلل (ملف واحد)
    New-Item -ItemType Directory -Force -Path $App | Out-Null
    Copy-Item (Join-Path $Root 'QuestionParser.html') (Join-Path $App 'QuestionParser.html') -Force
    New-Item -ItemType Directory -Force -Path $Startup | Out-Null

    # 2) السماح مؤقتاً بإنشاء الماكرو برمجياً (يُعاد كما كان في النهاية)
    New-Item -Path $SecKey -Force | Out-Null
    $prevVbom = (Get-ItemProperty -Path $SecKey -Name AccessVBOM -ErrorAction SilentlyContinue).AccessVBOM
    Set-ItemProperty -Path $SecKey -Name AccessVBOM -Value 1 -Type DWord
    $touchedVbom = $true

    # 3) كود الماكرو (الرسائل العربية تُحقن كرموز)
    $vba = [IO.File]::ReadAllText((Join-Path $Root 'word\QuestionParser.bas'), [Text.Encoding]::UTF8)
    $vba = $vba.Replace('{{MSG_OPEN}}',    (V 'افتح ملف الأسئلة في Word أولاً.'))
    $vba = $vba.Replace('{{MSG_MISSING}}', (V 'لم يتم العثور على ملفات المحلل. أعد تشغيل التثبيت.'))
    $vba = $vba.Replace('{{MSG_ERR}}',     (V 'تعذر التحليل:'))
    $vba = $vba.Replace('{{TITLE}}',       (V 'محلل الأسئلة'))
    $vba = ($vba -split "`r?`n") -join "`r`n"

    # 4) إنشاء القالب عبر Word نفسه
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Add()
    $mod = $doc.VBProject.VBComponents.Add(1)
    $mod.Name = 'QuestionParser'
    $mod.CodeModule.AddFromString($vba)
    if (Test-Path $Dotm) { Remove-Item $Dotm -Force }
    try { $doc.SaveAs2([ref]$Dotm, [ref]13) } catch { $doc.SaveAs2($Dotm, 13) }   # 13 = قالب بماكرو (.dotm)
    $doc.Close(0)
    $word.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
    $word = $null
    if (-not (Test-Path $Dotm)) { throw 'لم يتم إنشاء ملف القالب.' }

    # 5) إضافة زر الشريط (customUI) داخل القالب
    $ui = [IO.File]::ReadAllText((Join-Path $Root 'word\customUI14.xml'), [Text.Encoding]::UTF8)
    $ui = $ui.Replace('{{TAB}}', 'محلل الأسئلة').Replace('{{GROUP}}', 'الأسئلة').Replace('{{BUTTON}}', 'تحليل الأسئلة').Replace('{{TIP}}', 'يحلل أسئلة الصح والخطأ والاختيار من متعدد في المستند المفتوح ويفتح التقرير.')
    $zip = [IO.Compression.ZipFile]::Open($Dotm, 'Update')
    try {
        $e = $zip.CreateEntry('customUI/customUI14.xml')
        $sw = New-Object IO.StreamWriter($e.Open(), (New-Object Text.UTF8Encoding($false)))
        $sw.Write($ui); $sw.Close()
        $rels = $zip.GetEntry('_rels/.rels')
        $sr = New-Object IO.StreamReader($rels.Open(), [Text.Encoding]::UTF8)
        $txt = $sr.ReadToEnd(); $sr.Close()
        $rels.Delete()
        $add = '<Relationship Id="rIdQP1" Type="http://schemas.microsoft.com/office/2007/relationships/ui/extensibility" Target="customUI/customUI14.xml"/>'
        $txt = $txt.Replace('</Relationships>', $add + '</Relationships>')
        $re = $zip.CreateEntry('_rels/.rels')
        $sw = New-Object IO.StreamWriter($re.Open(), (New-Object Text.UTF8Encoding($false)))
        $sw.Write($txt); $sw.Close()
    } finally { $zip.Dispose() }

    Show-Msg "تم التثبيت بنجاح ✔`n`nافتح Word ثم افتح ملف الأسئلة، وستجد تبويباً جديداً اسمه (محلل الأسئلة).`nاضغط (تحليل الأسئلة) فيُحلَّل المستند ويظهر التقرير.`n`nإن ظهر شريط أصفر في Word عن الماكرو فاضغط (تمكين المحتوى)."
}
catch {
    Show-Msg ("حدث خطأ أثناء التثبيت:`n" + $_.Exception.Message + "`n`nإن ظهرت رسالة عن (الوصول البرمجي إلى مشروع VBA) فافتح Word ← ملف ← خيارات ← مركز التوثيق ← إعدادات مركز التوثيق ← إعدادات الماكرو، وفعّل (الوثوق بالوصول إلى نموذج كائن مشروع VBA) ثم أعد التثبيت.") 'Error'
    exit 1
}
finally {
    if ($word) { try { $word.Quit() } catch { } }
    if ($touchedVbom) {
        if ($null -eq $prevVbom) { Remove-ItemProperty -Path $SecKey -Name AccessVBOM -ErrorAction SilentlyContinue }
        else { Set-ItemProperty -Path $SecKey -Name AccessVBOM -Value $prevVbom -Type DWord }
    }
}
