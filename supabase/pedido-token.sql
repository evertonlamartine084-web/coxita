-- Acesso ao pedido por código secreto no link, em vez de por número sequencial.
--
-- O problema nunca foi "quem é essa pessoa", foi que `order_number` é 1, 2, 3… — dava pra
-- percorrer a base inteira contando. Pedir o telefone resolvia, mas cobrava de TODO cliente
-- (inclusive o legítimo, no momento em que ele só quer ver se a comida saiu) por causa de um
-- defeito do endereço.
--
-- Com um código aleatório de 64 bits no link, adivinhar deixa de ser viável e o cliente não
-- digita nada: ele clica no link que já tem. O #137 continua existindo para a cozinha falar
-- "pedido 137" — ele só não abre mais nada sozinho.

alter table orders add column if not exists public_token text;

-- token para os pedidos que já existem
update orders
set public_token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
where public_token is null;

-- daqui pra frente todo pedido nasce com o dele
alter table orders alter column public_token
  set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);

alter table orders alter column public_token set not null;

create unique index if not exists idx_orders_public_token on orders (public_token);

-- ─── abrir o pedido pelo código do link ─────────────────────────────────────
create or replace function consultar_pedido_token(p_token text)
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
  where o.public_token = p_token
    and length(coalesce(p_token, '')) >= 16;  -- corta tentativa com token vazio ou curto
$$;

grant execute on function consultar_pedido_token(text) to anon, authenticated;

-- criar_pedido passa a devolver o token junto (o front precisa dele para montar o link)
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
