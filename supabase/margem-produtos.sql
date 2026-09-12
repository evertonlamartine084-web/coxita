-- ============================================================
-- COXELLI - Ficha técnica, custo e margem por produto
--
-- É idempotente: pode rodar mais de uma vez sem duplicar nada.
--
-- Espelha a planilha de custos ("Recheios" e "Produtos"), com a diferença de
-- que aqui o número não é digitado: ele sai da conta.
--
-- Três peças:
--
--   `supplies` guarda o que entra na comida. Duas naturezas na mesma tabela,
--   separadas por `kind`:
--     'insumo'  -- comprado. Preço da compra e quanto ela rende.
--                  Massa de pastel: R$ 11,89 o kg.
--     'recheio' -- produzido. Não tem preço de compra; tem ficha própria e
--                  rendimento. O recheio de carne moída consome R$ 114,38 de
--                  insumos e rende 2,914 kg -> R$ 39,25/kg.
--
--   Recheio pode entrar em recheio (`supply_recipe_items`): o recheio de
--   frango para pastel leva o recheio de frango da coxinha dentro dele. Por
--   isso a conta é recursiva -- ver src/utils/margem.js.
--
--   `product_recipe_items` é a ficha do produto vendido, em cima de insumos
--   e recheios indiferentemente.
--
-- O rendimento é o que faz o custo ser verdade: recheio cozido perde água, e
-- dividir o gasto pelo peso que entrou (e não pelo que saiu) subestima o
-- custo de cada pastel. A planilha divide pelo peso da proteína, e é esse
-- número que está em `yield_quantity`.
--
-- A fórmula de preço vive em src/utils/margem.js; aqui só ficam os dados,
-- para não existirem duas fórmulas para discordarem depois.
--
-- Custo é dado interno: nenhuma policy de leitura pública nestas tabelas.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Insumos e recheios
-- ------------------------------------------------------------

create table if not exists supplies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- Unidade em que a ficha pede este item: kg, g, ml, un...
  unit text not null default 'kg',
  pack_price decimal(10,2),
  pack_quantity decimal(14,6),
  note text,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table supplies add column if not exists kind text not null default 'insumo';
alter table supplies add column if not exists yield_quantity decimal(14,6);

-- Recheio não tem preço de compra, então as colunas do insumo passam a ser
-- opcionais e a coerência fica na constraint de `kind`, abaixo.
alter table supplies alter column pack_price drop not null;
alter table supplies alter column pack_quantity drop not null;
alter table supplies alter column pack_quantity type decimal(14,6);

-- Os insumos de estimativa da primeira versão saem: a planilha é a fonte.
delete from supplies
 where note in ('valor de partida - confira',
                'estimativa de rendimento - confira',
                'hora a R$ 15, ~60 unidades - confira')
   and not exists (select 1 from product_recipe_items r where r.supply_id = supplies.id);

alter table supplies drop constraint if exists supplies_pack_price_check;
alter table supplies drop constraint if exists supplies_pack_quantity_check;
alter table supplies drop constraint if exists supplies_kind_coerente;
alter table supplies add constraint supplies_kind_coerente check (
  (kind = 'insumo'
     and pack_price is not null and pack_price >= 0
     and pack_quantity is not null and pack_quantity > 0
     and yield_quantity is null)
  or
  (kind = 'recheio'
     and yield_quantity is not null and yield_quantity > 0
     and pack_price is null and pack_quantity is null)
);

comment on table supplies is
  'O que entra na comida. kind=insumo é comprado (pack_price/pack_quantity); kind=recheio é produzido (ficha em supply_recipe_items + yield_quantity).';
comment on column supplies.pack_quantity is
  'Quanto a compra rende, na unidade de `unit`. Ex.: 1 para o preço do kg.';
comment on column supplies.yield_quantity is
  'Quanto o lote do recheio rende, na unidade de `unit`. É o peso DEPOIS do preparo.';

create index if not exists idx_supplies_active on supplies(active);
create index if not exists idx_supplies_kind on supplies(kind);

-- Ficha do recheio: insumos (e outros recheios) que entram no lote.
create table if not exists supply_recipe_items (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references supplies(id) on delete cascade not null,
  -- restrict, não set null: linha sem item é custo que desaparece em
  -- silêncio. Para aposentar um insumo, tire-o das fichas primeiro.
  child_id uuid references supplies(id) on delete restrict not null,
  quantity decimal(14,6) not null check (quantity > 0),
  created_at timestamptz default now(),
  unique (parent_id, child_id),
  check (parent_id <> child_id)
);

create index if not exists idx_supply_recipe_parent on supply_recipe_items(parent_id);
create index if not exists idx_supply_recipe_child on supply_recipe_items(child_id);

-- ------------------------------------------------------------
-- 2. Ficha do produto
-- ------------------------------------------------------------

-- Rendimento da ficha: quantas unidades saem da receita escrita. 1 quando a
-- ficha descreve uma unidade, como na planilha ("Pastel de carne - 1 unidade").
alter table products add column if not exists recipe_yield int not null default 1;

alter table products drop constraint if exists products_recipe_yield_positivo;
alter table products add constraint products_recipe_yield_positivo
  check (recipe_yield > 0);

-- Perda de produção (massa que rasga, pastel que queima), em % sobre o custo.
alter table products add column if not exists waste_percent decimal(5,2) not null default 0;

alter table products drop constraint if exists products_waste_percent_faixa;
alter table products add constraint products_waste_percent_faixa
  check (waste_percent >= 0 and waste_percent < 100);

-- Margem desejada em %. Nula = usa a margem padrão das configurações.
alter table products add column if not exists target_margin decimal(5,2);

alter table products drop constraint if exists products_target_margin_faixa;
alter table products add constraint products_target_margin_faixa
  check (target_margin is null or (target_margin >= 0 and target_margin < 100));

comment on column products.recipe_yield is
  'Unidades que a ficha técnica rende. 1 quando a ficha é de uma unidade.';
comment on column products.waste_percent is
  'Perda de produção em %, aplicada sobre o custo da ficha.';
comment on column products.target_margin is
  'Margem desejada em %. Nula = margem padrão das configurações.';

create table if not exists product_recipe_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade not null,
  supply_id uuid references supplies(id) on delete restrict not null,
  quantity decimal(14,6) not null check (quantity > 0),
  created_at timestamptz default now(),
  unique (product_id, supply_id)
);

alter table product_recipe_items alter column quantity type decimal(14,6);

comment on table product_recipe_items is
  'Ficha técnica: quanto de cada insumo/recheio entra para produzir products.recipe_yield unidades.';

create index if not exists idx_recipe_items_product on product_recipe_items(product_id);
create index if not exists idx_recipe_items_supply on product_recipe_items(supply_id);

-- ------------------------------------------------------------
-- 3. Segurança
--
-- Só quem está logado no painel lê e escreve. O site público não precisa
-- saber quanto custa produzir, e a anon key está no bundle de todo visitante.
-- ------------------------------------------------------------

alter table supplies enable row level security;
alter table supply_recipe_items enable row level security;
alter table product_recipe_items enable row level security;

drop policy if exists "supplies_admin_all" on supplies;
create policy "supplies_admin_all" on supplies for all
  using (auth.role() = 'authenticated');

drop policy if exists "supply_recipe_admin_all" on supply_recipe_items;
create policy "supply_recipe_admin_all" on supply_recipe_items for all
  using (auth.role() = 'authenticated');

drop policy if exists "recipe_items_admin_all" on product_recipe_items;
create policy "recipe_items_admin_all" on product_recipe_items for all
  using (auth.role() = 'authenticated');

drop trigger if exists supplies_updated_at on supplies;
create trigger supplies_updated_at before update on supplies
  for each row execute function update_updated_at();

-- ------------------------------------------------------------
-- 4. Parâmetros de precificação
--
-- Tabela própria, e não `settings`: settings tem leitura pública (o site lê
-- taxa de entrega e horário de lá com a anon key, que está no bundle de todo
-- visitante). Margem, imposto e custo fixo não são para o cliente ler.
--
-- Linha única: `id` só aceita true, então não existe segunda configuração
-- para o painel escolher errado.
--
-- As taxas de cartão são as da maquininha da loja (débito 1,89%, crédito à
-- vista 3,49%). Crédito parcelado é mais caro e não está aqui: se você passar
-- a vender parcelado, o preço sugerido do crédito deixa de cobrir a taxa.
-- ------------------------------------------------------------

create table if not exists pricing_params (
  id boolean primary key default true check (id),
  -- Margem desejada quando o produto não tem uma própria, em % sobre a venda.
  default_margin decimal(5,2) not null default 30 check (default_margin >= 0 and default_margin < 100),
  -- Imposto sobre a venda, em %.
  tax_percent decimal(5,2) not null default 0.4 check (tax_percent >= 0 and tax_percent < 100),
  -- Rateio de aluguel, luz, gás e afins por unidade vendida, em R$.
  fixed_cost_per_unit decimal(10,4) not null default 0.19 check (fixed_cost_per_unit >= 0),
  -- Taxa da maquininha / do meio de pagamento, em %.
  fee_credit decimal(5,2) not null default 3.49 check (fee_credit >= 0 and fee_credit < 100),
  fee_debit  decimal(5,2) not null default 1.89 check (fee_debit  >= 0 and fee_debit  < 100),
  fee_pix    decimal(5,2) not null default 0   check (fee_pix    >= 0 and fee_pix    < 100),
  -- Passo do arredondamento do preço sugerido, em R$. O painel arredonda
  -- sempre para CIMA: para baixo entregaria menos margem que a pedida, que é
  -- o contrário do motivo de existir esta tela. Zero desliga.
  rounding_step decimal(10,2) not null default 0.05 check (rounding_step >= 0),
  updated_at timestamptz default now()
);

alter table pricing_params add column if not exists rounding_step decimal(10,2) not null default 0.05;

alter table pricing_params drop constraint if exists pricing_params_rounding_step_check;
alter table pricing_params add constraint pricing_params_rounding_step_check
  check (rounding_step >= 0);

insert into pricing_params (id) values (true) on conflict (id) do nothing;

alter table pricing_params enable row level security;

drop policy if exists "pricing_params_admin_all" on pricing_params;
create policy "pricing_params_admin_all" on pricing_params for all
  using (auth.role() = 'authenticated');

drop trigger if exists pricing_params_updated_at on pricing_params;
create trigger pricing_params_updated_at before update on pricing_params
  for each row execute function update_updated_at();

-- A primeira versão gravou isto em `settings`, onde era público. Sai de lá.
delete from settings
 where key in ('margem_padrao', 'imposto_percent', 'custo_fixo_unidade',
               'taxa_credito', 'taxa_debito', 'taxa_pix');

-- ------------------------------------------------------------
-- 5. Insumos da planilha (preço por kg, salvo indicado)
-- ------------------------------------------------------------

insert into supplies (name, kind, unit, pack_price, pack_quantity, sort_order) values
  ('Massa de pastel',          'insumo', 'kg', 11.89, 1, 1),
  ('Queijo',                   'insumo', 'kg', 36.99, 1, 2),
  ('Presunto',                 'insumo', 'kg', 38.90, 1, 3),
  ('Queijo coalho',            'insumo', 'kg', 41.90, 1, 4),
  ('Carne de sol',             'insumo', 'kg', 42.90, 1, 5),
  ('Carne moída',              'insumo', 'kg', 36.99, 1, 6),
  ('Frango',                   'insumo', 'kg', 13.99, 1, 7),
  ('Requeijão cremoso',        'insumo', 'kg', 46.60, 1, 8),
  ('Cebola branca',            'insumo', 'kg',  5.99, 1, 9),
  ('Alho',                     'insumo', 'kg', 25.30, 1, 10),
  ('Sal',                      'insumo', 'kg',  1.25, 1, 11),
  ('Pimenta',                  'insumo', 'kg', 75.00, 1, 12),
  ('Páprica doce',             'insumo', 'kg', 26.35, 1, 13),
  ('Colorífico',               'insumo', 'kg', 11.95, 1, 14),
  ('Açafrão',                  'insumo', 'kg', 24.85, 1, 15),
  ('Orégano',                  'insumo', 'kg', 29.72, 1, 16),
  ('Coentro',                  'insumo', 'kg',  7.57, 1, 17),
  ('Chimichurri sem pimenta',  'insumo', 'kg', 81.66, 1, 18),
  ('Farinha de rosca',         'insumo', 'kg', 17.49, 1, 19)
on conflict (name) do update set
  kind          = excluded.kind,
  unit          = excluded.unit,
  pack_price    = excluded.pack_price,
  pack_quantity = excluded.pack_quantity,
  sort_order    = excluded.sort_order,
  note          = null,
  updated_at    = now();

-- ------------------------------------------------------------
-- 6. Recheios da planilha
--
-- O rendimento é o peso da proteína depois do preparo, como na planilha.
-- ------------------------------------------------------------

insert into supplies (name, kind, unit, yield_quantity, sort_order) values
  ('Recheio de frango para coxinha pré-pronto', 'recheio', 'kg', 3.600, 30),
  ('Recheio de carne de sol',                   'recheio', 'kg', 3.368, 31),
  ('Recheio de carne moída',                    'recheio', 'kg', 2.914, 32),
  ('Recheio de frango para pastel',              'recheio', 'kg', 0.0225, 33)
on conflict (name) do update set
  kind           = excluded.kind,
  unit           = excluded.unit,
  yield_quantity = excluded.yield_quantity,
  sort_order     = excluded.sort_order,
  pack_price     = null,
  pack_quantity  = null,
  updated_at     = now();

-- Fichas dos recheios
insert into supply_recipe_items (parent_id, child_id, quantity)
select pai.id, filho.id, v.quantidade
  from (values
    ('Recheio de frango para coxinha pré-pronto', 'Cebola branca',            0.090000),
    ('Recheio de frango para coxinha pré-pronto', 'Frango',                   3.600000),

    ('Recheio de carne de sol',                   'Carne de sol',             3.368000),

    ('Recheio de carne moída',                    'Carne moída',              2.914000),
    ('Recheio de carne moída',                    'Cebola branca',            0.500000),
    ('Recheio de carne moída',                    'Chimichurri sem pimenta',  0.016000),
    ('Recheio de carne moída',                    'Alho',                     0.016000),
    ('Recheio de carne moída',                    'Pimenta',                  0.016000),
    ('Recheio de carne moída',                    'Páprica doce',             0.016000),
    ('Recheio de carne moída',                    'Colorífico',               0.020000),
    ('Recheio de carne moída',                    'Sal',                      0.016000),

    ('Recheio de frango para pastel', 'Recheio de frango para coxinha pré-pronto', 0.010000),
    ('Recheio de frango para pastel', 'Requeijão cremoso',                         0.010000),
    ('Recheio de frango para pastel', 'Páprica doce',                              0.000500),
    ('Recheio de frango para pastel', 'Açafrão',                                   0.000500),
    ('Recheio de frango para pastel', 'Alho',                                      0.000500),
    ('Recheio de frango para pastel', 'Pimenta',                                   0.000500),
    ('Recheio de frango para pastel', 'Sal',                                       0.000500)
  ) as v(pai, filho, quantidade)
  join supplies pai   on pai.name   = v.pai
  join supplies filho on filho.name = v.filho
on conflict (parent_id, child_id) do update set quantity = excluded.quantity;

-- ------------------------------------------------------------
-- 7. Conferência: custo por kg de cada recheio
-- ------------------------------------------------------------

with custo_insumo as (
  select id, pack_price / pack_quantity as unitario from supplies where kind = 'insumo'
),
-- Um nível de aninhamento resolve as fichas de hoje. A conta completa,
-- recursiva, é a do painel; aqui é só conferência.
recheio_base as (
  select s.id, s.name, s.yield_quantity,
         sum(r.quantity * ci.unitario) as gasto
    from supplies s
    join supply_recipe_items r on r.parent_id = s.id
    join custo_insumo ci on ci.id = r.child_id
   where s.kind = 'recheio'
   group by s.id, s.name, s.yield_quantity
)
select name,
       round(gasto, 2) as gasto_no_lote,
       yield_quantity as rende,
       round(gasto / yield_quantity, 2) as custo_por_kg
  from recheio_base
 order by name;

-- ------------------------------------------------------------
-- 8. Os cinco pastéis da planilha, como fichas
--
-- Entram INATIVOS e numa categoria inativa: a loja não muda por causa
-- disto. O que a ficha de um pastel dá é o custo e o preço de UMA unidade --
-- que é a base para montar o preço do cento, não um item para o cliente
-- comprar solto. Quando você decidir vender, ative no painel de produtos.
--
-- `price` já entra com o preço sugerido para cartão de crédito (o pior caso
-- de taxa, então a margem se sustenta em qualquer forma de pagamento), com o
-- arredondamento para cima de R$ 0,05 aplicado. Confira em Margens antes de
-- ativar.
-- ------------------------------------------------------------

insert into categories (name, slug, sort_order, active) values
  ('Pastéis (unidade)', 'pasteis-unidade', 90, false)
on conflict (slug) do nothing;

insert into products (category_id, name, description, price, recipe_yield, waste_percent, target_margin, active, featured, sort_order)
select c.id, p.name, p.description, p.price, 1, 0, 30.00, false, false, p.sort_order
  from (values
    ('Pastel de queijo e presunto (unidade)',  'Ficha de custo de 1 unidade. Base para o preço do cento.', 0.75::decimal, 91),
    ('Pastel de pizza (unidade)',              'Ficha de custo de 1 unidade. Base para o preço do cento.', 0.75::decimal, 92),
    ('Pastel de carne (unidade)',              'Ficha de custo de 1 unidade. Base para o preço do cento.', 0.80::decimal, 93),
    ('Pastel de frango com requeijão (unidade)','Ficha de custo de 1 unidade. Base para o preço do cento.', 0.75::decimal, 94),
    ('Pastel sertanejo (unidade)',             'Ficha de custo de 1 unidade. Base para o preço do cento.', 0.80::decimal, 95)
  ) as p(name, description, price, sort_order)
  cross join (select id from categories where slug = 'pasteis-unidade') c
 where not exists (select 1 from products x where x.name = p.name);

insert into product_recipe_items (product_id, supply_id, quantity)
select prod.id, ins.id, v.quantidade
  from (values
    ('Pastel de queijo e presunto (unidade)',   'Queijo',                   0.002000),
    ('Pastel de queijo e presunto (unidade)',   'Presunto',                 0.002000),
    ('Pastel de queijo e presunto (unidade)',   'Massa de pastel',          0.012000),
    ('Pastel de queijo e presunto (unidade)',   'Farinha de rosca',         0.000315),

    ('Pastel de pizza (unidade)',               'Orégano',                  0.000100),
    ('Pastel de pizza (unidade)',               'Queijo',                   0.002000),
    ('Pastel de pizza (unidade)',               'Presunto',                 0.002000),
    ('Pastel de pizza (unidade)',               'Massa de pastel',          0.012000),

    ('Pastel de carne (unidade)',               'Coentro',                  0.001000),
    ('Pastel de carne (unidade)',               'Recheio de carne moída',   0.004000),
    ('Pastel de carne (unidade)',               'Massa de pastel',          0.012000),

    ('Pastel de frango com requeijão (unidade)','Recheio de frango para pastel', 0.004500),
    ('Pastel de frango com requeijão (unidade)','Massa de pastel',          0.012000),

    ('Pastel sertanejo (unidade)',              'Carne de sol',             0.002000),
    ('Pastel sertanejo (unidade)',              'Queijo coalho',            0.002000),
    ('Pastel sertanejo (unidade)',              'Massa de pastel',          0.012000)
  ) as v(produto, insumo, quantidade)
  join products prod on prod.name = v.produto
  join supplies ins  on ins.name  = v.insumo
on conflict (product_id, supply_id) do update set quantity = excluded.quantity;

-- ------------------------------------------------------------
-- 9. Conferência: custo bruto de cada pastel
--
-- Resolve recheio dentro de recheio em dois níveis, que é o que as fichas de
-- hoje usam. A conta do painel é recursiva de verdade (src/utils/margem.js).
-- ------------------------------------------------------------

with custo_insumo as (
  select id, pack_price / pack_quantity as unitario
    from supplies where kind = 'insumo'
),
recheio_n1 as (
  select s.id, sum(r.quantity * ci.unitario) / s.yield_quantity as unitario
    from supplies s
    join supply_recipe_items r on r.parent_id = s.id
    join custo_insumo ci on ci.id = r.child_id
   where s.kind = 'recheio'
   group by s.id, s.yield_quantity
),
custo_n1 as (
  select * from custo_insumo union all select * from recheio_n1
),
recheio_n2 as (
  select s.id, sum(r.quantity * c.unitario) / s.yield_quantity as unitario
    from supplies s
    join supply_recipe_items r on r.parent_id = s.id
    join custo_n1 c on c.id = r.child_id
   where s.kind = 'recheio'
   group by s.id, s.yield_quantity
),
custo_final as (
  select * from custo_insumo union all select * from recheio_n2
)
select p.name,
       round(sum(r.quantity * c.unitario), 4) as custo_bruto,
       p.price as preco_gravado
  from products p
  join product_recipe_items r on r.product_id = p.id
  join custo_final c on c.id = r.supply_id
 group by p.id, p.name, p.price
 order by p.name;
