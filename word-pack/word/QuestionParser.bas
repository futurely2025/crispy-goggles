Option Explicit


Private Function ReadUtf8(ByVal p As String) As String
    Dim s As Object
    Set s = CreateObject("ADODB.Stream")
    s.Type = 2
    s.Charset = "utf-8"
    s.Open
    s.LoadFromFile p
    ReadUtf8 = s.ReadText
    s.Close
End Function

Private Sub WriteUtf8(ByVal p As String, ByVal t As String)
    Dim s As Object
    Set s = CreateObject("ADODB.Stream")
    s.Type = 2
    s.Charset = "utf-8"
    s.Open
    s.WriteText t
    s.SaveToFile p, 2
    s.Close
End Sub

Private Function Attr(ByVal t As String) As String
    t = Replace(t, "&", "&amp;")
    t = Replace(t, """", "&quot;")
    t = Replace(t, "<", "&lt;")
    t = Replace(t, ">", "&gt;")
    Attr = t
End Function

Public Sub QuestionParser_Run()
    Dim tplPath As String, tpl As String, xml As String, html As String, outPath As String
    On Error GoTo EH
    If Documents.Count = 0 Then
        MsgBox {{MSG_OPEN}}, vbExclamation, {{TITLE}}
        Exit Sub
    End If
    tplPath = Environ("LOCALAPPDATA") & "\QuestionParser\QuestionParser.html"
    If Dir(tplPath) = "" Then
        MsgBox {{MSG_MISSING}}, vbExclamation, {{TITLE}}
        Exit Sub
    End If
    tpl = ReadUtf8(tplPath)
    xml = ActiveDocument.Content.WordOpenXML
    html = Replace(tpl, "<!--QP_DATA-->", "<meta id=""qp-name"" content=""" & Attr(ActiveDocument.Name) & """><script type=""text/plain"" id=""qp-xml"">" & xml & "</script>")
    outPath = Environ("TEMP") & "\QuestionParser_result.html"
    WriteUtf8 outPath, html
    CreateObject("WScript.Shell").Run """" & outPath & """", 1, False
    Exit Sub
EH:
    MsgBox {{MSG_ERR}} & " " & Err.Description, vbCritical, {{TITLE}}
End Sub

' Ribbon button
Public Sub QuestionParser_Click(control As IRibbonControl)
    QuestionParser_Run
End Sub
