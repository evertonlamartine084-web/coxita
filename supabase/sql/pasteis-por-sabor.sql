-- ============================================================
-- COXELLI - Pastel com preço por sabor
--
-- Rode depois de pasteis-a-venda.sql. É idempotente.
--
-- Troca o pacote misto de pastel (um preço, sabores à escolha) por um produto
-- para cada sabor e tamanho: 5 sabores × 4 tamanhos = 20 produtos.
--
-- Por que: no pacote misto o preço tinha que ser o do sertanejo (o pastel mais
-- caro), senão um cento cheio dele daria menos margem que a pedida. Quem
-- queria o pastel de frango, o mais barato de produzir, pagava preço de
-- sertanejo. Com um produto por sabor, cada um custa o que custa -- de R$ 72
-- (frango) a R$ 76 (sertanejo) o cento.
--
-- O que se perde: montar um cento com sabores misturados. Foi decisão do dono
-- em 10/09/2026, ciente da troca.
--
-- `fixed_flavor_id` é o que faz o produto ser de um sabor só: quem tem esse
-- campo não abre o seletor de sabores, vai direto ao carrinho já com o sabor
-- marcado -- e o pedido continua chegando na cozinha com o sabor escrito em
-- order_item_flavors, como nos pacotes mistos.
-- ============================================================

alter table products add column if not exists fixed_flavor_id uuid references flavors(id);

comment on column products.fixed_flavor_id is
  'Sabor único deste pacote. Preenchido = não há o que escolher, o pacote inteiro é deste sabor.';

create index if not exists idx_products_fixed_flavor on products(fixed_flavor_id);

-- ------------------------------------------------------------
-- 1. Os pacotes mistos saem do cardápio
--
-- active = false em vez de delete: se algum pedido já tiver saído com eles,
-- apagar a linha deixaria o histórico sem nome de produto.
-- ------------------------------------------------------------

update products
   set active = false, featured = false, updated_at = now()
 where name in ('Cento de Pastéis', '75 Pastéis', 'Meio Cento de Pastéis', '25 Pastéis');

-- ------------------------------------------------------------
-- 2. Um produto por sabor e tamanho
--
-- Preço calculado com a mesma fórmula do painel (src/utils/margem.js): custo
-- da ficha do sabor + custo fixo, com 30% de margem, imposto de 0,4% e a taxa
-- do crédito, arredondado para cima de R$ 1 em R$ 1.
-- ------------------------------------------------------------

insert into products (category_id, name, description, price, pack_size, flavor_group, fixed_flavor_id, recipe_yield, target_margin, featured, active, sort_order)
select c.id, v.nome, v.descricao, v.preco, v.unidades, 'pasteis', f.id, 1, 30.00, v.destaque, true, v.ordem
  from (values
    ('Cento de Pastel de Frango', 'Cento de pastel de frango, fritos na hora.', 72.00::decimal, 100, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 11),
    ('75 Pastéis de Frango', '75 unidades de pastel de frango, fritos na hora.', 54.00::decimal, 75, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 12),
    ('Meio Cento de Pastel de Frango', 'Meio cento de pastel de frango, fritos na hora.', 36.00::decimal, 50, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 13),
    ('25 Pastéis de Frango', '25 unidades de pastel de frango, fritos na hora.', 18.00::decimal, 25, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 14),
    ('Cento de Pastel de Carne', 'Cento de pastel de carne, fritos na hora.', 76.00::decimal, 100, 'Pastel de carne', 'Pastel de carne (unidade)', false, 15),
    ('75 Pastéis de Carne', '75 unidades de pastel de carne, fritos na hora.', 57.00::decimal, 75, 'Pastel de carne', 'Pastel de carne (unidade)', false, 16),
    ('Meio Cento de Pastel de Carne', 'Meio cento de pastel de carne, fritos na hora.', 38.00::decimal, 50, 'Pastel de carne', 'Pastel de carne (unidade)', false, 17),
    ('25 Pastéis de Carne', '25 unidades de pastel de carne, fritos na hora.', 19.00::decimal, 25, 'Pastel de carne', 'Pastel de carne (unidade)', false, 18),
    ('Cento de Pastel Sertanejo', 'Cento de pastel sertanejo, fritos na hora.', 76.00::decimal, 100, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', true, 19),
    ('75 Pastéis Sertanejo', '75 unidades de pastel sertanejo, fritos na hora.', 57.00::decimal, 75, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', false, 20),
    ('Meio Cento de Pastel Sertanejo', 'Meio cento de pastel sertanejo, fritos na hora.', 38.00::decimal, 50, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', false, 21),
    ('25 Pastéis Sertanejo', '25 unidades de pastel sertanejo, fritos na hora.', 19.00::decimal, 25, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', false, 22),
    ('Cento de Pastel de Pizza', 'Cento de pastel de pizza, fritos na hora.', 74.00::decimal, 100, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 23),
    ('75 Pastéis de Pizza', '75 unidades de pastel de pizza, fritos na hora.', 56.00::decimal, 75, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 24),
    ('Meio Cento de Pastel de Pizza', 'Meio cento de pastel de pizza, fritos na hora.', 37.00::decimal, 50, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 25),
    ('25 Pastéis de Pizza', '25 unidades de pastel de pizza, fritos na hora.', 19.00::decimal, 25, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 26),
    ('Cento de Pastel de Queijo e Presunto', 'Cento de pastel de queijo e presunto, fritos na hora.', 75.00::decimal, 100, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', true, 27),
    ('75 Pastéis de Queijo e Presunto', '75 unidades de pastel de queijo e presunto, fritos na hora.', 56.00::decimal, 75, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', false, 28),
    ('Meio Cento de Pastel de Queijo e Presunto', 'Meio cento de pastel de queijo e presunto, fritos na hora.', 38.00::decimal, 50, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', false, 29),
    ('25 Pastéis de Queijo e Presunto', '25 unidades de pastel de queijo e presunto, fritos na hora.', 19.00::decimal, 25, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', false, 30)
  ) as v(nome, descricao, preco, unidades, sabor, ficha, destaque, ordem)
  join flavors f on f.name = v.sabor
  cross join (select id from categories where slug = 'centos-pasteis') c
 where not exists (select 1 from products x where x.name = v.nome);

-- Reaplica o que não entra no insert quando o produto já existia.
update products p
   set price            = v.preco,
       description      = v.descricao,
       pack_size        = v.unidades,
       flavor_group     = 'pasteis',
       fixed_flavor_id  = f.id,
       recipe_yield     = 1,
       target_margin    = 30.00,
       featured         = v.destaque,
       active           = true,
       sort_order       = v.ordem,
       updated_at       = now()
  from (values
    ('Cento de Pastel de Frango', 'Cento de pastel de frango, fritos na hora.', 72.00::decimal, 100, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 11),
    ('75 Pastéis de Frango', '75 unidades de pastel de frango, fritos na hora.', 54.00::decimal, 75, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 12),
    ('Meio Cento de Pastel de Frango', 'Meio cento de pastel de frango, fritos na hora.', 36.00::decimal, 50, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 13),
    ('25 Pastéis de Frango', '25 unidades de pastel de frango, fritos na hora.', 18.00::decimal, 25, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 14),
    ('Cento de Pastel de Carne', 'Cento de pastel de carne, fritos na hora.', 76.00::decimal, 100, 'Pastel de carne', 'Pastel de carne (unidade)', false, 15),
    ('75 Pastéis de Carne', '75 unidades de pastel de carne, fritos na hora.', 57.00::decimal, 75, 'Pastel de carne', 'Pastel de carne (unidade)', false, 16),
    ('Meio Cento de Pastel de Carne', 'Meio cento de pastel de carne, fritos na hora.', 38.00::decimal, 50, 'Pastel de carne', 'Pastel de carne (unidade)', false, 17),
    ('25 Pastéis de Carne', '25 unidades de pastel de carne, fritos na hora.', 19.00::decimal, 25, 'Pastel de carne', 'Pastel de carne (unidade)', false, 18),
    ('Cento de Pastel Sertanejo', 'Cento de pastel sertanejo, fritos na hora.', 76.00::decimal, 100, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', true, 19),
    ('75 Pastéis Sertanejo', '75 unidades de pastel sertanejo, fritos na hora.', 57.00::decimal, 75, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', false, 20),
    ('Meio Cento de Pastel Sertanejo', 'Meio cento de pastel sertanejo, fritos na hora.', 38.00::decimal, 50, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', false, 21),
    ('25 Pastéis Sertanejo', '25 unidades de pastel sertanejo, fritos na hora.', 19.00::decimal, 25, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', false, 22),
    ('Cento de Pastel de Pizza', 'Cento de pastel de pizza, fritos na hora.', 74.00::decimal, 100, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 23),
    ('75 Pastéis de Pizza', '75 unidades de pastel de pizza, fritos na hora.', 56.00::decimal, 75, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 24),
    ('Meio Cento de Pastel de Pizza', 'Meio cento de pastel de pizza, fritos na hora.', 37.00::decimal, 50, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 25),
    ('25 Pastéis de Pizza', '25 unidades de pastel de pizza, fritos na hora.', 19.00::decimal, 25, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 26),
    ('Cento de Pastel de Queijo e Presunto', 'Cento de pastel de queijo e presunto, fritos na hora.', 75.00::decimal, 100, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', true, 27),
    ('75 Pastéis de Queijo e Presunto', '75 unidades de pastel de queijo e presunto, fritos na hora.', 56.00::decimal, 75, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', false, 28),
    ('Meio Cento de Pastel de Queijo e Presunto', 'Meio cento de pastel de queijo e presunto, fritos na hora.', 38.00::decimal, 50, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', false, 29),
    ('25 Pastéis de Queijo e Presunto', '25 unidades de pastel de queijo e presunto, fritos na hora.', 19.00::decimal, 25, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', false, 30)
  ) as v(nome, descricao, preco, unidades, sabor, ficha, destaque, ordem)
  join flavors f on f.name = v.sabor
 where p.name = v.nome;

-- ------------------------------------------------------------
-- 3. Ficha de cada produto = ficha daquele sabor
--
-- Copiada das fichas de unidade ("Pastel X (unidade)"), que são as da
-- planilha. Assim o painel de Margens calcula a margem real de cada produto,
-- e mexer no recheio de um sabor não obriga a refazer os outros quatro.
-- ------------------------------------------------------------

insert into product_recipe_items (product_id, supply_id, quantity)
select destino.id, r.supply_id, r.quantity
  from (values
    ('Cento de Pastel de Frango', 'Cento de pastel de frango, fritos na hora.', 72.00::decimal, 100, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 11),
    ('75 Pastéis de Frango', '75 unidades de pastel de frango, fritos na hora.', 54.00::decimal, 75, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 12),
    ('Meio Cento de Pastel de Frango', 'Meio cento de pastel de frango, fritos na hora.', 36.00::decimal, 50, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 13),
    ('25 Pastéis de Frango', '25 unidades de pastel de frango, fritos na hora.', 18.00::decimal, 25, 'Pastel de frango', 'Pastel de frango com requeijão (unidade)', false, 14),
    ('Cento de Pastel de Carne', 'Cento de pastel de carne, fritos na hora.', 76.00::decimal, 100, 'Pastel de carne', 'Pastel de carne (unidade)', false, 15),
    ('75 Pastéis de Carne', '75 unidades de pastel de carne, fritos na hora.', 57.00::decimal, 75, 'Pastel de carne', 'Pastel de carne (unidade)', false, 16),
    ('Meio Cento de Pastel de Carne', 'Meio cento de pastel de carne, fritos na hora.', 38.00::decimal, 50, 'Pastel de carne', 'Pastel de carne (unidade)', false, 17),
    ('25 Pastéis de Carne', '25 unidades de pastel de carne, fritos na hora.', 19.00::decimal, 25, 'Pastel de carne', 'Pastel de carne (unidade)', false, 18),
    ('Cento de Pastel Sertanejo', 'Cento de pastel sertanejo, fritos na hora.', 76.00::decimal, 100, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', true, 19),
    ('75 Pastéis Sertanejo', '75 unidades de pastel sertanejo, fritos na hora.', 57.00::decimal, 75, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', false, 20),
    ('Meio Cento de Pastel Sertanejo', 'Meio cento de pastel sertanejo, fritos na hora.', 38.00::decimal, 50, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', false, 21),
    ('25 Pastéis Sertanejo', '25 unidades de pastel sertanejo, fritos na hora.', 19.00::decimal, 25, 'Pastel sertanejo', 'Pastel sertanejo (unidade)', false, 22),
    ('Cento de Pastel de Pizza', 'Cento de pastel de pizza, fritos na hora.', 74.00::decimal, 100, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 23),
    ('75 Pastéis de Pizza', '75 unidades de pastel de pizza, fritos na hora.', 56.00::decimal, 75, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 24),
    ('Meio Cento de Pastel de Pizza', 'Meio cento de pastel de pizza, fritos na hora.', 37.00::decimal, 50, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 25),
    ('25 Pastéis de Pizza', '25 unidades de pastel de pizza, fritos na hora.', 19.00::decimal, 25, 'Pastel de pizza', 'Pastel de pizza (unidade)', false, 26),
    ('Cento de Pastel de Queijo e Presunto', 'Cento de pastel de queijo e presunto, fritos na hora.', 75.00::decimal, 100, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', true, 27),
    ('75 Pastéis de Queijo e Presunto', '75 unidades de pastel de queijo e presunto, fritos na hora.', 56.00::decimal, 75, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', false, 28),
    ('Meio Cento de Pastel de Queijo e Presunto', 'Meio cento de pastel de queijo e presunto, fritos na hora.', 38.00::decimal, 50, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', false, 29),
    ('25 Pastéis de Queijo e Presunto', '25 unidades de pastel de queijo e presunto, fritos na hora.', 19.00::decimal, 25, 'Pastel de queijo e presunto', 'Pastel de queijo e presunto (unidade)', false, 30)
  ) as v(nome, descricao, preco, unidades, sabor, ficha, destaque, ordem)
  join products destino on destino.name = v.nome
  join products origem  on origem.name  = v.ficha
  join product_recipe_items r on r.product_id = origem.id
on conflict (product_id, supply_id) do update set quantity = excluded.quantity;

-- ------------------------------------------------------------
-- 4. Conferência: preço, custo e margem de cada um
-- ------------------------------------------------------------

with custo_insumo as (
  select id, pack_price / pack_quantity as unitario from supplies where kind = 'insumo'
),
recheio_n1 as (
  select s.id, sum(r.quantity * ci.unitario) / s.yield_quantity as unitario
    from supplies s
    join supply_recipe_items r on r.parent_id = s.id
    join custo_insumo ci on ci.id = r.child_id
   where s.kind = 'recheio'
   group by s.id, s.yield_quantity
),
custo_n1 as (select * from custo_insumo union all select * from recheio_n1),
recheio_n2 as (
  select s.id, sum(r.quantity * c.unitario) / s.yield_quantity as unitario
    from supplies s
    join supply_recipe_items r on r.parent_id = s.id
    join custo_n1 c on c.id = r.child_id
   where s.kind = 'recheio'
   group by s.id, s.yield_quantity
),
custo_final as (select * from custo_insumo union all select * from recheio_n2),
ficha as (
  select r.product_id, sum(r.quantity * c.unitario) as custo_un
    from product_recipe_items r
    join custo_final c on c.id = r.supply_id
   group by r.product_id
),
pa as (select * from pricing_params where id)
select p.name,
       p.pack_size as un,
       p.price as preco,
       round((f.custo_un + pa.fixed_cost_per_unit) * p.pack_size, 2) as custo,
       round(100 * (p.price - (f.custo_un + pa.fixed_cost_per_unit) * p.pack_size
                    - p.price * (pa.tax_percent + pa.fee_credit) / 100) / p.price, 1) as margem_credito,
       fl.name as sabor
  from products p
  join ficha f on f.product_id = p.id
  join flavors fl on fl.id = p.fixed_flavor_id
  cross join pa
 where p.active
 order by p.sort_order;
