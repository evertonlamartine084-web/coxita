@echo off
rem Instala/atualiza o robo da Receita no Ubuntu do WSL (onde a Evolution ja roda).
rem Antes: coloque nesta pasta o certificado.pfx e o chave.env preenchido.
cd /d "%~dp0"
if not exist chave.env ( echo Falta o chave.env nesta pasta. & pause & exit /b 1 )
if not exist certificado.pfx ( echo Falta o certificado.pfx nesta pasta. & pause & exit /b 1 )
wsl -u root -- bash -c "mkdir -p /opt/sefaz && cp -r /mnt/c/CoxelliSefaz/. /opt/sefaz/ && bash /opt/sefaz/subir.sh"
if errorlevel 1 (
  echo.
  echo *** DEU ERRO. Tire uma foto desta tela e mande para o Everton. ***
  pause
  exit /b 1
)
echo.
echo Pronto. O robo procura notas novas a cada 30 minutos.
pause
