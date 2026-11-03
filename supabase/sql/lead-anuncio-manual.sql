-- Lead do anúncio marcado à mão (03/11/2026): quem veio pelo anúncio mas escreveu a própria
-- mensagem ("Boa tarde") em vez do texto do botão não era contado. zap_conversas.veio_do_anuncio
-- = true entra como lead, a partir da primeira mensagem do cliente.

alter table zap_conversas add column if not exists veio_do_anuncio boolean;

create or replace function crm_leads_do_anuncio(p_desde timestamptz)
returns table (
  conversa text, nome text, telefone text, lead_em timestamptz, ultima_em timestamptz,
  ultima_de_mim boolean, pedido int, valor numeric, pedido_em timestamptz
)
language sql stable security definer set search_path = public as $$
  with cfg as (select coalesce(config->>'gatilho', 'encomendar um cento') g from crm_fluxos where id = 'lead_anuncio'),
  leads as (
    select x.conversa, min(x.lead_em) lead_em from (
      select m.conversa, min(m.criada_em) lead_em
      from zap_mensagens m, cfg
      where not m.de_mim and m.criada_em >= p_desde and m.texto ilike '%' || cfg.g || '%'
      group by m.conversa
      union all
      select m.conversa, min(m.criada_em)
      from zap_mensagens m join zap_conversas z on z.chave = m.conversa and z.veio_do_anuncio
      where not m.de_mim and m.criada_em >= p_desde
      group by m.conversa
    ) x group by x.conversa
  )
  select l.conversa, c.nome, coalesce(c.telefone, c.chave), l.lead_em, c.ultima_em, c.ultima_de_mim,
    o.order_number, o.total, o.created_at
  from leads l
  join zap_conversas c on c.chave = l.conversa
  left join lateral (
    select x.order_number, x.total, x.created_at from orders x
    where right(regexp_replace(x.customer_phone, '\D', '', 'g'), 8) = right(regexp_replace(coalesce(c.telefone, c.chave), '\D', '', 'g'), 8)
      and x.created_at >= l.lead_em - interval '1 hour'
      and x.status <> 'cancelado' and x.reposicao_de is null
    order by x.created_at limit 1
  ) o on true
  where auth.role() = 'authenticated'
$$;
revoke all on function crm_leads_do_anuncio(timestamptz) from public, anon;
grant execute on function crm_leads_do_anuncio(timestamptz) to authenticated;

update zap_conversas set veio_do_anuncio = true where chave = '558486436732'; -- Juciara kaline, pedido #244
