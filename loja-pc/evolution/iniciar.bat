@echo off
rem Sobe a Evolution (precisa do Docker Desktop aberto). Depois da primeira vez, ela volta
rem sozinha junto com o Docker quando o Windows liga.
cd /d "%~dp0"
docker compose up -d
echo.
echo Pronto. Abra o painel em Pedidos e clique em "Grupo do Zap".
pause
