-- criar_pedido passa a gravar o CPF opcional (para a nota fiscal). Sem isso o campo do checkout
-- seria preenchido pelo cliente e descartado em silêncio na hora de inserir.
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
    customer_name, customer_phone, customer_cpf, delivery_type, address_cep, address, neighborhood,
    address_number, address_complement, address_reference, notes, payment_method,
    change_for, scheduled_for, subtotal, delivery_fee, discount, coupon_code, total
  )
  values (
    p_pedido->>'customer_name', p_pedido->>'customer_phone', nullif(p_pedido->>'customer_cpf',''),
    p_pedido->>'delivery_type',
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
