# Coxelli Salgados

Site de encomendas (coxelli.com.br), painel da loja (`/admin`) e hub de números (`/hub`).
React + Vite na Vercel; banco, login e funções no Supabase.

## Pastas

| Pasta | O que tem |
|---|---|
| `src/` | o site, o painel e o hub |
| `public/` | fotos e arquivos servidos como estão |
| `supabase/functions/` | funções do Supabase (Cielo, Bling, Zap, compras, NF-e…) |
| `supabase/sql/` | SQL aplicado à mão no banco, um arquivo por mudança |
| `loja-pc/` | o que roda no PC da loja: Evolution (WhatsApp) e robô da SEFAZ |
| `scripts/` | deploy, pré-renderização, sitemap e utilidades |
| `docs/` | ambientes e deploy (`AMBIENTES.md`), créditos das imagens |
| `materiais/` | artes de referência, fora do git e do deploy |

## Comandos

```sh
npm run dev                    # site local (usa o banco de produção: não enviar checkout em teste)
./scripts/deploy.sh producao   # publica em coxelli.com.br
```
