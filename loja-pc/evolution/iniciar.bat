@echo off
rem Sobe a Evolution (precisa do Docker Desktop aberto, em "Engine running"). Depois da primeira
rem vez, ela volta sozinha junto com o Docker quando o Windows liga.
cd /d "%~dp0"

rem Logo depois de instalar, o Windows ainda nao acha o "docker" pelo nome: usa o caminho direto
set DOCKER=docker
where docker >nul 2>nul || set DOCKER="C:\Program Files\Docker\Docker\resources\bin\docker.exe"

%DOCKER% compose up -d
if errorlevel 1 (
  echo.
  echo *** DEU ERRO. Tire uma foto desta tela e mande para o Everton. ***
  echo Confira se o Docker Desktop esta aberto e mostrando "Engine running".
  pause
  exit /b 1
)
echo.
echo Pronto. Espere 1 minuto, abra o painel em Pedidos e clique em "Grupo do Zap".
pause
