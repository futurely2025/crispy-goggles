@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (py -3 local\qparser_local_setup.py --uninstall & goto :eof)
python local\qparser_local_setup.py --uninstall
