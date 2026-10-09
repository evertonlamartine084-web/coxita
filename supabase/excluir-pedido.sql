-- Excluir pedido cancelado pelo painel (08/10/2026).
--
-- Antes, pedido de teste ou duplicado só saía da lista com SQL. Só pedido CANCELADO pode ser
-- excluído: cancelar é o passo que devolve o estoque e estorna o que tiver de estorno, e
-- excluir é só tirar da lista o que já não vale.
--
-- Fica bloqueado o que deixaria rastro solto:
--   - nota fiscal emitida ou em emissão: a nota existe na Sefaz e precisa do pedido;
--   - pagamento online confirmado (Pix do site, cartão): o dinheiro entrou pela Cielo e a
--     conciliação precisa do pedido.
--
-- O estoque normalmente já voltou no cancelamento (trg do estoque.sql). Se ainda sobrar saldo
-- desse pedido -- pedido cancelado antes de existir o controle de estoque, por exemplo --,
-- a devolução é feita aqui, antes de apagar. Os movimentos ficam no histórico, sem o pedido
-- (stock_moves.order_id vira null pela FK).

create or replace function excluir_pedido_cancelado(p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v orders%rowtype;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'não autorizado' using errcode = 'insufficient_privilege';
  end if;

  select * into v from orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if v.status <> 'cancelado' then
    raise exception 'Só pedido cancelado pode ser excluído. Cancele o pedido #% primeiro.', v.order_number;
  end if;
  if v.bling_nfe_status in ('emitida', 'pendente') or v.bling_nfe_numero is not null then
    raise exception 'O pedido #% tem nota fiscal e não pode ser excluído.', v.order_number;
  end if;
  if v.payment_status = 'pago' and v.payment_method in ('pix_online', 'cartao') then
    raise exception 'O pedido #% foi pago pelo site e não pode ser excluído.', v.order_number;
  end if;

  insert into stock_moves (flavor_id, delta, motivo, order_id, observacao)
  select m.flavor_id, -sum(m.delta), 'cancelamento', v.id, 'devolução ao excluir o pedido'
    from stock_moves m
   where m.order_id = v.id
   group by m.flavor_id
  having sum(m.delta) <> 0;

  delete from orders where id = v.id;
  return v.order_number;
end;
$$;

revoke all on function excluir_pedido_cancelado(uuid) from public, anon;
grant execute on function excluir_pedido_cancelado(uuid) to authenticated;
