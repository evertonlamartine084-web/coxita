#!/usr/bin/env bash
# Sobe o projeto para um dos dois ambientes.
#
#   ./scripts/deploy.sh homolog    -> homolog.coxelli.com.br
#   ./scripts/deploy.sh producao   -> coxelli.com.br
#
# Existe porque o projeto na Vercel ainda nao esta conectado ao repositorio:
# push nao gera deploy nenhum, e `vercel --prod` solto sobe para producao o que
# estiver na pasta -- foi assim que deploys de producao sairam da branch
# `fotos-e-cardapio`. Este script amarra ambiente a branch na mao.
#
# Depois de conectar o GitHub no painel da Vercel, ele vira redundante: `main`
# e `homolog` passam a subir sozinhas no push. Ver AMBIENTES.md.
set -euo pipefail

ALVO="${1:-}"
FORCAR="${2:-}"
DOMINIO_HOMOLOG="homolog.coxelli.com.br"

branch_atual() { git rev-parse --abbrev-ref HEAD; }

exigir_branch() {
  local esperada="$1" atual
  atual=$(branch_atual)
  [ "$atual" = "$esperada" ] && return 0
  [ "$FORCAR" = "--forcar" ] && {
    printf '\033[33mAviso: subindo %s a partir da branch %s\033[0m\n' "$ALVO" "$atual" >&2
    return 0
  }
  printf '\033[31mVoce esta na branch %s, e %s sobe a partir de %s.\033[0m\n' "$atual" "$ALVO" "$esperada" >&2
  echo "Troque de branch, ou repita com --forcar se for mesmo o que quer." >&2
  exit 1
}

case "$ALVO" in
  producao|prod)
    exigir_branch main
    npx vercel deploy --prod --yes
    ;;
  homolog)
    exigir_branch homolog
    # A URL nao e mais a ultima linha: versoes novas do CLI terminam a saida com um bloco JSON
    # (e a ultima linha virou "}"). Pega a primeira URL de deploy que aparecer.
    saida=$(npx vercel deploy --yes 2>&1) || { echo "$saida" >&2; exit 1; }
    url=$(printf '%s\n' "$saida" | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | head -n 1)
    if [ -z "$url" ]; then
      echo "$saida" >&2
      echo "Nao achei a URL do deploy na saida acima; o alias nao foi feito." >&2
      exit 1
    fi
    echo "Deploy: $url"
    npx vercel alias set "$url" "$DOMINIO_HOMOLOG" || {
      echo "O deploy subiu e responde em $url, mas o alias para $DOMINIO_HOMOLOG falhou." >&2
      echo "Ver a secao DNS do AMBIENTES.md." >&2
      exit 1
    }
    ;;
  *)
    echo "uso: $0 {homolog|producao} [--forcar]" >&2
    exit 1
    ;;
esac
