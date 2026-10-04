-- Promo "cento + refri 1L" por R$ 33 no Pix (out/2026), num botão do painel (04/10/2026).
--
-- Cliente pede um cento pelo site e avisa que é da promo: a loja aperta o botão no pedido e
-- cada cento escolhido vira "Promo Cento + Refri 1L" (R$ 33, já preço de Pix, sem desconto
-- à vista em cima) com o refri de R$ 0 junto. Vale também para pedido já entregue, que é
-- quando a loja costuma perceber -- por isso não passa por editar_itens_pedido.
--
-- p_itens: [{ "item_id": uuid, "refri": "guarana" | "pepsi" | null }]

create or replace function aplicar_promo_refri(p_order_id uuid, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido orders%rowtype;
  v_promo products%rowtype;
  v_item jsonb;
  v_refri_id uuid;
  v_refri_nome text;
  v_subtotal numeric;
  v_cupom numeric;
  v_avista numeric;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'só o painel aplica a promoção';
  end if;

  select * into v_pedido from orders where id = p_order_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_pedido.status = 'cancelado' then raise exception 'pedido cancelado'; end if;

  select * into v_promo from products where name = 'Promo Cento + Refri 1L' limit 1;
  if not found then raise exception 'produto da promoção não existe'; end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    update order_items
       set product_id = v_promo.id, product_name = v_promo.name,
           unit_price = v_promo.price, total_price = v_promo.price * quantity
     where id = (v_item->>'item_id')::uuid and order_id = p_order_id
       and product_name <> v_promo.name;
    if not found then continue; end if;

    v_refri_id := case v_item->>'refri'
      when 'guarana' then (select id from products where name = 'Guaraná Antarctica 1 Litro' limit 1)
      when 'pepsi' then (select id from products where name = 'Pepsi 1 Litro' limit 1)
    end;
    v_refri_nome := case v_item->>'refri'
      when 'guarana' then 'Guaraná Antarctica 1 Litro (promo)'
      when 'pepsi' then 'Pepsi 1 Litro (promo)'
      else 'Refri 1L (promo)'
    end;
    insert into order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    select p_order_id, v_refri_id, v_refri_nome, quantity, 0, 0
      from order_items where id = (v_item->>'item_id')::uuid;
  end loop;

  -- mesma conta de editar_itens_pedido: cupom fica, desconto à vista é refeito
  select coalesce(sum(total_price), 0) into v_subtotal from order_items where order_id = p_order_id;
  v_cupom := coalesce(v_pedido.discount, 0) - coalesce(v_pedido.discount_avista, 0);
  v_avista := case when coalesce(v_pedido.discount_avista, 0) > 0
    then editar_itens_pedido_desconto_avista(p_order_id, v_subtotal, v_cupom) else 0 end;

  update orders
     set subtotal = v_subtotal,
         discount = v_cupom + v_avista,
         discount_avista = v_avista,
         total = v_subtotal + coalesce(delivery_fee, 0) - v_cupom - v_avista,
         updated_at = now()
   where id = p_order_id
  returning * into v_pedido;

  return to_jsonb(v_pedido);
end;
$$;

revoke execute on function aplicar_promo_refri(uuid, jsonb) from public, anon;
grant execute on function aplicar_promo_refri(uuid, jsonb) to authenticated;
