-- Robô leitor de pedido no PC da loja (loja-pc/leitor-pedido), 04/11/2026.
-- Ele lê as conversas do Zap com regras (sem IA paga) e grava aqui o pedido que achou; o
-- Atendimento mostra a faixa "Pedido na conversa" a partir disto.
alter table zap_conversas
  add column if not exists pedido_lido jsonb,          -- saída de lerPedidoDoZap (itens, data, hora, faltando...)
  add column if not exists pedido_lido_ate timestamptz; -- criada_em da última mensagem lida

-- conversas com mensagem nova desde a última leitura (o robô pergunta por estas)
create index if not exists zap_conversas_leitura_idx on zap_conversas (ultima_em desc);
