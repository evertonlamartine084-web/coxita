# Ambientes

Dois ambientes, um projeto só na Vercel (`coxelli`), separados por branch:

| Ambiente | Branch | Endereço | Deploy |
|---|---|---|---|
| Produção | `main` | https://coxelli.com.br | automático no push |
| Homolog | `homolog` | https://homolog.coxelli.com.br | automático no push |

Qualquer outra branch continua ganhando uma URL de preview própria, descartável.

## Fluxo

```
feature  →  homolog  →  main
```

1. Trabalhe numa branch de feature, a partir de `main`.
2. Merge em `homolog` e valide em https://homolog.coxelli.com.br.
3. Aprovado, merge em `main` — sobe para produção.

Nunca faça merge de `homolog` em `main` sem antes olhar o que mais está em
`homolog`: a branch acumula tudo o que foi para validação, inclusive o que
ainda não foi aprovado. Merge a branch de feature em `main`, não a `homolog`.

## O banco é o mesmo nos dois

Homolog aponta para o **mesmo Supabase da produção**. Isso foi escolhido para
manter o ambiente simples de subir, e o preço é real:

- pedido feito em homolog é pedido de verdade — entra na fila da cozinha,
  baixa estoque e dispara push no celular de quem trabalha;
- migration testada em homolog já alterou a produção;
- pagamento passa pela mesma Cielo (sandbox) e o mesmo Bling da produção.

Homolog serve para validar **tela e fluxo**, não para brincar com dado. Para
testar algo destrutivo, o caminho é criar um projeto Supabase separado e
apontar `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` do ambiente Preview para
ele — as variáveis já estão separadas por ambiente na Vercel, então é só
trocar o valor no Preview.

Para lembrar disso sem precisar ler o endereço na barra, todo ambiente que não
é produção — homolog, preview de branch e o `npm run dev` da sua máquina —
mostra um selo âmbar no canto inferior esquerdo da tela
(`src/components/ui/SeloAmbiente.jsx`). Ele se decide pelo hostname, então
ambiente novo já nasce com selo; produção é a única exceção, e o domínio dela
vem de `SITE` em `src/content/paginas.js`.

## Por que homolog não aparece no Google

`vercel.json` devolve `X-Robots-Tag: noindex, nofollow` para
`homolog.coxelli.com.br` e para qualquer `*.vercel.app`. Sem isso, as 59
páginas pré-renderizadas existiriam em dois endereços e o Google escolheria
qual mostrar — podendo escolher o errado.

Os `<link rel="canonical">` do build continuam apontando para
`https://coxelli.com.br` em qualquer ambiente, de propósito: é mais um sinal
de que o original é a produção.

## Variáveis de ambiente

As três variáveis (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_VAPID_PUBLIC_KEY`) estão na Vercel marcadas para Production, Preview e
Development com o mesmo valor — é isso que faz homolog falar com o banco de
produção. Elas já são independentes por ambiente: para dar um banco próprio ao
homolog, basta trocar o valor no escopo Preview
(`vercel env add VITE_SUPABASE_URL preview`), sem tocar em produção.
