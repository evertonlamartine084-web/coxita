-- Unidade de nota de atacarejo com o múltiplo grudado (28/10/2026).
--
-- Na NF-e do Mar Vermelho o óleo veio "1 CX20" a R$ 149,80: uma caixa com 20 garrafas de 900 ml.
-- A salsicha "1 PC3" a R$ 22,77: pacote de 3 kg. "UN1" e "PC1" são uma unidade só. Sem ler o
-- número, o custo do insumo saía 20 vezes maior e a conta do óleo via 0,9 L onde entraram 18 L.
--
-- quantidade_por_embalagem do vínculo continua sendo o que vem em UMA peça ("900ml" = 0,9 L); o
-- número da unidade multiplica.

create or replace function multiplo_da_unidade(u text) returns numeric
language sql immutable as $$
  select coalesce(nullif((regexp_match(upper(coalesce(u, '')), '^[A-Z]+(\d+)$'))[1], '')::numeric, 1)
$$;

create or replace function compras_item_atualizar_insumo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_qtd numeric;
  v_data date;
  v_loja text;
begin
  if new.supply_id is null or coalesce(new.valor_unitario, 0) <= 0 then
    return new;
  end if;

  if upper(coalesce(new.unidade, '')) like 'KG%' then
    v_qtd := 1;                                 -- vendido a peso: valor unitário já é o do kg
  else
    select v.quantidade_por_embalagem * multiplo_da_unidade(new.unidade) into v_qtd
      from compras_vinculos v
     where v.chave = normalizar_item_compra(new.nome) and v.supply_id = new.supply_id;
  end if;
  if coalesce(v_qtd, 0) <= 0 then
    return new;
  end if;

  select coalesce(c.emitida_em, c.created_at)::date, coalesce(c.emitente_nome, c.emitente_nome_sefaz)
    into v_data, v_loja
    from compras c where c.id = new.compra_id;

  update supplies s
     set pack_price = round(new.valor_unitario, 2),
         pack_quantity = v_qtd,
         preco_em = v_data,
         preco_origem = 'Compra' || coalesce(' em ' || v_loja, ''),
         updated_at = now()
   where s.id = new.supply_id
     and s.kind = 'insumo'
     and (s.preco_em is null or s.preco_em <= v_data);

  return new;
end $$;

-- Óleo: litros do nome vezes a quantidade vezes o múltiplo da unidade.
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

-- A nota de 28/10 do Mar Vermelho (Igapó): nome da loja e os três itens que são insumo.
update compras set emitente_nome = 'Mar Vermelho' where emitente_cnpj = '61.836.699/0001-19';

update settings
   set value = (value::jsonb || jsonb_build_object('61836699000119', 'Mar Vermelho'))::text
 where key = 'compras_fornecedores';

insert into compras_vinculos (chave, supply_id, quantidade_por_embalagem)
select normalizar_item_compra(v.nome), s.id, v.qtd
  from (values
    ('Oleo de soja vila velha pet 900ml', 'Óleo de soja', 0.9),
    ('Salsicha hot dog bom todo kg', 'Salsicha', 1),
    ('Massa p pastel fest rolo 2kg', 'Massa de pastel', 2)
  ) as v(nome, insumo, qtd)
  join supplies s on s.name = v.insumo
on conflict (chave) do update
   set supply_id = excluded.supply_id, quantidade_por_embalagem = excluded.quantidade_por_embalagem;

update compras_itens i
   set supply_id = v.supply_id
  from compras_vinculos v
 where v.chave = normalizar_item_compra(i.nome)
   and i.supply_id is distinct from v.supply_id;
