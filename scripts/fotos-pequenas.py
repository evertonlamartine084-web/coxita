"""Versoes menores das fotos de public/fotos/ (400 e 600 px) para o srcset dos cards.

A foto original tem 900 px e o card do celular mostra uns 200 px: baixar 900 px ali era
o maior peso do cardapio no celular (Lighthouse, 13/10/2026: nota 78, LCP 4,8 s).
Gera so o que falta e reescreve src/content/fotosPequenas.js com a lista das fotos que
tem as tres medidas -- o site so poe srcset nessas, entao foto nova sem versao pequena
continua funcionando com a original.

Rodar depois de por foto nova em public/fotos/:  python3 scripts/fotos-pequenas.py
"""
from pathlib import Path
from PIL import Image

PASTA = Path(__file__).resolve().parent.parent / 'public' / 'fotos'
LISTA = Path(__file__).resolve().parent.parent / 'src' / 'content' / 'fotosPequenas.js'
MEDIDAS = (400, 600)

prontas = []
for foto in sorted(PASTA.glob('*.webp')):
    if foto.stem.endswith(tuple(f'-{m}' for m in MEDIDAS)):
        continue
    im = Image.open(foto)
    if im.width < 700:  # ja pequena: nao vale a pena
        continue
    for m in MEDIDAS:
        destino = foto.with_name(f'{foto.stem}-{m}.webp')
        if not destino.exists() or destino.stat().st_mtime < foto.stat().st_mtime:
            copia = im.copy()
            copia.thumbnail((m, m), Image.LANCZOS)
            copia.save(destino, 'WEBP', quality=78, method=6)
    prontas.append(foto.stem)

LISTA.write_text(
    '// Gerado por scripts/fotos-pequenas.py. Fotos de public/fotos/ com versao -400 e -600.\n'
    f'export const FOTOS_PEQUENAS = new Set({prontas!r})\n'.replace("'", "'")
)
print(len(prontas), 'fotos com versões pequenas')
