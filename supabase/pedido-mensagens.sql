-- Chat do pedido pelo código do link, para o cliente.
--
-- O admin continua falando com a tabela direto (policies *_admin_all, exigem login). Aqui é só
-- o lado do cliente: ele prova posse do pedido apresentando o código, e nunca alcança conversa
-- de outro pedido.

create or replace function mensagens_pedido(p_token text)
returns setof jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(m)
  from order_messages m
  join orders o on o.id = m.order_id
  where o.public_token = p_token
    and length(coalesce(p_token, '')) >= 16
  order by m.created_at asc;
$$;

grant execute on function mensagens_pedido(text) to anon, authenticated;

-- O remetente é fixado em 'customer' aqui dentro: se viesse por parâmetro, daria pra forjar
-- mensagem "da loja" na conversa e enganar o cliente.
create or replace function enviar_mensagem_pedido(p_token text, p_mensagem text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_msg order_messages%rowtype;
begin
  select o.id into v_order_id
  from orders o
  where o.public_token = p_token and length(coalesce(p_token, '')) >= 16;

  if v_order_id is null then
    raise exception 'pedido não encontrado';
  end if;

  if coalesce(trim(p_mensagem), '') = '' then
    raise exception 'mensagem vazia';
  end if;

  insert into order_messages (order_id, sender_type, message)
  values (v_order_id, 'customer', left(trim(p_mensagem), 1000))
  returning * into v_msg;

  return to_jsonb(v_msg);
end;
$$;

grant execute on function enviar_mensagem_pedido(text, text) to anon, authenticated;

-- marca como lidas as mensagens que a LOJA mandou (o cliente acabou de vê-las)
create or replace function marcar_lidas_pedido(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update order_messages m
  set read_at = now()
  from orders o
  where o.id = m.order_id
    and o.public_token = p_token
    and length(coalesce(p_token, '')) >= 16
    and m.sender_type = 'store'
    and m.read_at is null;
$$;

grant execute on function marcar_lidas_pedido(text) to anon, authenticated;
