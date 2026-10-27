-- Editar os itens de um pedido não pode baixar o estoque de novo.
--
-- O estoque baixa quando um sabor entra no pedido (trg_baixar_estoque, no INSERT de
-- order_item_flavors). A edição (editar_itens_pedido) troca a lista inteira: apaga os sabores e
-- grava de novo. Sem devolver os apagados, cada edição baixava outra vez o que o pedido já
-- tinha — foi o que aconteceu com o pedido #86 em 24/09/2026.
--
-- A devolução é gravada com o mesmo motivo 'pedido' (delta positivo). Assim a soma dos
-- movimentos 'pedido' de um pedido continua sendo o que ele leva, que é a conta que
-- devolver_estoque_do_pedido faz quando ele é cancelado.

create or replace function devolver_estoque_do_sabor_removido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pacotes int;
  v_order uuid;
  v_status text;
begin
  select oi.quantity, oi.order_id into v_pacotes, v_order
    from order_items oi where oi.id = old.order_item_id;
  select status into v_status from orders where id = v_order;

  -- Pedido apagado (cascata) ou já cancelado: o cancelamento já devolveu, ou não há o que
  -- devolver. Só a edição de pedido vivo passa daqui.
  if v_status is null or v_status = 'cancelado' then
    return old;
  end if;

  perform registrar_movimento_estoque(
    old.flavor_id, old.quantity * coalesce(v_pacotes, 1), 'pedido', v_order,
    'edição do pedido: sabor regravado');
  return old;
end;
$$;

drop trigger if exists trg_devolver_estoque_sabor_removido on order_item_flavors;
create trigger trg_devolver_estoque_sabor_removido
  before delete on order_item_flavors
  for each row execute function devolver_estoque_do_sabor_removido();
