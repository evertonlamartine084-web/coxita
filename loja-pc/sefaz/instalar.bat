@echo off
rem Instala/atualiza o robo da Receita no Ubuntu do WSL (onde a Evolution ja roda).
rem Antes: coloque nesta pasta o certificado.pfx e o chave.env preenchido. A pasta pode estar em
rem qualquer lugar (Area de Trabalho, C:\CoxelliSefaz...): ela e copiada para /opt/sefaz no WSL.
cd /d "%~dp0"
if not exist chave.env ( echo Falta o chave.env nesta pasta. & pause & exit /b 1 )
if not exist certificado.pfx ( echo Falta o certificado.pfx nesta pasta. & pause & exit /b 1 )
for /f "usebackq delims=" %%i in (`wsl wslpath -a "%~dp0"`) do set WSLDIR=%%i
echo Copiando de %WSLDIR% para /opt/sefaz e subindo o robo...
wsl -u root -- bash -c "mkdir -p /opt/sefaz && cp -r '%WSLDIR%'. /opt/sefaz/ && bash /opt/sefaz/subir.sh"
if errorlevel 1 (
  echo.
  echo *** DEU ERRO. Tire uma foto desta tela e mande para o Everton. ***
  pause
  exit /b 1
)
echo.
echo Pronto. O robo procura notas novas a cada 30 minutos.
pause
