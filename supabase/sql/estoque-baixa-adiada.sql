-- Baixa adiada: pedido agendado para longe pode ficar sem baixar o estoque ate comecar a ser feito.
--
-- O estoque de um pedido e a soma dos movimentos 'pedido' dele (ver estoque-edicao-pedido.sql e
-- devolver_estoque_do_pedido). Adiar = gravar um movimento 'pedido' positivo que zera essa soma.
-- Cancelar continua certo (devolve a soma, que e zero) e editar tambem (devolve e baixa de novo,
-- a soma segue zero).
--
-- Este gatilho faz a baixa quando o pedido sai de 'pendente' (em preparo, saiu, pronto, entregue)
-- com sabores e soma zero. Pedido normal ja baixou (soma negativa) e passa direto.
-- Primeiro uso: pedido #167 (Beatriz, 08/11/2026), a pedido do dono em 14/10/2026.

create or replace function baixar_estoque_adiado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if old.status is distinct from 'pendente' or new.status in ('pendente', 'cancelado') then
    return new;
  end if;
  if coalesce((select sum(delta) from stock_moves where order_id = new.id and motivo = 'pedido'), 0) <> 0 then
    return new;
  end if;
  for r in
    select oif.flavor_id, sum(oif.quantity * coalesce(oi.quantity, 1))::int as total
      from order_item_flavors oif
      join order_items oi on oi.id = oif.order_item_id
     where oi.order_id = new.id and oif.flavor_id is not null
     group by oif.flavor_id
  loop
    perform registrar_movimento_estoque(r.flavor_id, -r.total, 'pedido', new.id,
      'baixa adiada: pedido começou a ser feito');
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_baixar_estoque_adiado on orders;
create trigger trg_baixar_estoque_adiado
  after update of status on orders
  for each row execute function baixar_estoque_adiado();
