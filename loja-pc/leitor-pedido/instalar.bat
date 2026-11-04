@echo off
rem Instala/atualiza o robo leitor de pedido do Zap no Ubuntu do WSL (onde a Evolution ja roda).
rem A pasta pode estar em qualquer lugar: ela e copiada para /opt/leitor-pedido no WSL.
cd /d "%~dp0"
if not exist chave.env ( echo Falta o chave.env nesta pasta. & pause & exit /b 1 )
for /f "usebackq delims=" %%i in (`wsl wslpath -a "%~dp0"`) do set WSLDIR=%%i
echo Copiando de %WSLDIR% para /opt/leitor-pedido e subindo o robo...
wsl -u root -- bash -c "mkdir -p /opt/leitor-pedido && cp -r '%WSLDIR%'. /opt/leitor-pedido/ && sed -i 's/\r$//' /opt/leitor-pedido/subir.sh /opt/leitor-pedido/chave.env && bash /opt/leitor-pedido/subir.sh"
if errorlevel 1 (
  echo.
  echo *** DEU ERRO. Tire uma foto desta tela e mande para o Everton. ***
  pause
  exit /b 1
)
echo.
echo Pronto. O Atendimento passa a mostrar o pedido que o robo achou na conversa.
pause
