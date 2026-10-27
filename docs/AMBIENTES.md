# Ambientes

Dois ambientes, um projeto só na Vercel (`coxelli`), separados por branch:

| Ambiente | Branch | Endereço |
|---|---|---|
| Produção | `main` | https://coxelli.com.br |
| Homolog | `homolog` | https://homolog.coxelli.com.br |

## Fluxo

```
feature  →  homolog  →  main
```

1. Trabalhe numa branch de feature, criada a partir de `main`.
2. Merge em `homolog` e valide em https://homolog.coxelli.com.br.
3. Aprovado, merge da **branch de feature** em `main` — nunca de `homolog`:
   `homolog` acumula tudo o que já foi para validação, inclusive o que ainda
   não foi aprovado, e merge dela leva junto o que não devia subir.

## Como sobe

Hoje, na mão — o projeto na Vercel não está conectado ao repositório, então
push não gera deploy:

```sh
git checkout homolog && npm run deploy:homolog
git checkout main    && npm run deploy:producao
```

`scripts/deploy.sh` recusa subir a partir da branch errada. Foi por falta
dessa trava que deploys de produção saíram de `fotos-e-cardapio`.

**Para virar automático**, falta conectar o GitHub (uma vez, no navegador):

1. https://vercel.com/account/login-connections → conectar o GitHub à conta.
2. No projeto `coxelli` → Settings → Git → Connect Git Repository →
   `evertonlamartine084-web/coxita`.
3. Confirmar em Settings → Git que a Production Branch é `main`.

Feito isso, push em `main` publica produção, push em `homolog` publica
homolog (o domínio já está amarrado a essa branch na Vercel), e qualquer
outra branch ganha uma URL de preview descartável. `scripts/deploy.sh` vira
redundante.

## Modo "Voltamos já"

Com o modo ligado, `coxelli.com.br` e as 59 páginas respondem 503 com
`public/em-breve.html` (aviso + botão de WhatsApp). Homolog e as previews
continuam com o site inteiro.

**Liga e desliga pelo botão do painel**, no topo do menu lateral ("🟢 Site no
ar" / "🔴 Site em manutenção"). Não precisa de deploy: o botão grava
`site_em_manutencao` (`sim`/`nao`) na tabela `settings`, e o `middleware.js` lê
esse valor, guardando-o por 15 s. Se o banco não responder, o site fica no ar.

Continuam respondendo normal, mesmo com o modo ligado: `/admin`, assets e
fotos, `robots.txt`, `sitemap.xml` e o arquivo de verificação do Search
Console.

**Emergência sem painel:** a variável `EM_BREVE` na Vercel liga o modo em
qualquer caso (esta, sim, exige redeploy):

```sh
npx vercel env add EM_BREVE production --value 1 --yes   # liga
npx vercel env rm EM_BREVE production --yes              # desliga
git checkout main && npm run deploy:producao
```

Para conferir: `curl -s -o /dev/null -w '%{http_code}\n' https://coxelli.com.br/`
— 503 é modo ligado, 200 é site no ar.

Por que 503 e não uma página comum com status 200: 503 quer dizer
"indisponível agora, volta". O Google segura as páginas no índice esperando; um
200 faria ele trocar o conteúdo indexado das 59 páginas pelo aviso, e a posição
teria de ser reconquistada quando o site voltasse. Vale por semanas, não por
meses.

## O banco é o mesmo nos dois

Homolog aponta para o **mesmo Supabase da produção**. Foi escolhido assim para
manter o ambiente simples, e o preço é real:

- pedido feito em homolog é pedido de verdade — entra na fila da cozinha,
  baixa estoque e dispara push no celular de quem trabalha;
- migration testada em homolog já alterou a produção;
- pagamento passa pela mesma Cielo **de produção** e o mesmo Bling da
  produção: cartão ou Pix pago em homolog é cobrança real (ver "Cielo").

Homolog serve para validar **tela e fluxo**, não para brincar com dado.

Para lembrar disso sem precisar ler o endereço na barra, todo ambiente que não
é produção — homolog, preview de branch e o `npm run dev` da sua máquina —
mostra um selo âmbar no canto inferior esquerdo
(`src/components/ui/SeloAmbiente.jsx`). Ele se decide pelo hostname, então
ambiente novo já nasce com selo; produção é a única exceção, e o domínio dela
vem de `SITE` em `src/content/paginas.js`.

## Cielo

Em **produção** desde 22/09/2026. As credenciais ficam nos secrets do
Supabase, não na Vercel — quem fala com a Cielo são as Edge Functions
`cielo-pagar`, `cielo-webhook`, `cielo-consultar` e `cielo-estornar`:

| Secret | Valor |
|---|---|
| `CIELO_MERCHANT_ID` | MerchantId da conta de produção |
| `CIELO_MERCHANT_KEY` | MerchantKey da conta de produção |
| `CIELO_AMBIENTE` | `producao` — qualquer outro valor (ou ausente) cai no sandbox |

As funções leem os secrets a cada chamada: trocar com
`supabase secrets set ...` vale na hora, sem redeploy. Conferir só os nomes com
`supabase secrets list`.

O Post de Notificação está cadastrado na Cielo apontando para
`https://ruehnwnihmysycrpddgy.supabase.co/functions/v1/cielo-webhook`. Sem ele,
Pix pago não vira `pago` sozinho. Um GET nessa URL responde
`cielo-webhook ativo` — é o jeito rápido de ver se a função está no ar.

Para testar, faça um pedido pequeno com cartão real e estorne pelo admin.

## Nota fiscal (Bling)

A NFC-e sai pela Edge Function `bling-emitir-nota`: cria o pedido de venda no
Bling, gera a NFC-e a partir dele e envia à Sefaz. A parte fiscal (NCM,
tributação, natureza de operação) fica toda no cadastro do Bling, com o
contador; o site só manda itens pelo preço cheio, frete, desconto (cupom + à
vista) e forma de pagamento.

- **Quando sai:** pelo botão "Emitir nota" no pedido, no painel. Com
  `bling_nfe_automatica = sim` em Configurações, sai sozinha quando o pedido
  passa para "saiu para entrega". Nasce `nao`.
- **Produto sem `bling_codigo`** no cadastro do site não entra na nota: a
  emissão para e diz qual é.
- **Falhou?** O motivo fica no pedido (`bling_nfe_erro`) e o botão vira
  "Tentar de novo", que retoma de onde parou — não cria segundo pedido de venda
  nem segunda nota.
- **Forma de pagamento** é escolhida pelo tipo no Bling (dinheiro, crédito,
  débito, Pix). Precisa haver uma ativa de cada tipo usado.
- Homolog emite no **mesmo Bling da produção**: nota emitida em homolog é nota
  de verdade.

Secrets no Supabase: `BLING_CLIENT_ID` e `BLING_CLIENT_SECRET`. O token de
acesso fica na tabela `integracao_bling` e se renova sozinho.

## Por que homolog não aparece no Google

`vercel.json` devolve `X-Robots-Tag: noindex, nofollow` para
`homolog.coxelli.com.br` e para qualquer `*.vercel.app`. Sem isso, as 59
páginas pré-renderizadas existiriam em dois endereços e o Google escolheria
qual mostrar — podendo escolher o errado.

Os `<link rel="canonical">` do build continuam apontando para
`https://coxelli.com.br` em qualquer ambiente, de propósito: é mais um sinal
de que o original é a produção.

## Variáveis de ambiente

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_VAPID_PUBLIC_KEY` estão
na Vercel marcadas para Production, Preview e Development com o mesmo valor —
é isso que faz homolog falar com o banco de produção.

Elas já são independentes por ambiente. Para dar um banco próprio ao homolog
mais tarde, crie o projeto Supabase e troque o valor só no escopo Preview
(`vercel env add VITE_SUPABASE_URL preview`), sem tocar em produção.

## DNS

`homolog.coxelli.com.br` precisa de dois registros na GoDaddy:

| Tipo | Nome | Valor |
|---|---|---|
| CNAME | `homolog` | `10cd1cd4a4cc2d1f.vercel-dns-017.com.` |
| TXT | `_vercel` | `vc-domain-verify=homolog.coxelli.com.br,30b5fd26821ebaba972f` |

O TXT é adicional: `_vercel` já tem dois registros (apex e www) e os três
convivem. Conferir com `./scripts/checar-dns.sh` e
`npx vercel domains inspect homolog.coxelli.com.br`.
