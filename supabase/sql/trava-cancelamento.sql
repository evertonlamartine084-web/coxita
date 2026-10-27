-- Trava contra estorno de pedido já entregue.
--
-- Regra do dono: depois que a comida saiu para entrega, o pedido NÃO pode mais virar cancelado.
-- Senão alguém devolve o dinheiro de um pedido que o cliente já recebeu e comeu — e no caso do
-- Pix o estorno é automático, sem chance de rever.
--
-- Vive no banco, e não na tela, de propósito: a tela é uma sugestão, o trigger é a garantia.
-- Vale para o painel, para o site, para um script futuro e para qualquer um com a chave.

create or replace function bloquear_cancelamento_apos_entrega()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelado' and old.status in ('saiu_entrega', 'entregue') then
    raise exception
      'Pedido % já saiu para entrega (status %) e não pode ser cancelado. Se for necessário devolver o dinheiro, faça o estorno explicitamente.',
      old.order_number, old.status
      using errcode = 'check_violation';
  end if;

  -- Marcar como pago um pedido cancelado embaralha a conciliação; é sempre erro de fluxo.
  if new.payment_status = 'pago' and old.status = 'cancelado' and new.status = 'cancelado' then
    raise exception 'Pedido % está cancelado e não pode ser marcado como pago.', old.order_number
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bloquear_cancelamento on orders;
create trigger trg_bloquear_cancelamento
  before update on orders
  for each row
  execute function bloquear_cancelamento_apos_entrega();
