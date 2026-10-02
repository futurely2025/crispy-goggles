# محلل الأسئلة - تثبيت داخل Word (قالب ببدء التشغيل + زر في الشريط)
# كل خطوة تظهر في هذه النافذة. لا يستخدم سجل الإضافات (فلا يتعارض مع "معادلات عربية").
$ErrorActionPreference = 'Stop'
$Log = Join-Path $env:TEMP 'qparser-word-install.log'
try { Start-Transcript -Path $Log -Force | Out-Null } catch { }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root  = Split-Path -Parent $Here
$App     = Join-Path $env:LOCALAPPDATA 'QuestionParser'
$Startup = Join-Path $env:APPDATA 'Microsoft\Word\STARTUP'
$Dotm    = Join-Path $Startup 'QuestionParser.dotm'
$SecKey  = 'HKCU:\Software\Microsoft\Office\16.0\Word\Security'
$touchedVbom = $false; $prevVbom = $null

function Step([string]$n, [string]$t) { Write-Host ''; Write-Host "[$n] $t" -ForegroundColor Cyan }
function Ok([string]$t)   { Write-Host "    OK  $t" -ForegroundColor Green }
function Warn([string]$t) { Write-Host "    !!  $t" -ForegroundColor Yellow }
function V([string]$s) { return (($s.ToCharArray() | ForEach-Object { 'ChrW(' + [int]$_ + ')' }) -join ' & ') }   # نص عربي آمن داخل VBA

Write-Host '=== محلل الأسئلة - تثبيت داخل Word / Question Parser - Word install ===' -ForegroundColor White
Write-Host "سجل التثبيت / log: $Log"

try {
    # ---- 0) Word يجب أن يكون مغلقاً
    Step '1/6' 'التأكد من إغلاق Word / Checking Word is closed'
    while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
        Warn 'Word مفتوح (قد يكون يعمل في الخلفية). احفظ عملك ثم:'
        Write-Host '     - أغلق Word واضغط Enter   |   Close Word, then press Enter'
        Write-Host '     - أو اكتب K ثم Enter لإغلاقه تلقائياً (دون حفظ!)   |   or type K + Enter to force-close it'
        $a = Read-Host '     >'
        if ($a -match '^[kK]') { Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 2 }
    }
    Ok 'Word مغلق'

    # ---- 1) الملفات
    Step '2/6' 'نسخ صفحة المحلل / Copying the analyzer page'
    New-Item -ItemType Directory -Force -Path $App | Out-Null
    Copy-Item (Join-Path $Root 'QuestionParser.html') (Join-Path $App 'QuestionParser.html') -Force
    New-Item -ItemType Directory -Force -Path $Startup | Out-Null
    Ok $App

    # ---- 2) السماح المؤقت بإنشاء الماكرو
    Step '3/6' 'السماح المؤقت بإنشاء الماكرو / Temporarily allowing macro creation'
    New-Item -Path $SecKey -Force | Out-Null
    $prevVbom = (Get-ItemProperty -Path $SecKey -Name AccessVBOM -ErrorAction SilentlyContinue).AccessVBOM
    Set-ItemProperty -Path $SecKey -Name AccessVBOM -Value 1 -Type DWord
    $touchedVbom = $true
    Ok 'AccessVBOM=1 (يُعاد كما كان في النهاية)'

    # ---- 3) كود الماكرو
    $vba = [IO.File]::ReadAllText((Join-Path $Root 'word\QuestionParser.bas'), [Text.Encoding]::UTF8)
    $vba = $vba.Replace('{{MSG_OPEN}}',    (V 'افتح ملف الأسئلة في Word أولاً.'))
    $vba = $vba.Replace('{{MSG_MISSING}}', (V 'لم يتم العثور على ملفات المحلل. أعد تشغيل التثبيت.'))
    $vba = $vba.Replace('{{MSG_ERR}}',     (V 'تعذر التحليل:'))
    $vba = $vba.Replace('{{TITLE}}',       (V 'محلل الأسئلة'))
    $vba = ($vba -split "`r?`n") -join "`r`n"
    if (Test-Path $Dotm) { Remove-Item $Dotm -Force }

    # ---- 4) إنشاء القالب بواسطة Word (مع مهلة حتى لا يتجمد)
    Step '4/6' 'تشغيل Word مخفياً لإنشاء القالب (حتى 90 ثانية) / Starting Word hidden to build the template'
    $before = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $rs = [runspacefactory]::CreateRunspace(); $rs.ApartmentState = 'STA'; $rs.ThreadOptions = 'ReuseThread'; $rs.Open()
    $ps = [powershell]::Create(); $ps.Runspace = $rs
    [void]$ps.AddScript({
        param($vba, $Dotm)
        $w = $null
        try {
            $w = New-Object -ComObject Word.Application
            $w.Visible = $false
            $w.DisplayAlerts = 0
            $doc = $w.Documents.Add()
            $mod = $doc.VBProject.VBComponents.Add(1)
            $mod.Name = 'QuestionParser'
            $mod.CodeModule.AddFromString($vba)
            try { $doc.SaveAs2([ref]$Dotm, [ref]13) } catch { $doc.SaveAs2($Dotm, 13) }   # 13 = .dotm
            $doc.Close(0)
            return 'OK'
        } catch { return ('ERR: ' + $_.Exception.Message) }
        finally { if ($w) { try { $w.Quit() } catch { } } }
    }).AddArgument($vba).AddArgument($Dotm)
    $h = $ps.BeginInvoke()
    if (-not $h.AsyncWaitHandle.WaitOne(90000)) {
        $ps.Stop()
        Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | Stop-Process -Force
        throw 'انتهت المهلة: Word لم يستجب (غالباً ينتظر نافذة ترحيب أو تفعيل). افتح Word يدوياً مرة واحدة، أغلق أي نافذة تظهر، أغلقه، ثم أعد التثبيت.'
    }
    $res = $ps.EndInvoke($h) | Select-Object -Last 1
    $ps.Dispose(); $rs.Close()
    if ("$res" -ne 'OK') { throw ("Word رفض إنشاء القالب: $res") }
    if (-not (Test-Path $Dotm)) { throw 'لم يتم إنشاء ملف القالب.' }
    Ok $Dotm

    # ---- 5) زر الشريط
    Step '5/6' 'إضافة تبويب وزر الشريط / Adding the ribbon tab and button'
    $ui = [IO.File]::ReadAllText((Join-Path $Root 'word\customUI14.xml'), [Text.Encoding]::UTF8)
    $ui = $ui.Replace('{{TAB}}', 'محلل الأسئلة').Replace('{{GROUP}}', 'الأسئلة').Replace('{{BUTTON}}', 'تحليل الأسئلة').Replace('{{TIP}}', 'يحلل أسئلة الصح والخطأ والاختيار من متعدد والوصل في المستند المفتوح ويفتح التقرير.')
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
    Ok 'تم'

    Step '6/6' 'اكتمل / Done'
    Write-Host ''
    Write-Host '  ✔ تم التثبيت بنجاح' -ForegroundColor Green
    Write-Host '  افتح Word ثم ملف الأسئلة ← تبويب (محلل الأسئلة) ← زر (تحليل الأسئلة).'
    Write-Host '  إن ظهر شريط أصفر عن الماكرو فاضغط (تمكين المحتوى).'
}
catch {
    Write-Host ''
    Write-Host '  ✘ فشل التثبيت / Install failed:' -ForegroundColor Red
    Write-Host ('  ' + $_.Exception.Message) -ForegroundColor Red
    if ($_.Exception.Message -match 'VBA|Visual Basic|programmatic|برمجي') {
        Write-Host '  الحل: Word ← ملف ← خيارات ← مركز التوثيق ← إعدادات مركز التوثيق ← إعدادات الماكرو، ثم فعّل' -ForegroundColor Yellow
        Write-Host '  (الوثوق بالوصول إلى نموذج كائن مشروع VBA) وأعد التثبيت.' -ForegroundColor Yellow
    }
    Write-Host "  أرسل لمن يساعدك الملف: $Log"
}
finally {
    if ($touchedVbom) {
        if ($null -eq $prevVbom) { Remove-ItemProperty -Path $SecKey -Name AccessVBOM -ErrorAction SilentlyContinue }
        else { Set-ItemProperty -Path $SecKey -Name AccessVBOM -Value $prevVbom -Type DWord }
    }
    try { Stop-Transcript | Out-Null } catch { }
}
