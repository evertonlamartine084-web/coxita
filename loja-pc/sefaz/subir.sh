#!/usr/bin/env bash
# Roda dentro do Ubuntu do WSL, como root (igual à Evolution em /opt/evolution).
set -e
cd "$(dirname "$0")"
[ -f chave.env ] || { echo "Falta o chave.env (copie de chave.env.exemplo)"; exit 1; }
[ -f certificado.pfx ] || { echo "Falta o certificado.pfx nesta pasta"; exit 1; }
service docker start >/dev/null 2>&1 || true
docker compose up -d --build
echo "Robô no ar. Para ver o que ele está fazendo: docker compose logs -f --tail 50"
