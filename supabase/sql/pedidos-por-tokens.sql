-- Vários pedidos de uma vez, pelos códigos que o aparelho guardou.
--
-- Sustenta "Meus pedidos", a tela de confirmação e o aviso de pedido em aberto no checkout —
-- as três quebraram quando a leitura pública de `orders` foi fechada, porque consultavam a
-- tabela direto por `order_number`.
--
-- Só devolve o que o chamador já provou possuir: cada código é um segredo de 64 bits que só
-- está no aparelho de quem fez o pedido. Sem código na lista, não vem nada.
create or replace function pedidos_por_tokens(p_tokens text[])
returns setof jsonb
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
  where o.public_token = any(p_tokens)
    and coalesce(array_length(p_tokens, 1), 0) > 0
  order by o.created_at desc
  limit 50;
$$;

grant execute on function pedidos_por_tokens(text[]) to anon, authenticated;
