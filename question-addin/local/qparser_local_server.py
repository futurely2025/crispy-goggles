"""خادم محلي صغير (HTTPS على جهازك فقط) يقدّم ملفات محلل الأسئلة لـ Word.
يُشغَّل تلقائياً عند دخول Windows بواسطة pythonw (بدون نافذة)."""
import functools
import http.server
import os
import ssl
import sys

PORT = 44381
HERE = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8',
                      '.xml': 'application/xml', '.png': 'image/png', '': 'application/octet-stream'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *a):          # pythonw لا يملك stderr
        pass


def make_server(web_dir, cert, key, port=PORT):
    handler = functools.partial(Handler, directory=web_dir)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)   # محلي فقط
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(cert, key)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    return httpd


if __name__ == '__main__':
    try:
        srv = make_server(os.path.join(HERE, 'web'), os.path.join(HERE, 'cert.pem'), os.path.join(HERE, 'key.pem'))
    except OSError:                      # المنفذ مستخدم = الخادم يعمل أصلاً
        sys.exit(0)
    with open(os.path.join(HERE, 'server.pid'), 'w') as f:
        f.write(str(os.getpid()))
    srv.serve_forever()
