"""تثبيت محلل الأسئلة في Word بدون استضافة (Windows).
يعمل بدون صلاحيات مدير:  1) ينسخ الملفات  2) ينشئ شهادة localhost ويثقها
3) يسجّل الإضافة في Word  4) يشغّل الخادم المحلي الآن وعند كل تشغيل للجهاز."""
import datetime
import ipaddress
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qparser_local_server as srv  # noqa: E402

ADDIN_ID = '8954e29a-fba6-45e7-8097-ab26f5196080'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # مجلد question-addin
APP = os.path.join(os.environ.get('LOCALAPPDATA', os.path.join(ROOT, '_app')), 'QuestionParserWord')
BASE_URL = f'https://localhost:{srv.PORT}/'


def ensure_cryptography():
    try:
        import cryptography  # noqa: F401
    except ImportError:
        print('تثبيت مكتبة cryptography (مرة واحدة)…')
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--user', '--quiet', 'cryptography'])


def make_cert(cert_path, key_path):
    ensure_cryptography()
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'localhost'),
                      x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'Question Parser (local)')])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=3650))
            .add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost'),
                                                        x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]), False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), True)
            .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=True, content_commitment=False,
                                         data_encipherment=False, key_agreement=False, key_cert_sign=False,
                                         crl_sign=False, encipher_only=False, decipher_only=False), True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), False)
            .sign(key, hashes.SHA256()))
    with open(key_path, 'wb') as f:
        f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                                  serialization.NoEncryption()))
    with open(cert_path, 'wb') as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    return cert.fingerprint(hashes.SHA1()).hex()


def word_running():
    out = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq WINWORD.EXE'], capture_output=True, text=True).stdout
    return 'WINWORD.EXE' in out


def pythonw():
    p = os.path.join(os.path.dirname(sys.executable), 'pythonw.exe')
    return p if os.path.exists(p) else sys.executable


def install():
    import winreg
    print('== محلل الأسئلة: تثبيت محلي ==\n')
    while word_running():
        input('Word مفتوح الآن. احفظ عملك وأغلقه ثم اضغط Enter للمتابعة… ')
    os.makedirs(APP, exist_ok=True)

    # 1) الملفات
    shutil.copytree(os.path.join(ROOT, 'web'), os.path.join(APP, 'web'), dirs_exist_ok=True)
    for f in ('qparser_local_server.py',):
        shutil.copy(os.path.join(ROOT, 'local', f), os.path.join(APP, 'server.py' if f.endswith('server.py') else f))

    # 2) الشهادة (مرة واحدة) + الوثوق بها
    cert, key = os.path.join(APP, 'cert.pem'), os.path.join(APP, 'key.pem')
    if not (os.path.exists(cert) and os.path.exists(key)):
        thumb = make_cert(cert, key)
        with open(os.path.join(APP, 'cert.sha1'), 'w') as f:
            f.write(thumb)
    print('\nسيظهر الآن تحذير أمان من Windows لشهادة «localhost» — اضغط (نعم / Yes).')
    print('هذه شهادة لجهازك فقط ليقبل Word العنوان https://localhost\n')
    subprocess.run(['certutil', '-user', '-addstore', '-f', 'Root', cert], check=True)

    # 3) تسجيل الإضافة في Word
    with open(os.path.join(ROOT, 'installer', 'manifest.template.xml'), encoding='utf-8') as f:
        xml = f.read().replace('{{BASE_URL}}', BASE_URL).replace('{{ORIGIN}}', BASE_URL.rstrip('/'))
    manifest = os.path.join(APP, 'manifest.xml')
    with open(manifest, 'w', encoding='utf-8', newline='') as f:
        f.write(xml)
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Office\16.0\WEF\Developer') as k:
        winreg.SetValueEx(k, ADDIN_ID, 0, winreg.REG_SZ, manifest)
    wef = os.path.join(os.environ['LOCALAPPDATA'], r'Microsoft\Office\16.0\Wef')
    if os.path.isdir(wef):
        shutil.rmtree(wef, ignore_errors=True)

    # 4) التشغيل التلقائي + التشغيل الآن
    cmd = f'"{pythonw()}" "{os.path.join(APP, "server.py")}"'
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Run') as k:
        winreg.SetValueEx(k, 'QuestionParserLocal', 0, winreg.REG_SZ, cmd)
    subprocess.Popen(cmd, creationflags=0x00000008 | 0x08000000, close_fds=True)      # DETACHED | NO_WINDOW
    # بعض نسخ Word القديمة تمنع الاتصال بـ localhost حتى يُستثنى (يفشل بصمت إن لم تكن مطلوبة)
    subprocess.run(['CheckNetIsolation', 'LoopbackExempt', '-a', '-n=microsoft.win32webviewhost_cw5n1h2txyewy'],
                   capture_output=True)

    print('\n✔ تم التثبيت.\nافتح Word ← تبويب «محلل الأسئلة» ← «تحليل الأسئلة».')
    print('الخادم يعمل في الخلفية على جهازك فقط ويبدأ تلقائياً مع Windows.')


def uninstall():
    import winreg
    print('== إزالة محلل الأسئلة ==')
    try:
        pid = int(open(os.path.join(APP, 'server.pid')).read())
        subprocess.run(['taskkill', '/F', '/PID', str(pid)], capture_output=True)
    except (OSError, ValueError):
        pass
    for path, name in ((r'Software\Microsoft\Office\16.0\WEF\Developer', ADDIN_ID),
                       (r'Software\Microsoft\Windows\CurrentVersion\Run', 'QuestionParserLocal')):
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_SET_VALUE) as k:
                winreg.DeleteValue(k, name)
        except OSError:
            pass
    try:
        thumb = open(os.path.join(APP, 'cert.sha1')).read().strip()
        subprocess.run(['certutil', '-user', '-delstore', 'Root', thumb], capture_output=True)
    except OSError:
        pass
    shutil.rmtree(APP, ignore_errors=True)
    print('تمت الإزالة.')


if __name__ == '__main__':
    if sys.platform != 'win32':
        sys.exit('هذا المثبّت لنظام Windows فقط.')
    try:
        uninstall() if '--uninstall' in sys.argv else install()
    except Exception as e:                         # noqa: BLE001
        print('\nحدث خطأ:', e)
    input('\nاضغط Enter للإغلاق…')
