@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -Command "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'),'Atelie de Anuncios.lnk')); $s.TargetPath = [System.IO.Path]::Combine('%~dp0','Atelie_de_Anuncios_Windows_V5.exe'); $s.WorkingDirectory = '%~dp0'; $s.IconLocation = [System.IO.Path]::Combine('%~dp0','Atelie.ico'); $s.Description = 'Gestor de Anuncios - Windows'; $s.Save()"
if errorlevel 1 (
 echo Nao foi possivel criar o atalho automaticamente.
) else (
 echo Atalho Atelie de Anuncios criado na area de trabalho.
)
pause
