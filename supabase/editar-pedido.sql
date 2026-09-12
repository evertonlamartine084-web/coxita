-- Edição do pedido pela LOJA.
--
-- Quem adiciona ou tira item é o estabelecimento, falando com o cliente — foi a decisão do dono,
-- e ela some com os casos difíceis: cliente e loja mexendo ao mesmo tempo, e cliente que edita
-- pra mais e abandona sem pagar a diferença.
--
-- A troca de itens e o recálculo acontecem numa transação só. Se fosse em chamadas separadas,
-- uma falha no meio deixaria o pedido com itens novos e total velho — a cozinha produzindo uma
-- coisa e a conta cobrando outra.

create or replace function editar_itens_pedido(
  p_order_id uuid,
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido orders%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_sabor jsonb;
  v_subtotal numeric := 0;
  v_total numeric;
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

  -- entrega e desconto não mudam aqui: quem edita item não está renegociando frete nem cupom
  v_total := v_subtotal + coalesce(v_pedido.delivery_fee, 0) - coalesce(v_pedido.discount, 0);

  update orders
     set subtotal = v_subtotal,
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
$$;

-- só o painel edita; o site público não tem essa porta
revoke all on function editar_itens_pedido(uuid, jsonb) from public, anon;
grant execute on function editar_itens_pedido(uuid, jsonb) to authenticated;
