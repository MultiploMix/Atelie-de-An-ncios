@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Atelie de Anuncios.lnk'); $s.TargetPath='%~dp0Atelie_de_Anuncios_Windows_V5_4.exe'; $s.WorkingDirectory='%~dp0'; $s.Save()"
if errorlevel 1 pause
