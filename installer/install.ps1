# Arabic Math add-in for Word (Windows) - installer
# Registers the add-in manifest for the current user (no admin rights needed).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

$AddinId = 'e9182039-0176-4a6e-a259-145b24db2436'
$Title   = 'معادلات عربية - تثبيت'
$Here    = Split-Path -Parent $MyInvocation.MyCommand.Path

function Show-Msg([string]$text, [string]$icon = 'Information') {
    $opts = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading
    [void][System.Windows.Forms.MessageBox]::Show($text, $Title, 'OK', $icon, 'Button1', $opts)
}
function Ask-YesNo([string]$text) {
    $opts = [System.Windows.Forms.MessageBoxOptions]::RightAlign -bor [System.Windows.Forms.MessageBoxOptions]::RtlReading
    return [System.Windows.Forms.MessageBox]::Show($text, $Title, 'YesNo', 'Question', 'Button1', $opts) -eq 'Yes'
}

try {
    # 1) hosting URL -----------------------------------------------------------
    $cfgFile = Join-Path $Here 'addin-url.txt'
    $url = ''
    if (Test-Path $cfgFile) {
        $url = (Get-Content $cfgFile -Encoding UTF8 | Where-Object { $_ -match '^\s*https://' } | Select-Object -First 1)
        if ($url) { $url = $url.Trim() }
    }
    if (-not $url) {
        $url = [Microsoft.VisualBasic.Interaction]::InputBox(
            "أدخل رابط الاستضافة (HTTPS) الذي رفعت عليه مجلد web`nمثال: https://math.example.com/",
            $Title, 'https://')
        if (-not $url) { exit 1 }
        $url = $url.Trim()
    }
    if ($url -notmatch '^https://[^/\s]+') {
        Show-Msg "الرابط يجب أن يبدأ بـ https://`n$url" 'Error'; exit 1
    }
    if (-not $url.EndsWith('/')) { $url += '/' }
    $origin = ([Uri]$url).GetLeftPart([UriPartial]::Authority)

    # 2) check that the add-in files are reachable ---------------------------------
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $null = Invoke-WebRequest -Uri ($url + 'taskpane.html') -UseBasicParsing -TimeoutSec 20
    } catch {
        if (-not (Ask-YesNo "تعذر فتح الرابط:`n${url}taskpane.html`n`nتأكد أن مجلد web مرفوع على الخادم.`nهل تريد المتابعة بالتثبيت رغم ذلك؟")) { exit 1 }
    }

    # 3) Word must be closed -------------------------------------------------------
    while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
        if (-not (Ask-YesNo "برنامج Word مفتوح الآن.`nاحفظ عملك وأغلق Word ثم اضغط (نعم) للمتابعة.")) { exit 1 }
    }

    # 4) write the manifest ----------------------------------------------------------
    $dest = Join-Path $env:LOCALAPPDATA 'ArabicMathWord'
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    $tpl = [IO.File]::ReadAllText((Join-Path $Here 'manifest.template.xml'), [Text.Encoding]::UTF8)
    $xml = $tpl.Replace('{{BASE_URL}}', $url).Replace('{{ORIGIN}}', $origin)
    $manifest = Join-Path $dest 'manifest.xml'
    [IO.File]::WriteAllText($manifest, $xml, (New-Object Text.UTF8Encoding($false)))
    Set-Content -Path (Join-Path $dest 'addin-url.txt') -Value $url -Encoding UTF8

    # 5) register for the current user (Word 2016 / 2019 / 2021 / 365 all use 16.0) --
    $key = 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name $AddinId -Value $manifest -PropertyType String -Force | Out-Null

    # 6) clear the Office add-in cache so the new version is picked up -----------------
    $wef = Join-Path $env:LOCALAPPDATA 'Microsoft\Office\16.0\Wef'
    if (Test-Path $wef) { Get-ChildItem $wef -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }

    Show-Msg "تم التثبيت بنجاح ✔`n`nافتح Word وستجد تبويبًا جديدًا باسم (معادلات عربية)`nاضغط (محرر المعادلات) لبدء الكتابة.`n`nرابط الإضافة: $url"
    exit 0
}
catch {
    Show-Msg ("حدث خطأ أثناء التثبيت:`n" + $_.Exception.Message) 'Error'
    exit 1
}
