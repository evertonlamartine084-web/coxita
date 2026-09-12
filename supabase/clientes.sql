-- Lista de clientes para o backoffice.
--
-- NÃO cria tabela nova: nome, telefone e endereço já são gravados em cada pedido. Uma tabela
-- `customers` paralela precisaria ser mantida em sincronia a cada pedido e sairia do ar na
-- primeira falha de escrita — teríamos duas versões do mesmo cliente e nenhuma confiável.
-- Aqui a fonte é sempre `orders`, agregada na hora.
--
-- A chave é o TELEFONE, não o nome: é o único campo que identifica a pessoa de forma estável
-- (o mesmo cliente escreve "Ana", "ana maria", "Ana M." em pedidos diferentes).
--
-- SECURITY DEFINER + grant só para authenticated: a contagem sai do painel, e a função nunca
-- é exposta a visitante anônimo.
create or replace function clientes_resumo()
returns table (
  telefone text,
  nome text,
  pedidos bigint,
  total_gasto numeric,
  ticket_medio numeric,
  primeiro_pedido timestamptz,
  ultimo_pedido timestamptz,
  endereco text,
  bairro text
)
language sql
security definer
set search_path = public
as $$
  select
    o.customer_phone as telefone,
    -- o nome mais recente: se a pessoa corrigiu a grafia, vale a última versão
    (array_agg(o.customer_name order by o.created_at desc))[1] as nome,
    count(*) as pedidos,
    -- pedido cancelado não conta como dinheiro entrado
    coalesce(sum(o.total) filter (where o.status <> 'cancelado'), 0) as total_gasto,
    coalesce(
      sum(o.total) filter (where o.status <> 'cancelado')
      / nullif(count(*) filter (where o.status <> 'cancelado'), 0),
      0
    ) as ticket_medio,
    min(o.created_at) as primeiro_pedido,
    max(o.created_at) as ultimo_pedido,
    (array_agg(o.address order by o.created_at desc) filter (where o.address is not null))[1] as endereco,
    (array_agg(o.neighborhood order by o.created_at desc) filter (where o.neighborhood is not null))[1] as bairro
  from orders o
  where o.customer_phone is not null and o.customer_phone <> ''
  group by o.customer_phone
  order by max(o.created_at) desc;
$$;

revoke all on function clientes_resumo() from public, anon;
grant execute on function clientes_resumo() to authenticated;
