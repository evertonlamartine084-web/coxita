-- CRM, fluxo 3: lead do anúncio (hub → CRM, pedido do dono em 03/11/2026). Quem chamou no Zap
-- pelo botão do anúncio da Meta ("Quero encomendar um cento"), ficou X horas sem conversa e não
-- fez pedido recebe UMA mensagem de retomada. O banco decide quem está devendo
-- (crm_leads_devidos); o painel do PC da loja põe a mensagem na fila do Atendimento
-- (zap_mensagens status 'enviar'), então ela aparece na conversa como as outras.

alter table crm_envios add column if not exists conversa text references zap_conversas(chave) on delete cascade;
create unique index if not exists crm_envios_conversa_uniq on crm_envios (etapa, conversa) where conversa is not null;

insert into crm_fluxos (id, nome, ativo, config) values (
  'lead_anuncio', 'Lead do anúncio', false,
  jsonb_build_object(
    'hora_inicio', 10,
    'hora_fim', 19,
    'horas_sem_conversa', 20,
    'gatilho', 'encomendar um cento',
    'mensagem', E'Oi, {nome}! Aqui é da Coxelli 🧡\n\nVocê chamou a gente pelo anúncio do cento. Ainda quer encomendar?\n\nO cento de salgados fritos sai *R$ 30 no Pix* (R$ 32 no cartão), com até 4 sabores. Me diz o dia e o bairro que eu já vejo a entrega pra você 😉'
  )
) on conflict (id) do nothing;

-- O lead: a primeira mensagem do cliente com o texto do botão nos últimos 5 dias. Fechou = pedido
-- do mesmo telefone (8 últimos dígitos, o WhatsApp guarda sem o 9) depois de chamar.
create or replace function crm_leads_do_anuncio(p_desde timestamptz)
returns table (
  conversa text, nome text, telefone text, lead_em timestamptz, ultima_em timestamptz,
  ultima_de_mim boolean, pedido int, valor numeric, pedido_em timestamptz
)
language sql stable security definer set search_path = public as $$
  with cfg as (select coalesce(config->>'gatilho', 'encomendar um cento') g from crm_fluxos where id = 'lead_anuncio'),
  leads as (
    select m.conversa, min(m.criada_em) lead_em
    from zap_mensagens m, cfg
    where not m.de_mim and m.criada_em >= p_desde and m.texto ilike '%' || cfg.g || '%'
    group by m.conversa
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

-- Painel: quem está devendo a mensagem agora. A conversa parou há X horas (até X + 48 h, depois
-- disso já esfriou), sem pedido, nunca recebeu esta mensagem e não é número de teste.
create or replace function crm_leads_devidos()
returns table (conversa text, nome text, telefone text)
language plpgsql security definer set search_path = public as $$
declare
  v_ativo boolean;
  v_horas int;
begin
  if auth.role() <> 'authenticated' then raise exception 'só o painel'; end if;
  select f.ativo, coalesce((f.config->>'horas_sem_conversa')::int, 20) into v_ativo, v_horas
    from crm_fluxos f where f.id = 'lead_anuncio';
  if not coalesce(v_ativo, false) then return; end if;
  return query
    select l.conversa, l.nome, l.telefone
    from crm_leads_do_anuncio(now() - interval '5 days') l
    where l.pedido is null
      and l.ultima_em < now() - make_interval(hours => v_horas)
      and l.ultima_em > now() - make_interval(hours => v_horas + 48)
      and not exists (select 1 from crm_envios e where e.etapa = 'lead_anuncio' and e.conversa = l.conversa)
      and not exists (select 1 from crm_numeros_ignorados i
        where right(i.digitos, 8) = right(regexp_replace(l.telefone, '\D', '', 'g'), 8))
      -- mensagem já na fila desta conversa (o Atendimento ainda vai mandar): espera
      and not exists (select 1 from zap_mensagens q where q.conversa = l.conversa and q.status in ('enviar', 'enviando'))
    order by l.ultima_em
    -- um por volta (a cada ~2 min): uma leva de mensagens iguais de uma vez o WhatsApp estranha
    limit 1;
end $$;
revoke all on function crm_leads_devidos() from public, anon;
grant execute on function crm_leads_devidos() to authenticated;
