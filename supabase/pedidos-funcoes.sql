-- Fecha a leitura pública de pedidos.
--
-- Como estava: `orders_public_read using (true)` deixava qualquer visitante com a chave anon
-- (que vai no bundle do site, é pública por definição) baixar a lista inteira de pedidos com
-- nome, telefone e endereço de todos os clientes. Pior: `order_number` é sequencial, então
-- bastava contar 1, 2, 3… para percorrer a base.
--
-- Como fica: ninguém lê a tabela direto. Toda leitura passa por função que exige provar posse
-- do pedido — o telefone de quem pediu. Criar pedido também vira função, porque insert com
-- retorno precisa de permissão de leitura (e de quebra a criação passa a ser atômica: hoje, se
-- os itens falham depois do pedido gravado, sobra um pedido órfão sem itens).

-- PARTE A: só CRIA as funções. Nada é removido — o site atual continua funcionando.

-- ─── criar pedido ───────────────────────────────────────────────────────────
create or replace function criar_pedido(p_pedido jsonb, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_sabor jsonb;
begin
  insert into orders (
    customer_name, customer_phone, delivery_type, address_cep, address, neighborhood,
    address_number, address_complement, address_reference, notes, payment_method,
    change_for, scheduled_for, subtotal, delivery_fee, discount, coupon_code, total
  )
  values (
    p_pedido->>'customer_name', p_pedido->>'customer_phone', p_pedido->>'delivery_type',
    p_pedido->>'address_cep', p_pedido->>'address', p_pedido->>'neighborhood',
    p_pedido->>'address_number', p_pedido->>'address_complement', p_pedido->>'address_reference',
    p_pedido->>'notes', p_pedido->>'payment_method',
    (p_pedido->>'change_for')::numeric, (p_pedido->>'scheduled_for')::timestamptz,
    (p_pedido->>'subtotal')::numeric, coalesce((p_pedido->>'delivery_fee')::numeric, 0),
    coalesce((p_pedido->>'discount')::numeric, 0), p_pedido->>'coupon_code',
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
$$;

grant execute on function criar_pedido(jsonb, jsonb) to anon, authenticated;

-- ─── consultar UM pedido: exige número + telefone ───────────────────────────
--
-- Compara só os dígitos: o cliente digita (11) 99999-8888 e o banco guardou 11999998888.
create or replace function consultar_pedido(p_numero int, p_telefone text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pedido', to_jsonb(o),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item', to_jsonb(oi),
        'flavors', coalesce((select jsonb_agg(to_jsonb(f)) from order_item_flavors f where f.order_item_id = oi.id), '[]'::jsonb)
      ))
      from order_items oi where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  from orders o
  where o.order_number = p_numero
    and regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g')
        = regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')
    and regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') <> '';
$$;

grant execute on function consultar_pedido(int, text) to anon, authenticated;

-- ─── meus pedidos: pelo telefone ────────────────────────────────────────────
create or replace function meus_pedidos(p_telefone text)
returns setof jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(o)
  from orders o
  where regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g')
        = regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')
    and regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') <> ''
  order by o.created_at desc
  limit 50;
$$;

grant execute on function meus_pedidos(text) to anon, authenticated;
