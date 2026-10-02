// خادم محلي صغير (HTTPS على جهازك فقط) لمحلل الأسئلة — لا يحتاج أي برنامج إضافي.
// يُترجم بمترجم .NET الموجود أصلاً في Windows ويعمل في الخلفية بدون نافذة.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;

namespace QParser
{
    public static class Server
    {
        const int Port = 44381;
        static string webRoot;
        static X509Certificate2 cert;
        static readonly Dictionary<string, string> Mime = new Dictionary<string, string>
        {
            { ".html", "text/html; charset=utf-8" }, { ".js", "application/javascript; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" }, { ".png", "image/png" }, { ".xml", "application/xml" },
            { ".json", "application/json" }, { ".md", "text/plain; charset=utf-8" }, { ".txt", "text/plain; charset=utf-8" }
        };

        static int logged = 0;
        static string logPath;
        static void Log(string msg)
        {
            try
            {
                if (logged++ > 200) return;
                File.AppendAllText(logPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + msg + "\r\n");
            }
            catch (Exception) { }
        }

        public static int Main(string[] args)
        {
            logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server.log");
            try { return Run(args); }
            catch (Exception ex) { Log("FATAL: " + ex); return 1; }
        }

        static int Run(string[] args)
        {
            string here = AppDomain.CurrentDomain.BaseDirectory;
            webRoot = Path.GetFullPath(Path.Combine(here, "web"));
            int port = Port;
            if (args.Length > 0) int.TryParse(args[0], out port);
            string pfx = args.Length > 1 ? args[1] : Path.Combine(here, "cert.pfx");
            if (args.Length > 2) webRoot = Path.GetFullPath(args[2]);
            bool createdNew;
            // نسخة واحدة فقط من الخادم
            using (new Mutex(true, "QParserLocalServer_" + port, out createdNew))
            {
                if (!createdNew) return 0;
                Log("starting on port " + port + ", web=" + webRoot);
                cert = new X509Certificate2(pfx, "qparser");
                TcpListener listener = new TcpListener(IPAddress.Loopback, port);     // محلي فقط
                try { listener.Start(); } catch (SocketException ex) { Log("cannot listen: " + ex.Message); return 0; }
                Log("listening");
                while (true)
                {
                    TcpClient client;
                    try { client = listener.AcceptTcpClient(); } catch (Exception) { continue; }
                    ThreadPool.QueueUserWorkItem(Handle, client);
                }
            }
        }

        static void Handle(object state)
        {
            TcpClient client = (TcpClient)state;
            try
            {
                client.ReceiveTimeout = 15000; client.SendTimeout = 15000;
                using (client)
                using (SslStream ssl = new SslStream(client.GetStream(), false))
                {
                    ssl.AuthenticateAsServer(cert, false, SslProtocols.Tls12, false);
                    string req = ReadHeader(ssl);
                    if (req == null) return;
                    string[] first = req.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0].Split(' ');
                    if (first.Length < 2) return;
                    string method = first[0];
                    if (method != "GET" && method != "HEAD") { Send(ssl, 405, "text/plain", Encoding.UTF8.GetBytes("405"), false); return; }
                    string path = first[1];
                    int q = path.IndexOf('?'); if (q >= 0) path = path.Substring(0, q);
                    path = Uri.UnescapeDataString(path).Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
                    if (path.Length == 0) path = "qparser.html";
                    string full = Path.GetFullPath(Path.Combine(webRoot, path));
                    if (!full.StartsWith(webRoot, StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
                    { Send(ssl, 404, "text/plain", Encoding.UTF8.GetBytes("404"), method == "HEAD"); return; }
                    string mime;
                    if (!Mime.TryGetValue(Path.GetExtension(full).ToLowerInvariant(), out mime)) mime = "application/octet-stream";
                    Send(ssl, 200, mime, File.ReadAllBytes(full), method == "HEAD");
                }
            }
            catch (Exception ex) { Log("connection error: " + ex.GetType().Name + ": " + ex.Message); }
        }

        static string ReadHeader(Stream s)
        {
            StringBuilder sb = new StringBuilder();
            byte[] buf = new byte[1];
            while (sb.Length < 16384)
            {
                if (s.Read(buf, 0, 1) <= 0) return sb.Length == 0 ? null : sb.ToString();
                sb.Append((char)buf[0]);
                if (sb.Length >= 4 && sb[sb.Length - 1] == '\n' && sb[sb.Length - 2] == '\r' && sb[sb.Length - 3] == '\n' && sb[sb.Length - 4] == '\r')
                    return sb.ToString();
            }
            return null;
        }

        static void Send(Stream s, int code, string mime, byte[] body, bool headOnly)
        {
            string status = code == 200 ? "OK" : (code == 404 ? "Not Found" : "Method Not Allowed");
            string head = "HTTP/1.1 " + code + " " + status + "\r\nContent-Type: " + mime + "\r\nContent-Length: " + body.Length +
                          "\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n";
            byte[] h = Encoding.ASCII.GetBytes(head);
            s.Write(h, 0, h.Length);
            if (!headOnly) s.Write(body, 0, body.Length);
            s.Flush();
        }
    }
}
