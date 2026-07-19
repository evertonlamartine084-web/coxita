#!/usr/bin/env bash
# Verifica se coxelli.com.br ja aponta para a Vercel.
#
#   ./scripts/checar-dns.sh
#
# Consulta os nameservers da GoDaddy diretamente (resposta imediata) e tambem
# o DNS publico (que sofre atraso de propagacao). Enquanto os dois nao baterem,
# parte dos visitantes ainda vera o destino antigo.

set -u

DOMINIO="coxelli.com.br"
NS_GODADDY="ns35.domaincontrol.com"
A_VERCEL="216.198.79.1"
CNAME_VERCEL="255038d2ece072dd.vercel-dns-017.com"

verde()   { printf "\033[32m%s\033[0m\n" "$1"; }
vermelho(){ printf "\033[31m%s\033[0m\n" "$1"; }

echo "== Na GoDaddy (autoritativo, resposta imediata) =="
apex=$(dig +short A "$DOMINIO" "@$NS_GODADDY" 2>/dev/null | tr '\n' ' ')
www=$(dig +short CNAME "www.$DOMINIO" "@$NS_GODADDY" 2>/dev/null)
printf "  A     @   -> %s" "${apex:-(vazio)}"
if echo "$apex" | grep -q "$A_VERCEL"; then verde "  OK"; else vermelho "  ainda nao e a Vercel"; fi
printf "  CNAME www -> %s" "${www:-(vazio)}"
if echo "$www" | grep -q "vercel-dns"; then verde "  OK"; else vermelho "  ainda nao e a Vercel"; fi

echo
echo "== No DNS publico (o que os visitantes enxergam) =="
papex=$(dig +short A "$DOMINIO" 2>/dev/null | tr '\n' ' ')
pwww=$(dig +short CNAME "www.$DOMINIO" 2>/dev/null)
printf "  A     @   -> %s\n" "${papex:-(ainda propagando)}"
printf "  CNAME www -> %s\n" "${pwww:-(ainda propagando)}"

echo
echo "== O site responde? =="
for u in "https://$DOMINIO" "https://www.$DOMINIO"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "$u" 2>/dev/null || echo "---")
  printf "  %-28s HTTP %s\n" "$u" "$code"
done

echo
echo "Esperado:  A @ = $A_VERCEL   |   CNAME www = $CNAME_VERCEL"
