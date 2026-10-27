-- Sinal dos agendados (09/10/2026).
--
-- Encomenda agendada paga 50% antes e o resto na entrega. O sinal fica registrado no pedido:
-- quanto entrou e quando. O "A receber" do painel mostra o que falta (total - sinal), e marcar
-- como Entregue fecha o pagamento (payment_status = 'pago').

alter table orders add column if not exists sinal_valor numeric(10,2) not null default 0;
alter table orders add column if not exists sinal_em timestamptz;
alter table orders drop constraint if exists orders_sinal_valor_check;
alter table orders add constraint orders_sinal_valor_check check (sinal_valor >= 0);
