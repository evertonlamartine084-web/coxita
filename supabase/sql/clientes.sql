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
  -- agrupa pelos dígitos: "(84) 99640-6908" (painel) e "84996406908" (site) são a mesma pessoa
  select
    -- o telefone como foi gravado por último: "+41 …" de fora não pode virar número do Brasil
    (array_agg(o.customer_phone order by o.created_at desc))[1] as telefone,
    -- o nome mais recente: se a pessoa corrigiu a grafia, vale a última versão
    (array_agg(o.customer_name order by o.created_at desc))[1] as nome,
    count(*) as pedidos,
    coalesce(sum(o.total), 0) as total_gasto,
    coalesce(sum(o.total) / nullif(count(*), 0), 0) as ticket_medio,
    min(o.created_at) as primeiro_pedido,
    max(o.created_at) as ultimo_pedido,
    (array_agg(o.address order by o.created_at desc) filter (where o.address is not null))[1] as endereco,
    (array_agg(o.neighborhood order by o.created_at desc) filter (where o.neighborhood is not null))[1] as bairro
  from orders o
  where regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') <> ''
    -- reposição (pedido refeito sem cobrança) é a mesma compra, não um pedido a mais
    and o.reposicao_de is null
    -- cancelado não é compra: não conta pedido, valor, data nem "recorrente" (15/10/2026)
    and o.status <> 'cancelado'
  group by right(regexp_replace(o.customer_phone, '\D', '', 'g'), 11)

  union all

  -- Freguês sem número (30/10/2026, o "Gordinho" que pede no balcão e pelo Zap sem telefone):
  -- entra pelo nome, a partir do 2º pedido. Nome genérico não é pessoa.
  select
    null,
    (array_agg(o.customer_name order by o.created_at desc))[1],
    count(*),
    coalesce(sum(o.total), 0),
    coalesce(sum(o.total) / nullif(count(*), 0), 0),
    min(o.created_at),
    max(o.created_at),
    (array_agg(o.address order by o.created_at desc) filter (where o.address is not null))[1],
    (array_agg(o.neighborhood order by o.created_at desc) filter (where o.neighborhood is not null))[1]
  from orders o
  where regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') = ''
    and o.reposicao_de is null
    and o.status <> 'cancelado'
    and lower(trim(o.customer_name)) not in ('ifood', 'compras anteriores', 'cliente balcão', 'cliente balcao', 'consumidor final', 'cliente')
  group by lower(trim(o.customer_name))
  having count(*) >= 2

  order by 7 desc;
$$;

revoke all on function clientes_resumo() from public, anon;
grant execute on function clientes_resumo() to authenticated;
