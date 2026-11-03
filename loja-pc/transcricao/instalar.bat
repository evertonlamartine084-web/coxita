@echo off
rem Instala/atualiza o robo de transcricao dos audios no Ubuntu do WSL (onde a Evolution ja roda).
rem A pasta pode estar em qualquer lugar: ela e copiada para /opt/transcricao no WSL.
cd /d "%~dp0"
if not exist chave.env ( echo Falta o chave.env nesta pasta. & pause & exit /b 1 )
for /f "usebackq delims=" %%i in (`wsl wslpath -a "%~dp0"`) do set WSLDIR=%%i
echo Copiando de %WSLDIR% para /opt/transcricao e subindo o robo (a primeira vez demora uns 10 minutos)...
wsl -u root -- bash -c "mkdir -p /opt/transcricao && cp -r '%WSLDIR%'. /opt/transcricao/ && sed -i 's/\r$//' /opt/transcricao/subir.sh /opt/transcricao/chave.env && bash /opt/transcricao/subir.sh"
if errorlevel 1 (
  echo.
  echo *** DEU ERRO. Tire uma foto desta tela e mande para o Everton. ***
  pause
  exit /b 1
)
echo.
echo Pronto. Os audios novos do Zap passam a aparecer escritos no Atendimento.
pause
