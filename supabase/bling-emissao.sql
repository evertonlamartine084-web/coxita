-- Emissão da NFC-e pelo Bling (função bling-emitir-nota). Complementa bling-preparacao.sql.

-- ─── o que a nota autorizada devolve ────────────────────────────────────────
-- A chave identifica a nota na Sefaz; o link do DANFE é o que se imprime ou manda ao cliente.
alter table orders add column if not exists bling_nfe_chave text;
alter table orders add column if not exists bling_nfe_danfe text;

-- ─── emissão automática, desligada até a parte fiscal estar pronta ─────────
-- Ligada, o painel pede a nota sozinho quando o pedido sai para entrega. Enquanto o contador
-- não tiver configurado NCM, tributação e natureza de operação no Bling, toda tentativa
-- falharia — então nasce desligada, e o botão "Emitir nota" no pedido funciona de qualquer jeito.
insert into settings (key, value) values ('bling_nfe_automatica', 'nao')
on conflict (key) do nothing;
