-- Pós-venda: a mensagem de "entregue" do Zap leva o link do Google desde 11/10/2026 (zapDoGrupo.js),
-- e por isso o pós-venda pula esses pedidos. Para o hub contar o pedido de nota, cada "entregue"
-- enviado vira um registro em crm_envios, etapa avaliacao, com o horário do envio (12/10/2026).
create or replace function crm_registrar_entregue_zap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.zap_cliente->>'entregue' ~ '^\d{4}-'
     and coalesce(old.zap_cliente->>'entregue', '') !~ '^\d{4}-' then
    insert into crm_envios (fluxo, etapa, order_id, telefone_digitos, status, motivo, enviado_em)
    values ('pos_venda', 'avaliacao', new.id, crm_digitos(new.customer_phone), 'enviado',
            'na mensagem de entregue', (new.zap_cliente->>'entregue')::timestamptz)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_crm_registrar_entregue_zap on orders;
create trigger trg_crm_registrar_entregue_zap after update of zap_cliente on orders
  for each row execute function crm_registrar_entregue_zap();

-- os que já saíram com o link (a partir de 11/10, quando a mensagem passou a levá-lo)
insert into crm_envios (fluxo, etapa, order_id, telefone_digitos, status, motivo, enviado_em)
select 'pos_venda', 'avaliacao', o.id, crm_digitos(o.customer_phone), 'enviado',
       'na mensagem de entregue', (o.zap_cliente->>'entregue')::timestamptz
from orders o
where o.zap_cliente->>'entregue' ~ '^\d{4}-'
  and (o.zap_cliente->>'entregue')::timestamptz >= '2026-10-11 15:39:05+00'
on conflict do nothing;
