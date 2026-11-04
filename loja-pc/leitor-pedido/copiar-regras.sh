#!/usr/bin/env bash
# Copia as regras do painel para o robô (rodar no Mac depois de mudar src/utils/lerPedidoDoZap.js)
# e gera a cópia que a função zap-ler-pedido entrega ao robô do PC, que se atualiza sozinho.
# Depois: publicar a função (npx -y supabase@2 functions deploy zap-ler-pedido --use-api --no-verify-jwt ...).
set -e
cd "$(dirname "$0")"
cp ../../src/utils/lerPedidoDoZap.js lerPedidoDoZap.js
node -e '
const fs = require("fs"), crypto = require("crypto")
const codigo = fs.readFileSync("lerPedidoDoZap.js", "utf8")
const versao = crypto.createHash("sha1").update(codigo).digest("hex").slice(0, 10)
fs.writeFileSync("../../supabase/functions/zap-ler-pedido/regras.ts",
  "// GERADO por loja-pc/leitor-pedido/copiar-regras.sh a partir de src/utils/lerPedidoDoZap.js. Não editar.\n" +
  "export const VERSAO_REGRAS = " + JSON.stringify(versao) + "\n" +
  "export const REGRAS = " + JSON.stringify(codigo) + "\n")
console.log("regras copiadas, versão", versao)
'
