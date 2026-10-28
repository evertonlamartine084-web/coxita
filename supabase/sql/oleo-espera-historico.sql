-- A conta do óleo só roda com 60 dias de compras lançadas pela tela de Compras (28/10/2026).
--
-- As compras começaram a entrar pelo painel em 17/10; antes disso o óleo só está na planilha de
-- insumos, digitado à mão. Em 01/11 a janela de 60 dias teria 18 L de óleo (a caixa do Mar
-- Vermelho de 28/10, nem aberta) contra 17 mil unidades fritas desde setembro: daria 1,1 ml, menos
-- da metade do real. Até a primeira compra lançada ter 60 dias, fica o valor medido (1,7 ml).

create or replace function atualizar_oleo_por_unidade() returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_oleo uuid;
  v_primeira date;
  v_litros numeric;
  v_unidades numeric;
  v_por_unidade numeric;
begin
  select id into v_oleo from supplies where name = 'Óleo de soja';
  if v_oleo is null then
    return null;
  end if;

  select min(coalesce(emitida_em, created_at))::date into v_primeira from compras;
  if v_primeira is null or v_primeira > (now() - interval '60 days')::date then
    update supplies
       set note = format('%s ml por unidade frita. A conta automática começa quando houver 60 dias de compras lançadas na tela de Compras (desde %s).',
                         replace(round(coalesce((select max(quantity) from product_recipe_items where supply_id = v_oleo), 0) * 1000, 2)::text, '.', ','),
                         to_char(v_primeira, 'DD/MM'))
     where id = v_oleo;
    return null;
  end if;

  select sum(i.quantidade * multiplo_da_unidade(i.unidade) * case
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
