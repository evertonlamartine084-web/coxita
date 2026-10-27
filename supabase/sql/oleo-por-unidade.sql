-- Óleo por unidade frita, medido e não chutado (27/10/2026).
--
-- Óleo comprado nos últimos 60 dias ÷ unidades fritas vendidas no mesmo período (salgados, doces
-- e pastéis; congelado não passa pela fritadeira). 60 dias e não o mês: o óleo de uma compra é
-- usado no mês seguinte, e mês a mês o número pulava de 3,0 ml para 1,3 ml.
--
-- Roda todo dia 1 (pg_cron) e grava o resultado na ficha de óleo dos pacotes fritos. Com pouco
-- dado (menos de 5 L ou de 2.000 unidades na janela) não mexe: fica o último valor.
--
-- O óleo comprado vem da tela de Compras (cupom e nota): o item ligado ao insumo "Óleo de soja" ou
-- com "óleo" no nome, litros lidos do nome ("900ml"). Óleo comprado sem cupom não entra.
--
-- Ponto de partida: 1,7 ml, de setembro e outubro (28,8 L da planilha de insumos para 17.070
-- unidades fritas no painel).

create or replace function atualizar_oleo_por_unidade() returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_oleo uuid;
  v_litros numeric;
  v_unidades numeric;
  v_por_unidade numeric;
begin
  select id into v_oleo from supplies where name = 'Óleo de soja';
  if v_oleo is null then
    return null;
  end if;

  select sum(i.quantidade * case
                 when lower(x.m[2]) in ('l', 'lt') then replace(x.m[1], ',', '.')::numeric
                 else replace(x.m[1], ',', '.')::numeric / 1000
               end)
    into v_litros
    from compras_itens i
    join compras c on c.id = i.compra_id
    cross join lateral (select regexp_match(i.nome, '(\d+(?:[.,]\d+)?)\s*(ml|lt|l)\M', 'i') as m) x
   where (i.supply_id = v_oleo or i.nome ~* '(^|\s)[oó]leo')
     and x.m is not null
     and coalesce(c.emitida_em, c.created_at) >= now() - interval '60 days';

  select sum(oif.quantity)
    into v_unidades
    from order_item_flavors oif
    join order_items oi on oi.id = oif.order_item_id
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id
    join categories cat on cat.id = p.category_id
   where o.status <> 'cancelado'
     and o.created_at >= now() - interval '60 days'
     and p.flavor_group in ('salgados', 'doces', 'pasteis')
     and cat.name <> 'Congelados';

  if coalesce(v_litros, 0) < 5 or coalesce(v_unidades, 0) < 2000 then
    update supplies
       set note = format('%s ml por unidade frita. Recálculo de %s sem dado bastante (%s L comprados no cupom, %s unidades fritas em 60 dias): ficou o valor anterior.',
                         replace(round(coalesce((select max(quantity) from product_recipe_items where supply_id = v_oleo), 0) * 1000, 2)::text, '.', ','),
                         to_char(now() at time zone 'America/Fortaleza', 'DD/MM'),
                         replace(round(coalesce(v_litros, 0), 1)::text, '.', ','), coalesce(v_unidades, 0))
     where id = v_oleo;
    return null;
  end if;

  v_por_unidade := round(v_litros / v_unidades, 6);

  update product_recipe_items r
     set quantity = v_por_unidade
    from products p
    join categories cat on cat.id = p.category_id
   where r.product_id = p.id
     and r.supply_id = v_oleo
     and cat.name <> 'Congelados';

  update supplies
     set note = format('%s ml por unidade frita: %s L comprados para %s unidades fritas nos 60 dias até %s.',
                       replace(round(v_por_unidade * 1000, 2)::text, '.', ','),
                       replace(round(v_litros, 1)::text, '.', ','), v_unidades,
                       to_char(now() at time zone 'America/Fortaleza', 'DD/MM'))
   where id = v_oleo;

  return v_por_unidade;
end $$;

-- Ponto de partida, até a primeira conta automática.
update product_recipe_items r
   set quantity = 0.0017
  from products p
  join categories cat on cat.id = p.category_id, supplies s
 where r.product_id = p.id
   and r.supply_id = s.id and s.name = 'Óleo de soja'
   and cat.name <> 'Congelados';

update supplies
   set note = '1,7 ml por unidade frita: 28,8 L comprados (planilha de insumos) para 17.070 unidades fritas em setembro e outubro. Recalcula sozinho todo dia 1.'
 where name = 'Óleo de soja';

select cron.unschedule(jobid) from cron.job where jobname = 'oleo-por-unidade';
select cron.schedule('oleo-por-unidade', '0 9 1 * *', 'select atualizar_oleo_por_unidade()');
