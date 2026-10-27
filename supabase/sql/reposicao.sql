-- Reposição (09/10/2026): pedido refeito sem cobrança porque o original saiu com problema.
--
-- O botão "Fazer reposição" no pedido chama criar_reposicao: um pedido novo de R$ 0,00 com os
-- mesmos dados do cliente, os itens escolhidos (com os sabores) e o motivo. Ele vai para a
-- cozinha como qualquer pedido (comanda, grupo do Zap, baixa no estoque) e não entra no
-- faturamento nem na nota (sem item com valor). reposicao_valor guarda quanto aqueles itens
-- valiam no pedido original: é o que o Dashboard mostra em "Perdas e reposições".

alter table orders add column if not exists reposicao_de uuid references orders(id) on delete set null;
alter table orders add column if not exists reposicao_motivo text;
alter table orders add column if not exists reposicao_valor numeric(10,2);

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
    v_valor := v_valor + v_item.unit_price * v_qtd;

    insert into order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    values (v_novo.id, v_item.product_id, v_item.product_name, v_qtd, 0, 0)
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

-- a primeira reposição, lançada à mão antes do botão existir
update orders r set reposicao_de = o.id, reposicao_motivo = 'Muito óleo nos salgados',
       reposicao_valor = 216.00  -- 4 centos de salgados (R$ 32) + 1 cento de Nutella (R$ 88), preço do site
  from orders o
 where r.order_number = 160 and o.order_number = 156 and r.reposicao_de is null;
