-- Preparação para emitir nota fiscal pelo Bling.
--
-- A nota sai quando o pedido é marcado como "saiu para entrega": é o momento em que a mercadoria
-- passa a circular e precisa de documento fiscal junto. Emitir antes (na confirmação do
-- pagamento) deixaria de fora quem paga em dinheiro ou cartão NA ENTREGA — nesses casos o
-- pagamento só confirma na porta do cliente, com a moto já na rua.

-- ─── CPF do cliente, opcional ───────────────────────────────────────────────
-- Guarda só dígitos. Quem não informar sai como consumidor não identificado.
alter table orders add column if not exists customer_cpf text;

-- ─── rastreio da nota ───────────────────────────────────────────────────────
-- Sem isso não há como saber se a nota de um pedido já saiu, e a primeira falha de rede vira
-- nota duplicada ou pedido sem nota nenhuma.
alter table orders add column if not exists bling_pedido_id text;
alter table orders add column if not exists bling_nfe_id text;
alter table orders add column if not exists bling_nfe_numero text;
alter table orders add column if not exists bling_nfe_status text
  check (bling_nfe_status is null or bling_nfe_status in ('pendente','emitida','erro','cancelada'));
alter table orders add column if not exists bling_nfe_erro text;
alter table orders add column if not exists bling_nfe_em timestamptz;

create index if not exists idx_orders_bling_nfe_status on orders (bling_nfe_status);

-- ─── ligação do produto com o Bling ─────────────────────────────────────────
-- NCM, CFOP, origem e tributação ficam no cadastro do BLING, não aqui: é lá que o contador
-- mexe. O site guarda só a referência, e manda "vendi 2 do produto X".
alter table products add column if not exists bling_codigo text;

comment on column products.bling_codigo is
  'Código do produto no Bling. Sem ele o item não entra na nota.';

-- ─── quais pedidos estão prontos para virar nota ────────────────────────────
-- Despachados, ainda sem nota. É o que o painel mostra e o que um cron futuro consumiria.
create or replace function pedidos_sem_nota()
returns setof jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(o)
  from orders o
  where o.status in ('saiu_entrega', 'entregue')
    and coalesce(o.bling_nfe_status, '') not in ('emitida', 'cancelada')
  order by o.created_at desc
  limit 100;
$$;

revoke all on function pedidos_sem_nota() from public, anon;
grant execute on function pedidos_sem_nota() to authenticated;
