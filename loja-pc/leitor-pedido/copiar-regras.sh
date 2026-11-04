#!/usr/bin/env bash
# Copia as regras do painel para o robô (rodar no Mac antes de levar a pasta para o PC).
cd "$(dirname "$0")" && cp ../../src/utils/lerPedidoDoZap.js lerPedidoDoZap.js && echo "regras copiadas"
