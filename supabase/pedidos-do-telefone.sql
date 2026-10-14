-- Pedidos de um cliente pelo telefone, para a ficha do cliente na aba Atendimento (14/10/2026).
-- Compara os 8 últimos dígitos: pega o mesmo celular com e sem o 9 e com ou sem o 55.
-- security invoker: vale o RLS de orders (só o painel logado lê).
create or replace function pedidos_do_telefone(p_telefone text)
returns setof jsonb
language sql stable security invoker set search_path = public as $$
  select to_jsonb(o) || jsonb_build_object('itens', coalesce((
           select jsonb_agg(jsonb_build_object(
             'product_id', oi.product_id, 'product_name', oi.product_name, 'quantity', oi.quantity,
             'flavors', coalesce((select jsonb_agg(jsonb_build_object('flavor_id', f.flavor_id, 'flavor_name', f.flavor_name, 'quantity', f.quantity))
                                   from order_item_flavors f where f.order_item_id = oi.id), '[]'::jsonb)))
             from order_items oi where oi.order_id = o.id), '[]'::jsonb))
    from orders o
   where length(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) >= 8
     and right(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), 8)
       = right(regexp_replace(p_telefone, '\D', '', 'g'), 8)
   order by o.created_at desc
   limit 30
$$;
grant execute on function pedidos_do_telefone(text) to authenticated;
