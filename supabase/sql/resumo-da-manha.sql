-- Resumo da manhã no grupo da loja (pedido do dono em 03/11/2026): às 7h o painel do PC da loja
-- pede o resumo (pegar_resumo_da_manha) e manda no grupo do Zap. O texto é montado em
-- src/utils/resumoDaManha.js; aqui ficam os números e a trava de uma vez por dia.
-- Sem gasto de anúncio (o dono pediu para não pôr).

create table if not exists resumo_manha (
  dia date primary key,
  enviado_em timestamptz not null default now()
);
alter table resumo_manha enable row level security;
drop policy if exists resumo_manha_painel on resumo_manha;
create policy resumo_manha_painel on resumo_manha for all using (auth.role() = 'authenticated');

-- Os números do dia (dia de Natal). Estoque baixo: o mínimo do sabor na tela Estoque, ou 200
-- unidades (2 centos) quando ele não tem mínimo.
create or replace function resumo_da_manha(p_dia date default (now() at time zone 'America/Fortaleza')::date)
returns jsonb
language sql stable security definer set search_path = public as $$
  with dia_de as (
    select o.*, (coalesce(o.scheduled_for, o.created_at) at time zone 'America/Fortaleza') quando
    from orders o where o.status <> 'cancelado'
  ),
  hoje as (
    select d.* from dia_de d where d.quando::date = p_dia and d.status <> 'entregue'
  ),
  ontem as (
    select o.* from orders o
    where o.status = 'entregue' and o.reposicao_de is null
      and (coalesce(o.entregue_em, o.scheduled_for, o.created_at) at time zone 'America/Fortaleza')::date = p_dia - 1
  ),
  ofertas as (
    select distinct on (p.supply_id) s.name insumo, s.unit, p.mercado, p.produto, p.preco, p.tamanho, p.preco_unidade,
      s.pack_price / nullif(s.pack_quantity, 0) pago
    from mercado_precos p join supplies s on s.id = p.supply_id
    where p.visto_em = p_dia and s.pack_quantity > 0
      and p.preco_unidade <= 0.9 * s.pack_price / s.pack_quantity
    order by p.supply_id, p.preco_unidade
  )
  select jsonb_build_object(
    'dia', p_dia,
    'pedidos', (select coalesce(jsonb_agg(jsonb_build_object(
        'numero', h.order_number, 'nome', h.customer_name, 'hora', case when h.scheduled_for is not null then to_char(h.quando, 'HH24:MI') end,
        'entrega', h.delivery_type = 'entrega', 'bairro', h.neighborhood, 'total', h.total,
        'pago', h.payment_status = 'pago', 'sinal', coalesce(h.sinal_valor, 0), 'forma', h.payment_method,
        'itens', (select string_agg(i.quantity || 'x ' || i.product_name, ', ') from order_items i where i.order_id = h.id)
      ) order by h.quando), '[]'::jsonb) from hoje h),
    -- a receber: agendados de hoje a 7 dias sem pagamento confirmado
    'a_receber', (select coalesce(jsonb_agg(jsonb_build_object(
        'numero', d.order_number, 'nome', d.customer_name, 'dia', to_char(d.quando, 'DD/MM'),
        'total', d.total, 'sinal', coalesce(d.sinal_valor, 0), 'forma', d.payment_method
      ) order by d.quando), '[]'::jsonb)
      from dia_de d
      where d.quando::date between p_dia and p_dia + 7 and d.status <> 'entregue'
        and coalesce(d.payment_status, '') <> 'pago' and d.reposicao_de is null),
    'estoque_baixo', (select coalesce(jsonb_agg(jsonb_build_object('sabor', f.name, 'quantidade', s.quantidade) order by s.quantidade), '[]'::jsonb)
      from flavor_stock s join flavors f on f.id = s.flavor_id
      where f.active and s.quantidade < case when s.minimo > 0 then s.minimo else 200 end),
    'ontem', jsonb_build_object(
      'pedidos', (select count(*) from ontem),
      'valor', (select coalesce(sum(total), 0) from ontem),
      'sabores', (select coalesce(jsonb_agg(x order by x.quantidade desc), '[]'::jsonb) from (
        select f.flavor_name sabor, sum(f.quantity)::int quantidade
        from ontem o join order_items i on i.order_id = o.id join order_item_flavors f on f.order_item_id = i.id
        group by f.flavor_name order by 2 desc limit 6) x)
    ),
    'ofertas', (select coalesce(jsonb_agg(to_jsonb(o) order by (o.pago - o.preco_unidade) / o.pago desc), '[]'::jsonb) from (
      select * from ofertas order by (pago - preco_unidade) / pago desc limit 6) o)
  )
$$;
revoke all on function resumo_da_manha(date) from public, anon;
grant execute on function resumo_da_manha(date) to authenticated;

-- O painel pega o resumo do dia uma vez só: a primeira aba que chamar recebe, as outras null.
create or replace function pegar_resumo_da_manha()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_dia date := (now() at time zone 'America/Fortaleza')::date;
begin
  if auth.role() <> 'authenticated' then raise exception 'só o painel'; end if;
  insert into resumo_manha (dia) values (v_dia) on conflict do nothing;
  if not found then return null; end if;
  return resumo_da_manha(v_dia);
end $$;
revoke all on function pegar_resumo_da_manha() from public, anon;
grant execute on function pegar_resumo_da_manha() to authenticated;
