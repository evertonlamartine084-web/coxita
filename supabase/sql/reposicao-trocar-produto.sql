-- Reposição com outro produto (29/10/2026).
--
-- O #218 era cento congelado e saiu frito: a reposição tinha de ser o congelado, com os mesmos
-- sabores. Cada linha de p_itens pode trazer product_id: o item sai como esse produto, desde que
-- seja do mesmo grupo de sabores do original (salgado com salgado, doce com doce), para os
-- sabores copiados continuarem valendo. reposicao_valor passa a usar o preço do que foi mandado.

create or replace function criar_reposicao(p_original uuid, p_motivo text, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v orders%rowtype;
  v_novo orders%rowtype;
  v_linha jsonb;
  v_item order_items%rowtype;
  v_qtd int;
  v_item_id uuid;
  v_valor numeric := 0;
  v_prod_id uuid;
  v_prod_nome text;
  v_preco numeric;
  v_grupo_original text;
  v_grupo_novo text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'não autorizado' using errcode = 'insufficient_privilege';
  end if;
  select * into v from orders where id = p_original;
  if not found then raise exception 'Pedido original não encontrado.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Diga o motivo da reposição.'; end if;
  if jsonb_array_length(coalesce(p_itens, '[]')) = 0 then raise exception 'Escolha ao menos um item para repor.'; end if;

  insert into orders (customer_name, customer_phone, delivery_type, address, address_number, address_complement,
    neighborhood, address_reference, address_cep, entrega_lat, entrega_lng, notes, payment_method, payment_status,
    paid_at, status, canal, subtotal, delivery_fee, discount, discount_avista, total, reposicao_de, reposicao_motivo)
  values (v.customer_name, v.customer_phone, v.delivery_type, v.address, v.address_number, v.address_complement,
    v.neighborhood, v.address_reference, v.address_cep, v.entrega_lat, v.entrega_lng,
    'REPOSIÇÃO do pedido #' || v.order_number || ' (sem cobrança): ' || trim(p_motivo),
    v.payment_method, 'pago', now(), 'pendente', v.canal, 0, 0, 0, 0, 0, v.id, trim(p_motivo))
  returning * into v_novo;

  for v_linha in select * from jsonb_array_elements(p_itens)
  loop
    select * into v_item from order_items where id = (v_linha->>'item_id')::uuid and order_id = v.id;
    if not found then raise exception 'Item não pertence ao pedido #%.', v.order_number; end if;
    v_qtd := greatest(1, least(coalesce((v_linha->>'quantity')::int, v_item.quantity), v_item.quantity));

    v_prod_id := v_item.product_id;
    v_prod_nome := v_item.product_name;
    v_preco := v_item.unit_price;
    if nullif(v_linha->>'product_id', '') is not null and (v_linha->>'product_id')::uuid is distinct from v_item.product_id then
      select flavor_group into v_grupo_original from products where id = v_item.product_id;
      select id, name, price, flavor_group into v_prod_id, v_prod_nome, v_preco, v_grupo_novo
        from products where id = (v_linha->>'product_id')::uuid;
      if v_prod_id is null then raise exception 'Produto da reposição não encontrado.'; end if;
      if v_grupo_novo is distinct from v_grupo_original then
        raise exception '% não leva os mesmos sabores de %.', v_prod_nome, v_item.product_name;
      end if;
    end if;

    v_valor := v_valor + v_preco * v_qtd;
    insert into order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    values (v_novo.id, v_prod_id, v_prod_nome, v_qtd, 0, 0)
    returning id into v_item_id;
    insert into order_item_flavors (order_item_id, flavor_id, flavor_name, quantity)
    select v_item_id, f.flavor_id, f.flavor_name, f.quantity
      from order_item_flavors f where f.order_item_id = v_item.id;
  end loop;

  update orders set reposicao_valor = round(v_valor, 2) where id = v_novo.id returning * into v_novo;
  update orders set notes = coalesce(notes || ' · ', '') || 'Teve reposição: #' || v_novo.order_number || ' (' || trim(p_motivo) || ')'
   where id = v.id;
  return to_jsonb(v_novo);
end;
$$;

revoke all on function criar_reposicao(uuid, text, jsonb) from public, anon;
grant execute on function criar_reposicao(uuid, text, jsonb) to authenticated;
