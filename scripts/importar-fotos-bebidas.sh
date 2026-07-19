#!/usr/bin/env bash
#
# Importa fotos de bebidas para o cardapio.
#
#   ./scripts/importar-fotos-bebidas.sh ~/Desktop/fotos-bebidas
#
# Espera arquivos com estes nomes (jpg, png ou webp):
#
#   coca.jpg           -> Coca-Cola Lata 350ml
#   coca-zero.jpg      -> Coca-Cola Zero Lata 350ml
#   guarana.jpg        -> Guarana Antarctica Lata 350ml
#   guarana-zero.jpg   -> Guarana Antarctica Zero 350ml
#   fanta-laranja.jpg  -> Fanta Laranja Lata 350ml
#   fanta-uva.jpg      -> Fanta Uva Lata 350ml
#   sprite.jpg         -> Sprite Lata 350ml
#   coca-2l.jpg        -> Coca-Cola 2 Litros
#   guarana-2l.jpg     -> Guarana Antarctica 2 Litros
#   agua.jpg           -> Agua Mineral 500ml
#
# Faltando algum, ele e apenas pulado. Cada foto e recortada em quadrado,
# reduzida para 600x600, convertida em WebP, enviada ao bucket e ligada ao
# produto. Use fotos suas ou imagens que voce tenha direito de publicar.
#
# Requer: SUPABASE_SERVICE_ROLE_KEY e DATABASE_URL no ambiente.

set -euo pipefail

PASTA="${1:-}"
if [ -z "$PASTA" ] || [ ! -d "$PASTA" ]; then
  echo "uso: $0 <pasta-com-as-fotos>" >&2
  exit 1
fi

: "${SUPABASE_SERVICE_ROLE_KEY:?defina SUPABASE_SERVICE_ROLE_KEY}"
: "${DATABASE_URL:?defina DATABASE_URL}"

PROJETO="fbyyikrryepuvuwrjbbs"
BUCKET="https://$PROJETO.supabase.co/storage/v1/object"
PUBLICO="https://$PROJETO.supabase.co/storage/v1/object/public/products/bebidas"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# slug -> nome exato do produto no banco
declare -a MAPA=(
  "coca|Coca-Cola Lata 350ml"
  "coca-zero|Coca-Cola Zero Lata 350ml"
  "guarana|Guarana Antarctica Lata 350ml"
  "guarana-zero|Guarana Antarctica Zero 350ml"
  "fanta-laranja|Fanta Laranja Lata 350ml"
  "fanta-uva|Fanta Uva Lata 350ml"
  "sprite|Sprite Lata 350ml"
  "coca-2l|Coca-Cola 2 Litros"
  "guarana-2l|Guarana Antarctica 2 Litros"
  "agua|Agua Mineral 500ml"
)

for par in "${MAPA[@]}"; do
  slug="${par%%|*}"; produto="${par#*|}"

  origem=""
  for ext in jpg jpeg png webp JPG PNG; do
    [ -f "$PASTA/$slug.$ext" ] && { origem="$PASTA/$slug.$ext"; break; }
  done
  [ -z "$origem" ] && { printf "%-16s (sem arquivo, pulado)\n" "$slug"; continue; }

  saida="$TMP/$slug.webp"
  python3 - "$origem" "$saida" <<'PY'
import sys
from PIL import Image
origem, saida = sys.argv[1], sys.argv[2]
im = Image.open(origem).convert('RGB')
lado = min(im.size)
l = (im.width - lado) // 2
t = (im.height - lado) // 2
im.crop((l, t, l + lado, t + lado)).resize((600, 600), Image.LANCZOS) \
  .save(saida, 'WEBP', quality=82, method=6)
PY

  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BUCKET/products/bebidas/$slug.webp" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: image/webp" -H "x-upsert: true" \
    --data-binary "@$saida")

  if [ "$code" != "200" ]; then
    printf "%-16s upload falhou (HTTP %s)\n" "$slug" "$code" >&2
    continue
  fi

  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
    -c "update products set image_url = '$PUBLICO/$slug.webp' where name = '$produto';"

  printf "%-16s OK  -> %s\n" "$slug" "$produto"
done

echo
echo "Pronto. As imagens ja aparecem no site (o cache do cardapio expira em 1 minuto)."
