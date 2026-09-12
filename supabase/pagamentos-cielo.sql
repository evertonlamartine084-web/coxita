-- Pagamento pela Cielo: estado do pagamento no pedido + trilha de cada transação.
--
-- Hoje `orders.status` só descreve a ENTREGA (pendente → em_preparo → saiu_entrega → entregue).
-- Não havia como dizer se o pedido foi pago: um Pix aguardando e um Pix confirmado ficavam
-- idênticos no banco. São duas dimensões independentes — dá pra estar pago e não entregue, ou
-- entregue e não pago (dinheiro na porta) — então viram duas colunas, não uma só.

alter table orders add column if not exists payment_status text
  not null default 'nao_iniciado'
  check (payment_status in ('nao_iniciado','aguardando','pago','recusado','estornado','expirado'));

alter table orders add column if not exists cielo_payment_id uuid;
alter table orders add column if not exists paid_at timestamptz;

create index if not exists idx_orders_payment_status on orders (payment_status);
create index if not exists idx_orders_cielo_payment_id on orders (cielo_payment_id);

-- 'cartao' substitui o par 'credito'/'debito' quando o pagamento é online pela Cielo; os
-- valores antigos continuam válidos porque ainda existem pedidos gravados com eles.
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('dinheiro','pix','credito','debito','cartao','pix_online'));

-- Trilha de auditoria: uma linha por resposta da Cielo (criação, webhook, consulta).
--
-- Sem isto, uma cobrança contestada vira a palavra do cliente contra a nossa. NUNCA guarda
-- número de cartão, CVV ou nome do portador: só os quatro últimos dígitos, que é o que se pode
-- reter, e o que a Cielo devolveu.
create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  cielo_payment_id uuid,
  tipo text not null,                    -- 'criacao' | 'webhook' | 'consulta'
  metodo text,                           -- 'CreditCard' | 'DebitCard' | 'Pix'
  cielo_status int,                      -- código numérico da Cielo (2 = pago, 12 = pix gerado…)
  status_texto text,
  return_code text,
  return_message text,
  amount_centavos int,
  card_last4 text,                       -- só os 4 últimos; jamais o PAN completo
  card_brand text,
  payload jsonb,                         -- resposta da Cielo, já sem dados de cartão
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_events_order on payment_events (order_id, created_at desc);
create index if not exists idx_payment_events_cielo on payment_events (cielo_payment_id);

alter table payment_events enable row level security;

-- Sem policy pública: quem escreve aqui é a Edge Function, com service_role, que ignora RLS.
-- O cliente nunca lê nem escreve trilha de pagamento de ninguém.
create policy "payment_events_admin_read" on payment_events
  for select using (auth.role() = 'authenticated');
