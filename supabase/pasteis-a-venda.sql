-- ============================================================
-- COXELLI - Pastéis à venda em pacotes + desconto à vista
--
-- Rode depois de margem-produtos.sql. É idempotente.
--
-- Duas mudanças de loja:
--
-- 1. Pastel deixa de ser só recheio de pacote de salgado e ganha pacote
--    próprio (25, 50, 75, 100), como os salgados. O preço sai da ficha:
--    R$ 0,76 a unidade no crédito, arredondado de R$ 1 em R$ 1 no pacote.
--
--    O preço do pacote é fixo e o cliente escolhe os sabores, então a ficha
--    do pacote é a do pastel MAIS CARO (sertanejo, R$ 0,5023/un). Precificar
--    pelo mais barato daria prejuízo em quem enche o cento de sertanejo.
--
-- 2. Desconto à vista: pix e dinheiro não pagam taxa de maquininha, e o
--    desconto devolve ao cliente exatamente essa taxa (3,5%). A margem fica
--    igual nas duas pontas -- quem paga o desconto é a Cielo, não a cozinha.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cada pacote com seu grupo de sabores
--
-- Sem isto o cliente montaria um cento de pastéis com coxinha dentro: o
-- seletor de sabores lista todos os sabores ativos, e ele não tem como
-- adivinhar que este pacote é de pastel.
-- ------------------------------------------------------------

alter table products add column if not exists flavor_group text;

comment on column products.flavor_group is
  'Grupo de flavors.group_slug que este pacote aceita. Nulo = aceita todos.';

update products set flavor_group = 'salgados'
 where pack_size is not null and flavor_group is null
   and name in ('Cento de Salgados', '75 Salgados', 'Meio Cento de Salgados', '25 Salgados');

-- ------------------------------------------------------------
-- 2. Desconto à vista
--
-- Vive em `settings` (leitura pública) porque o carrinho e o checkout
-- precisam mostrar o valor antes de existir pedido. Não é dado sensível: o
-- cliente vai ver o desconto na tela de qualquer forma.
-- ------------------------------------------------------------

insert into settings (key, value) values
  ('desconto_avista_percent', '3.5')
on conflict (key) do nothing;

-- Quanto do desconto do pedido veio do pix/dinheiro. `discount` continua
-- sendo o total de descontos (cupom + à vista), para que
-- total = subtotal - discount + delivery_fee siga valendo; esta coluna existe
-- para o histórico saber de onde o desconto veio.
alter table orders add column if not exists discount_avista decimal(10,2) default 0;

comment on column orders.discount_avista is
  'Parcela de `discount` que veio do desconto à vista (pix/dinheiro).';

-- ------------------------------------------------------------
-- 3. Categoria e pacotes de pastel
-- ------------------------------------------------------------

insert into categories (name, slug, sort_order, active) values
  ('Centos de Pastéis', 'centos-pasteis', 2, true)
on conflict (slug) do update set
  name       = excluded.name,
  sort_order = excluded.sort_order,
  active     = excluded.active;

-- Bebidas vão para o fim da lista, atrás dos dois centos.
update categories set sort_order = 3 where slug = 'bebidas';

insert into products (category_id, name, description, price, pack_size, flavor_group, recipe_yield, target_margin, featured, active, sort_order)
select c.id, p.name, p.description, p.price, p.pack_size, 'pasteis', 1, 30.00, p.featured, true, p.sort_order
  from (values
    ('Cento de Pastéis',      'Monte seu cento: 100 pastéis, até 4 sabores (25 em 25).', 76.00::decimal, 100, true,  11),
    ('75 Pastéis',            'Monte seu pacote: 75 pastéis, até 3 sabores.',             57.00::decimal,  75, false, 12),
    ('Meio Cento de Pastéis', 'Monte seu meio cento: 50 pastéis, até 2 sabores.',         38.00::decimal,  50, true,  13),
    ('25 Pastéis',            'Para as reuniões menores: 25 pastéis de um sabor.',        19.00::decimal,  25, false, 14)
  ) as p(name, description, price, pack_size, featured, sort_order)
  cross join (select id from categories where slug = 'centos-pasteis') c
 where not exists (select 1 from products x where x.name = p.name);

-- Garante os campos também em quem já existia de uma rodada anterior.
update products set flavor_group = 'pasteis', recipe_yield = 1, target_margin = 30.00
 where name in ('Cento de Pastéis', '75 Pastéis', 'Meio Cento de Pastéis', '25 Pastéis');

-- ------------------------------------------------------------
-- 4. Ficha dos pacotes: o pastel mais caro
-- ------------------------------------------------------------

insert into product_recipe_items (product_id, supply_id, quantity)
select prod.id, ins.id, v.quantidade
  from (values
    ('Cento de Pastéis',      'Carne de sol',    0.002000),
    ('Cento de Pastéis',      'Queijo coalho',   0.002000),
    ('Cento de Pastéis',      'Massa de pastel', 0.012000),

    ('75 Pastéis',            'Carne de sol',    0.002000),
    ('75 Pastéis',            'Queijo coalho',   0.002000),
    ('75 Pastéis',            'Massa de pastel', 0.012000),

    ('Meio Cento de Pastéis', 'Carne de sol',    0.002000),
    ('Meio Cento de Pastéis', 'Queijo coalho',   0.002000),
    ('Meio Cento de Pastéis', 'Massa de pastel', 0.012000),

    ('25 Pastéis',            'Carne de sol',    0.002000),
    ('25 Pastéis',            'Queijo coalho',   0.002000),
    ('25 Pastéis',            'Massa de pastel', 0.012000)
  ) as v(produto, insumo, quantidade)
  join products prod on prod.name = v.produto
  join supplies ins  on ins.name  = v.insumo
on conflict (product_id, supply_id) do update set quantity = excluded.quantity;

-- ------------------------------------------------------------
-- 5. Conferência: preço, custo e margem dos pacotes novos
-- ------------------------------------------------------------

with custo_insumo as (
  select id, pack_price / pack_quantity as unitario
    from supplies where kind = 'insumo'
),
ficha as (
  select r.product_id, sum(r.quantity * ci.unitario) as custo_un
    from product_recipe_items r
    join custo_insumo ci on ci.id = r.supply_id
   group by r.product_id
),
params as (select * from pricing_params where id)
select p.name,
       p.pack_size as unidades,
       p.price as preco,
       round((f.custo_un + pa.fixed_cost_per_unit) * p.pack_size, 2) as custo,
       round(100 * (p.price - (f.custo_un + pa.fixed_cost_per_unit) * p.pack_size
                    - p.price * (pa.tax_percent + pa.fee_credit) / 100) / p.price, 2) as margem_credito,
       round(100 * (p.price * (1 - (select value::decimal from settings where key = 'desconto_avista_percent') / 100)
                    - (f.custo_un + pa.fixed_cost_per_unit) * p.pack_size
                    - p.price * (1 - (select value::decimal from settings where key = 'desconto_avista_percent') / 100) * pa.tax_percent / 100)
             / (p.price * (1 - (select value::decimal from settings where key = 'desconto_avista_percent') / 100)), 2) as margem_pix_com_desconto
  from products p
  join ficha f on f.product_id = p.id
  cross join params pa
 where p.flavor_group = 'pasteis'
 order by p.pack_size;

-- ------------------------------------------------------------
-- 6. criar_pedido passa a gravar o desconto à vista
--
-- A função insere coluna por coluna (e não `insert ... select jsonb_populate_record`),
-- então coluna nova só chega ao banco se for citada aqui. Mesmo corpo de
-- antes, com `discount_avista` a mais.
-- ------------------------------------------------------------

create or replace function public.criar_pedido(p_pedido jsonb, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order orders%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_sabor jsonb;
begin
  insert into orders (
    customer_name, customer_phone, customer_cpf, delivery_type, address_cep, address, neighborhood,
    address_number, address_complement, address_reference, notes, payment_method,
    change_for, scheduled_for, subtotal, delivery_fee, discount, discount_avista, coupon_code, total
  )
  values (
    p_pedido->>'customer_name', p_pedido->>'customer_phone', nullif(p_pedido->>'customer_cpf',''),
    p_pedido->>'delivery_type',
    p_pedido->>'address_cep', p_pedido->>'address', p_pedido->>'neighborhood',
    p_pedido->>'address_number', p_pedido->>'address_complement', p_pedido->>'address_reference',
    p_pedido->>'notes', p_pedido->>'payment_method',
    (p_pedido->>'change_for')::numeric, (p_pedido->>'scheduled_for')::timestamptz,
    (p_pedido->>'subtotal')::numeric, coalesce((p_pedido->>'delivery_fee')::numeric, 0),
    coalesce((p_pedido->>'discount')::numeric, 0),
    coalesce((p_pedido->>'discount_avista')::numeric, 0),
    p_pedido->>'coupon_code',
    (p_pedido->>'total')::numeric
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    values (
      v_order.id, (v_item->>'product_id')::uuid, v_item->>'product_name',
      (v_item->>'quantity')::int, (v_item->>'unit_price')::numeric, (v_item->>'total_price')::numeric
    )
    returning id into v_item_id;

    for v_sabor in select * from jsonb_array_elements(coalesce(v_item->'flavors', '[]'::jsonb))
    loop
      insert into order_item_flavors (order_item_id, flavor_id, flavor_name, quantity)
      values (v_item_id, (v_sabor->>'flavor_id')::uuid, v_sabor->>'flavor_name', (v_sabor->>'quantity')::int);
    end loop;
  end loop;

  return to_jsonb(v_order);
end;
$function$;

-- ------------------------------------------------------------
-- 7. editar_itens_pedido reajusta o desconto à vista
--
-- O desconto à vista é um percentual, não um valor combinado: se a cozinha
-- tira um item do pedido, os 3,5% têm que cair junto. Antes desta versão o
-- desconto ficava congelado em reais, e tirar metade do pedido deixava o
-- cliente com um desconto de 7% sobre o que sobrou.
--
-- O cupom continua congelado, e de propósito: cupom é acordo fechado com o
-- cliente, não uma regra de preço.
--
-- O reajuste só acontece em pedido que JÁ tinha desconto à vista. Pedido
-- antigo, de antes desta regra existir, não ganha desconto retroativo por ter
-- passado por uma edição.
-- ------------------------------------------------------------

create or replace function public.editar_itens_pedido(p_order_id uuid, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pedido orders%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_sabor jsonb;
  v_subtotal numeric := 0;
  v_total numeric;
  v_desconto_cupom numeric;
  v_desconto_avista numeric;
  v_desconto numeric;
  v_percentual numeric;
begin
  select * into v_pedido from orders where id = p_order_id for update;
  if not found then
    raise exception 'pedido não encontrado';
  end if;

  -- Mesma regra do cancelamento: comida a caminho não se mexe. A cozinha já despachou,
  -- e mudar o pedido agora só criaria divergência entre o que foi entregue e o que consta.
  if v_pedido.status in ('saiu_entrega', 'entregue', 'cancelado') then
    raise exception 'Pedido % está como % e não pode mais ser editado.',
      v_pedido.order_number, v_pedido.status
      using errcode = 'check_violation';
  end if;

  -- troca a lista inteira: mais simples e previsível que casar item a item
  delete from order_item_flavors
   where order_item_id in (select id from order_items where order_id = p_order_id);
  delete from order_items where order_id = p_order_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    values (
      p_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric,
      (v_item->>'quantity')::int * (v_item->>'unit_price')::numeric
    )
    returning id into v_item_id;

    v_subtotal := v_subtotal + ((v_item->>'quantity')::int * (v_item->>'unit_price')::numeric);

    for v_sabor in select * from jsonb_array_elements(coalesce(v_item->'flavors', '[]'::jsonb))
    loop
      insert into order_item_flavors (order_item_id, flavor_id, flavor_name, quantity)
      values (v_item_id, (v_sabor->>'flavor_id')::uuid, v_sabor->>'flavor_name', (v_sabor->>'quantity')::int);
    end loop;
  end loop;

  -- Entrega e cupom não mudam aqui: quem edita item não está renegociando
  -- frete nem cupom. O desconto à vista, sim -- ele é percentual.
  v_desconto_cupom := coalesce(v_pedido.discount, 0) - coalesce(v_pedido.discount_avista, 0);
  v_desconto_avista := coalesce(v_pedido.discount_avista, 0);

  if v_desconto_avista > 0 then
    select coalesce(value::numeric, 0) into v_percentual
      from settings where key = 'desconto_avista_percent';
    v_desconto_avista := round(
      greatest(v_subtotal - v_desconto_cupom, 0) * coalesce(v_percentual, 0) / 100, 2);
  end if;

  v_desconto := v_desconto_cupom + v_desconto_avista;
  v_total := v_subtotal + coalesce(v_pedido.delivery_fee, 0) - v_desconto;

  update orders
     set subtotal = v_subtotal,
         discount = v_desconto,
         discount_avista = v_desconto_avista,
         total = v_total,
         updated_at = now()
   where id = p_order_id
  returning * into v_pedido;

  return jsonb_build_object(
    'pedido', to_jsonb(v_pedido),
    'total_anterior', null,
    'diferenca', null
  );
end;
$function$;
