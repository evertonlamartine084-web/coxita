-- Margens com o custo de hoje: fichas de todos os sabores e o preço dos insumos vindo das compras.
--
-- Até aqui a tela de Margens só tinha ficha dos pastéis (desativados) e os insumos tinham o preço
-- digitado em 10/09. Este arquivo:
--
--   1. liga cada sabor à ficha de UMA unidade dele (flavors.supply_id), um "recheio" de rendimento 1
--      montado com massa, recheio e farinha de rosca -- o custo do pacote sai do sabor escolhido;
--   2. dá ao produto o custo da embalagem por pacote e um custo fixo próprio por unidade (o R$ 0,19
--      de pricing_params veio do pastel e come a margem inteira de um salgadinho de R$ 0,07);
--   3. guarda de quando é o preço de cada insumo (preco_em / preco_origem);
--   4. cria compras_vinculos, o "este item do cupom é aquele insumo", e o gatilho que, a cada item de
--      compra ligado, atualiza o preço do insumo -- só se a compra for mais nova que o preço atual;
--   5. carrega as fichas e os preços da planilha "Custo do produto" e da "Insumos e despesas fixas"
--      (setembro e outubro de 2026).
--
-- Idempotente: pode rodar de novo, os inserts são por nome e as fichas são sobrescritas.

-- ------------------------------------------------------------
-- 1 a 3. Colunas novas
-- ------------------------------------------------------------

alter table flavors add column if not exists supply_id uuid references supplies(id) on delete set null;

-- R$ por pacote: caixa, saco, guardanapo. Entra no custo do pacote inteiro, não por unidade.
alter table products add column if not exists custo_embalagem numeric(10,2) not null default 0;
-- null = usa o custo fixo por unidade de pricing_params.
alter table products add column if not exists custo_fixo_unidade numeric(10,4);

alter table supplies add column if not exists preco_em date;
alter table supplies add column if not exists preco_origem text;

-- ------------------------------------------------------------
-- 4. Item da compra -> insumo
-- ------------------------------------------------------------

create or replace function normalizar_item_compra(t text) returns text
language sql immutable as $$
  select lower(trim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')))
$$;

create table if not exists compras_vinculos (
  chave text primary key,                       -- nome do item no cupom, normalizado
  supply_id uuid not null references supplies(id) on delete cascade,
  -- Quanto do insumo vem em UMA embalagem, na unidade do insumo: "Requeijão 1,8 kg" = 1.8.
  -- Item vendido a peso (unidade KG no cupom) ignora este número: o valor unitário já é o do kg.
  quantidade_por_embalagem numeric(14,6) not null check (quantidade_por_embalagem > 0),
  criado_em timestamptz not null default now()
);

alter table compras_vinculos enable row level security;
drop policy if exists compras_vinculos_painel on compras_vinculos;
create policy compras_vinculos_painel on compras_vinculos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Antes de gravar: item sem insumo pega o do vínculo, se houver.
create or replace function compras_item_achar_insumo() returns trigger
language plpgsql as $$
begin
  if new.supply_id is null then
    select v.supply_id into new.supply_id
      from compras_vinculos v
     where v.chave = normalizar_item_compra(new.nome);
  end if;
  return new;
end $$;

drop trigger if exists compras_item_achar_insumo on compras_itens;
create trigger compras_item_achar_insumo
  before insert or update of nome on compras_itens
  for each row execute function compras_item_achar_insumo();

-- Depois de gravar: o insumo ligado passa a valer o preço desta compra, se ela for a mais nova.
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
    select v.quantidade_por_embalagem into v_qtd
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

drop trigger if exists compras_item_atualizar_insumo on compras_itens;
create trigger compras_item_atualizar_insumo
  after insert or update of supply_id, valor_unitario on compras_itens
  for each row execute function compras_item_atualizar_insumo();

-- ------------------------------------------------------------
-- 5. Carga da planilha
-- ------------------------------------------------------------

-- Nomes que mudam para bater com o que se compra hoje.
update supplies set name = 'Alho em pó'
 where name = 'Alho' and not exists (select 1 from supplies where name = 'Alho em pó');
update supplies set name = 'Queijo mussarela'
 where name = 'Queijo' and not exists (select 1 from supplies where name = 'Queijo mussarela');
update supplies set name = 'Pimenta do reino'
 where name = 'Pimenta' and not exists (select 1 from supplies where name = 'Pimenta do reino');
update supplies set name = 'Cebola'
 where name = 'Cebola branca' and not exists (select 1 from supplies where name = 'Cebola');

-- Insumos comprados: preço da embalagem, quanto vem nela, e de onde saiu o número.
insert into supplies (name, unit, kind, pack_price, pack_quantity, preco_em, preco_origem, note)
values
  ('Farinha de trigo',        'kg', 'insumo',   2.79,  1,     '2026-10-01', 'Planilha de insumos, outubro', 'Farina, saco de 25 a 40 kg'),
  ('Margarina',               'kg', 'insumo', 155.15, 15,     '2026-10-01', 'Planilha de insumos, outubro', 'Elogiata 80%, balde de 15 kg'),
  ('Bacon',                   'kg', 'insumo',  28.99,  1,     '2026-10-01', 'Planilha de insumos, outubro', null),
  ('Sal',                     'kg', 'insumo',   1.25,  1,     '2026-09-01', 'Planilha de insumos, setembro', null),
  ('Alho em pó',              'kg', 'insumo',  28.10,  1,     '2026-09-01', 'Planilha de insumos, setembro', null),
  ('Cebola',                  'kg', 'insumo',   6.59,  1,     '2026-10-01', 'Planilha de insumos, outubro', null),
  ('Páprica doce',            'kg', 'insumo',  30.84,  1,     '2026-09-01', 'Planilha de insumos, setembro', null),
  ('Açafrão',                 'kg', 'insumo',  17.40,  0.7,   '2026-09-01', 'Planilha de insumos, setembro', null),
  ('Colorífico',              'kg', 'insumo',   3.48,  0.25,  '2026-10-01', 'Planilha de insumos, outubro', null),
  ('Coentro em pó',           'kg', 'insumo',   9.22,  0.5,   '2026-10-01', 'Planilha de insumos, outubro', null),
  ('Cominho',                 'kg', 'insumo',   5.49,  0.25,  '2026-10-01', 'Planilha de insumos, outubro', null),
  ('Pimenta do reino',        'kg', 'insumo',   7.50,  0.098, '2026-09-01', 'Planilha de insumos, setembro', null),
  ('Orégano',                 'kg', 'insumo',  14.86,  0.5,   '2026-09-01', 'Planilha de insumos, setembro', null),
  ('Frango',                  'kg', 'insumo',  16.50,  1,     '2026-10-01', 'Planilha de insumos, outubro', 'Filé de peito'),
  ('Carne de sol',            'kg', 'insumo',  39.99,  1,     '2026-09-01', 'Planilha de insumos, setembro', 'Coxão mole'),
  ('Carne moída',             'kg', 'insumo',  27.99,  1,     '2026-09-01', 'Planilha de insumos, setembro', 'Músculo'),
  ('Chimichurri sem pimenta', 'kg', 'insumo',   4.90,  0.06,  '2026-09-01', 'Planilha de insumos, setembro', null),
  ('Queijo mussarela',        'kg', 'insumo',  42.90,  1,     '2026-10-01', 'Planilha de insumos, outubro', null),
  ('Presunto',                'kg', 'insumo',  22.49,  1,     '2026-10-01', 'Planilha de insumos, outubro', 'Aurora'),
  ('Queijo coalho',           'kg', 'insumo',  38.99,  1,     '2026-10-01', 'Planilha de insumos, outubro', null),
  ('Requeijão cremoso',       'kg', 'insumo',  11.49,  1.8,   '2026-10-01', 'Planilha de insumos, outubro', 'Bisnaga de 1,8 kg'),
  ('Requeijão cheddar',       'kg', 'insumo',  16.24,  1.2,   '2026-09-01', 'Planilha de insumos, setembro', 'Bisnaga de 1,2 kg'),
  ('Calabresa',               'kg', 'insumo',  63.90,  2.5,   '2026-09-01', 'Planilha de insumos, setembro', null),
  ('Salsicha',                'kg', 'insumo',  22.90,  3,     '2026-09-01', 'Planilha de insumos, setembro', 'Bom Todo, 3 kg'),
  ('Farinha de rosca',        'kg', 'insumo',  13.34,  1,     '2026-10-01', 'Planilha de insumos, outubro', null),
  ('Massa de pastel',         'kg', 'insumo',  12.49,  1,     '2026-10-01', 'Planilha de insumos, outubro', null),
  ('Leite',                   'L',  'insumo',   5.89,  1,     '2026-09-01', 'Planilha de insumos, setembro', null),
  ('Açúcar',                  'kg', 'insumo',   4.00,  1,     null,         'Planilha de custos', null),
  ('Aroma de baunilha',       'L',  'insumo',   6.09,  0.03,  '2026-09-01', 'Planilha de insumos, setembro', 'Mavalério, 30 ml'),
  ('Nutella',                 'kg', 'insumo', 214.31,  3,     '2026-09-01', 'Planilha de insumos, setembro', 'Pote de 3 kg'),
  ('Doce de leite',           'kg', 'insumo',  31.99,  0.95,  '2026-09-01', 'Planilha de insumos, setembro', 'Aurea 950 g'),
  ('Brigadeiro',              'kg', 'insumo',  31.99,  1,     '2026-09-01', 'Planilha de insumos, setembro', 'Junco 1 kg'),
  ('Coca-Cola lata',          'un', 'insumo',   3.11,  1,     null,         'Planilha de custos', null),
  ('Fanta ou Sprite lata',    'un', 'insumo',   2.63,  1,     null,         'Planilha de custos', null),
  ('Refrigerante 1 litro',    'un', 'insumo',   4.41,  1,     null,         'Planilha de custos', 'Pepsi ou Guaraná')
on conflict (name) do update
   set unit = excluded.unit,
       pack_price = excluded.pack_price,
       pack_quantity = excluded.pack_quantity,
       preco_em = excluded.preco_em,
       preco_origem = excluded.preco_origem,
       note = coalesce(excluded.note, supplies.note),
       active = true,
       updated_at = now();

-- Recheios e massas: quanto rende o lote (peso de tudo que entra, água inclusive) e unidade.
-- As fichas por unidade de cada sabor também são recheios, de rendimento 1.
insert into supplies (name, unit, kind, yield_quantity, note)
values
  ('Massa dos salgados',                 'kg', 'recheio', 11.471, '1 massa: 4 kg de farinha e 6,7 L de água'),
  ('Massa dos doces',                    'kg', 'recheio',  8.975, '1 massa: 3 kg de farinha, 3 L de água e 2 L de leite'),
  ('Recheio de frango com molho',        'kg', 'recheio',  5.62,  'Com 1,5 L de água e 300 g de farinha'),
  ('Recheio sertanejo',                  'kg', 'recheio',  1.6,   null),
  ('Recheio de queijo e cheddar',        'kg', 'recheio',  2.122, null),
  ('Recheio de calabresa',               'kg', 'recheio',  1.3,   null),
  ('Recheio de queijo e presunto',       'kg', 'recheio',  1.6,   null),
  ('Recheio de pizza',                   'kg', 'recheio',  1.616, null),
  ('Coxinha de frango (1 un)',           'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Travesseiro sertanejo (1 un)',       'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Bolinha de queijo (1 un)',           'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Bolinha de carne (1 un)',            'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Bombinha de pizza (1 un)',           'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Enroladinho de salsicha (1 un)',     'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Croquete de queijo e presunto (1 un)', 'un', 'recheio', 1, 'Ficha de uma unidade'),
  ('Croquete de calabresa (1 un)',       'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Coxinha de nutela (1 un)',           'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Churros de doce de leite (1 un)',    'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Churros de brigadeiro (1 un)',       'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Pastel de queijo e presunto (1 un)', 'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Pastel de pizza (1 un)',             'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Pastel de carne (1 un)',             'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Pastel de frango (1 un)',            'un', 'recheio',  1, 'Ficha de uma unidade'),
  ('Pastel sertanejo (1 un)',            'un', 'recheio',  1, 'Ficha de uma unidade')
on conflict (name) do update
   set unit = excluded.unit,
       yield_quantity = excluded.yield_quantity,
       note = coalesce(excluded.note, supplies.note),
       active = true,
       updated_at = now();

-- Fichas: (pai, item, quantidade na unidade do item). Água não entra: custa zero.
create temp table _ficha (pai text, item text, qtd numeric);
insert into _ficha values
  ('Massa dos salgados', 'Farinha de trigo', 4),
  ('Massa dos salgados', 'Margarina', 0.4),
  ('Massa dos salgados', 'Bacon', 0.106),
  ('Massa dos salgados', 'Sal', 0.08),
  ('Massa dos salgados', 'Alho em pó', 0.05),
  ('Massa dos salgados', 'Cebola', 0.06),
  ('Massa dos salgados', 'Páprica doce', 0.025),
  ('Massa dos salgados', 'Açafrão', 0.015),
  ('Massa dos salgados', 'Colorífico', 0.015),
  ('Massa dos salgados', 'Coentro em pó', 0.015),
  ('Massa dos salgados', 'Cominho', 0.005),

  ('Massa dos doces', 'Farinha de trigo', 3),
  ('Massa dos doces', 'Leite', 2),
  ('Massa dos doces', 'Margarina', 0.3),
  ('Massa dos doces', 'Açúcar', 0.54),
  ('Massa dos doces', 'Sal', 0.045),
  ('Massa dos doces', 'Aroma de baunilha', 0.09),

  ('Recheio de frango com molho', 'Frango', 3.6),
  ('Recheio de frango com molho', 'Cebola', 0.09),
  ('Recheio de frango com molho', 'Páprica doce', 0.015),
  ('Recheio de frango com molho', 'Açafrão', 0.04),
  ('Recheio de frango com molho', 'Alho em pó', 0.045),
  ('Recheio de frango com molho', 'Pimenta do reino', 0.015),
  ('Recheio de frango com molho', 'Sal', 0.015),
  ('Recheio de frango com molho', 'Farinha de trigo', 0.3),

  ('Recheio sertanejo', 'Queijo coalho', 0.5),
  ('Recheio sertanejo', 'Carne de sol', 0.5),
  ('Recheio sertanejo', 'Requeijão cremoso', 0.6),

  ('Recheio de queijo e cheddar', 'Queijo mussarela', 1.182),
  ('Recheio de queijo e cheddar', 'Requeijão cremoso', 0.72),
  ('Recheio de queijo e cheddar', 'Requeijão cheddar', 0.22),

  ('Recheio de calabresa', 'Calabresa', 1),
  ('Recheio de calabresa', 'Requeijão cremoso', 0.3),

  ('Recheio de queijo e presunto', 'Queijo mussarela', 0.5),
  ('Recheio de queijo e presunto', 'Presunto', 0.5),
  ('Recheio de queijo e presunto', 'Requeijão cremoso', 0.6),

  ('Recheio de pizza', 'Queijo mussarela', 0.5),
  ('Recheio de pizza', 'Presunto', 0.5),
  ('Recheio de pizza', 'Requeijão cremoso', 0.6),
  ('Recheio de pizza', 'Orégano', 0.016),

  -- Salgadinhos de máquina: 9,8 g de massa, 4,2 g de recheio, 0,21 g de farinha de rosca.
  ('Coxinha de frango (1 un)', 'Recheio de frango com molho', 0.0042),
  ('Coxinha de frango (1 un)', 'Massa dos salgados', 0.0098),
  ('Coxinha de frango (1 un)', 'Farinha de rosca', 0.00021),
  ('Travesseiro sertanejo (1 un)', 'Recheio sertanejo', 0.0042),
  ('Travesseiro sertanejo (1 un)', 'Massa dos salgados', 0.0098),
  ('Travesseiro sertanejo (1 un)', 'Farinha de rosca', 0.00021),
  ('Bolinha de queijo (1 un)', 'Recheio de queijo e cheddar', 0.0042),
  ('Bolinha de queijo (1 un)', 'Massa dos salgados', 0.0098),
  ('Bolinha de queijo (1 un)', 'Farinha de rosca', 0.00021),
  ('Bolinha de carne (1 un)', 'Recheio de carne moída', 0.0042),
  ('Bolinha de carne (1 un)', 'Massa dos salgados', 0.0098),
  ('Bolinha de carne (1 un)', 'Farinha de rosca', 0.00021),
  ('Bombinha de pizza (1 un)', 'Recheio de pizza', 0.0042),
  ('Bombinha de pizza (1 un)', 'Massa dos salgados', 0.0098),
  ('Bombinha de pizza (1 un)', 'Farinha de rosca', 0.00021),
  ('Enroladinho de salsicha (1 un)', 'Salsicha', 0.006),
  ('Enroladinho de salsicha (1 un)', 'Massa dos salgados', 0.0098),
  ('Enroladinho de salsicha (1 un)', 'Farinha de rosca', 0.00021),
  ('Croquete de queijo e presunto (1 un)', 'Recheio de queijo e presunto', 0.0042),
  ('Croquete de queijo e presunto (1 un)', 'Massa dos salgados', 0.0098),
  ('Croquete de queijo e presunto (1 un)', 'Farinha de rosca', 0.00021),
  ('Croquete de calabresa (1 un)', 'Recheio de calabresa', 0.0042),
  ('Croquete de calabresa (1 un)', 'Massa dos salgados', 0.0098),
  ('Croquete de calabresa (1 un)', 'Farinha de rosca', 0.00021),

  -- Doces de máquina
  ('Coxinha de nutela (1 un)', 'Nutella', 0.0054),
  ('Coxinha de nutela (1 un)', 'Massa dos doces', 0.0126),
  ('Churros de doce de leite (1 un)', 'Doce de leite', 0.0054),
  ('Churros de doce de leite (1 un)', 'Massa dos doces', 0.0126),
  ('Churros de brigadeiro (1 un)', 'Brigadeiro', 0.0042),
  ('Churros de brigadeiro (1 un)', 'Massa dos doces', 0.0098),

  -- Pastéis: 12 g de massa e 4 g de recheio
  ('Pastel de queijo e presunto (1 un)', 'Recheio de queijo e presunto', 0.004),
  ('Pastel de queijo e presunto (1 un)', 'Massa de pastel', 0.012),
  ('Pastel de pizza (1 un)', 'Recheio de pizza', 0.004),
  ('Pastel de pizza (1 un)', 'Massa de pastel', 0.012),
  ('Pastel de carne (1 un)', 'Recheio de carne moída', 0.004),
  ('Pastel de carne (1 un)', 'Coentro', 0.001),
  ('Pastel de carne (1 un)', 'Massa de pastel', 0.012),
  ('Pastel de frango (1 un)', 'Recheio de frango para pastel', 0.0045),
  ('Pastel de frango (1 un)', 'Massa de pastel', 0.012),
  ('Pastel sertanejo (1 un)', 'Carne de sol', 0.002),
  ('Pastel sertanejo (1 un)', 'Queijo coalho', 0.002),
  ('Pastel sertanejo (1 un)', 'Massa de pastel', 0.012);

do $$
declare faltando text;
begin
  select string_agg(distinct x.nome, ', ') into faltando
    from (select pai as nome from _ficha union select item from _ficha) x
   where not exists (select 1 from supplies s where s.name = x.nome);
  if faltando is not null then
    raise exception 'Fichas citam itens que não existem: %', faltando;
  end if;
end $$;

-- Sobrescreve as fichas citadas: tira o que saiu, grava o que está acima.
delete from supply_recipe_items r
 using supplies p
 where r.parent_id = p.id
   and p.name in (select distinct pai from _ficha)
   and not exists (
     select 1 from _ficha f join supplies c on c.name = f.item
      where f.pai = p.name and c.id = r.child_id);

insert into supply_recipe_items (parent_id, child_id, quantity)
select p.id, c.id, f.qtd
  from _ficha f
  join supplies p on p.name = f.pai
  join supplies c on c.name = f.item
on conflict (parent_id, child_id) do update set quantity = excluded.quantity;

drop table _ficha;

-- Cada sabor aponta para a ficha da sua unidade.
update flavors f
   set supply_id = s.id
  from supplies s
 where s.name = f.name || ' (1 un)';

-- Embalagem por pacote (planilha: R$ 2,90 + 0,63 no de 50, 3,75 + 1,26 no de 100, 4,16 + 2,52 no de 200).
update products
   set custo_embalagem = case pack_size when 25 then 3.53 when 50 then 3.53 when 100 then 5.01 when 200 then 6.68 end
 where flavor_group is not null and pack_size in (25, 50, 100, 200);

-- Custo fixo: a planilha não rateia aluguel e gás nos salgados, doces e pastéis. Zero até o dono
-- dizer quanto; o R$ 0,19 global continua valendo para o resto.
update products set custo_fixo_unidade = 0
 where flavor_group is not null and custo_fixo_unidade is null;

-- Congelado é vendido com 15% de margem.
update products p set target_margin = 15
  from categories c
 where c.id = p.category_id and c.name = 'Congelados' and p.target_margin is null;

-- Refrigerantes: ficha de 1 unidade comprada.
insert into product_recipe_items (product_id, supply_id, quantity)
select p.id, s.id, 1
  from products p
  join supplies s on s.name = case
         when p.name ilike 'coca%lata%' then 'Coca-Cola lata'
         when p.name ilike any (array['fanta%lata%', 'sprite%lata%']) then 'Fanta ou Sprite lata'
         when p.name ilike any (array['pepsi%1 litro%', 'guaran%1 litro%']) then 'Refrigerante 1 litro'
       end
on conflict do nothing;
update products set custo_fixo_unidade = 0
 where custo_fixo_unidade is null
   and id in (select product_id from product_recipe_items r join supplies s on s.id = r.supply_id
               where s.name in ('Coca-Cola lata', 'Fanta ou Sprite lata', 'Refrigerante 1 litro'));

-- Itens de cupom já lançados que são insumos. O gatilho de compras_itens põe o preço deles no
-- insumo quando forem mais novos que a planilha.
insert into compras_vinculos (chave, supply_id, quantidade_por_embalagem)
select normalizar_item_compra(v.nome), s.id, v.qtd
  from (values
    ('Sal nevado 1kg', 'Sal', 1),
    ('CHIMICHURRI S/ PIMENTA 200g', 'Chimichurri sem pimenta', 0.2),
    ('ALHO EM PO 500g', 'Alho em pó', 0.5),
    ('Req reke minas bisn 1,8kg', 'Requeijão cremoso', 1.8),
    ('Farinha trigo farina t1 1kg', 'Farinha de trigo', 1)
  ) as v(nome, insumo, qtd)
  join supplies s on s.name = v.insumo
on conflict (chave) do update
   set supply_id = excluded.supply_id, quantidade_por_embalagem = excluded.quantidade_por_embalagem;

update compras_itens i
   set supply_id = v.supply_id
  from compras_vinculos v
 where v.chave = normalizar_item_compra(i.nome)
   and i.supply_id is distinct from v.supply_id;
