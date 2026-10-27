-- Pagamento dividido (17/10/2026): o sinal entra de um jeito e o resto de outro (ex.: sinal no
-- Pix, resto no cartão na entrega). sinal_forma guarda como o sinal foi pago; payment_method
-- passa a ser a forma do restante. Sem sinal_forma (sinais antigos), o pedido inteiro conta na
-- forma de payment_method, como antes. A nota sai com duas parcelas (bling-emitir-nota).

alter table orders add column if not exists sinal_forma text;
alter table orders drop constraint if exists orders_sinal_forma_check;
alter table orders add constraint orders_sinal_forma_check
  check (sinal_forma is null or sinal_forma in ('dinheiro', 'pix', 'pix_online', 'credito', 'debito', 'cartao'));
