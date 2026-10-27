-- Pedido de avaliação no Google para quem comprou antes de 11/10/2026, quando o pós-venda
-- automático ainda não existia (pedido do dono em 18/10/2026: "de 5 em 5 minutos até zerar").
-- A lista é montada uma vez; o cron põe uma mensagem por vez na fila do Atendimento
-- (zap_mensagens status 'enviar'), que o PC da loja envia. Só das 8h às 20h de Natal.
create table if not exists crm_lote_avaliacao (
  telefone text primary key,          -- 55 + DDD + número (com o 9)
  order_id uuid references orders(id) on delete set null,
  nome text,
  texto text not null,
  enviado_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table crm_lote_avaliacao enable row level security;
drop policy if exists "crm_lote_avaliacao_admin" on crm_lote_avaliacao;
create policy "crm_lote_avaliacao_admin" on crm_lote_avaliacao for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into crm_lote_avaliacao (telefone, order_id, nome, texto)
select tel, order_id, nome,
  format(E'Oi, %s! Aqui é da Coxelli 🧡\n\nVocê pediu nossos salgados em %s e a gente queria saber: o que achou? Se puder, deixa sua avaliação no Google. Leva 10 segundos e ajuda muito a gente:\n%s',
    nome, mes, (select value from settings where key = 'google_avaliacao_url'))
from (
  select distinct on (crm_digitos(o.customer_phone))
    '55' || case when length(crm_digitos(o.customer_phone)) = 10 and substr(crm_digitos(o.customer_phone), 3, 1) in ('8', '9')
                 then substr(crm_digitos(o.customer_phone), 1, 2) || '9' || substr(crm_digitos(o.customer_phone), 3)
                 else crm_digitos(o.customer_phone) end as tel,
    o.id as order_id,
    initcap(split_part(trim(o.customer_name), ' ', 1)) as nome,
    case extract(month from o.created_at at time zone 'America/Fortaleza') when 9 then 'setembro' else 'outubro' end as mes
  from orders o
  where o.status = 'entregue'
    and o.reposicao_de is null
    and not exists (select 1 from orders rp where rp.reposicao_de = o.id)
    and crm_telefone_valido(o.customer_phone)
    and crm_digitos(o.customer_phone) not in (select digitos from crm_numeros_ignorados)
  order by crm_digitos(o.customer_phone), o.created_at desc
) c
where not exists (select 1 from crm_envios e where e.etapa = 'avaliacao' and right(e.telefone_digitos, 8) = right(c.tel, 8))
  and not exists (select 1 from reviews r join orders o2 on o2.id = r.order_id where right(crm_digitos(o2.customer_phone), 8) = right(c.tel, 8))
on conflict do nothing;

create or replace function crm_enviar_lote_avaliacao() returns void
language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_semnove text;
  v_chave text;
begin
  -- Número antigo fica no WhatsApp sem o 9: a mensagem sai, mas a cópia da Evolution volta numa
  -- conversa sem o 9 com o mesmo wa_id, e a linha da fila fica presa em 'enviando'. Apaga a presa
  -- (e a conversa com o 9, se ficou vazia), mantendo a cópia que de fato saiu.
  delete from zap_mensagens m
  where m.enviada_por = 'pos-venda (antigos)' and m.status = 'enviando' and m.criada_em < now() - interval '1 minute'
    and exists (select 1 from zap_mensagens c where c.conversa <> m.conversa and right(c.conversa, 8) = right(m.conversa, 8)
                and c.de_mim and c.wa_id is not null and c.texto = m.texto);
  delete from zap_conversas z
  where z.chave in (select telefone from crm_lote_avaliacao where enviado_em is not null)
    and not exists (select 1 from zap_mensagens m where m.conversa = z.chave)
    and exists (select 1 from zap_conversas o where o.chave <> z.chave and right(o.chave, 8) = right(z.chave, 8));

  if extract(hour from now() at time zone 'America/Fortaleza') not between 8 and 19 then return; end if;
  select * into v from crm_lote_avaliacao where enviado_em is null order by criado_em, telefone limit 1 for update skip locked;
  if not found then
    perform cron.unschedule('avaliacao-antigos');   -- zerou: o cron se desliga sozinho
    return;
  end if;
  v_semnove := case when length(v.telefone) = 13 then substr(v.telefone, 1, 4) || substr(v.telefone, 6) else v.telefone end;
  select chave into v_chave from zap_conversas where telefone in (v.telefone, v_semnove) order by ultima_em desc nulls last limit 1;
  if v_chave is null then
    insert into zap_conversas (chave, jid, telefone, nome) values (v.telefone, v.telefone || '@s.whatsapp.net', v.telefone, v.nome)
    on conflict (chave) do nothing;
    v_chave := v.telefone;
  end if;
  insert into zap_mensagens (conversa, de_mim, status, texto, enviada_por) values (v_chave, true, 'enviar', v.texto, 'pos-venda (antigos)');
  insert into crm_envios (fluxo, etapa, order_id, telefone_digitos, status, motivo)
  values ('pos_venda', 'avaliacao', v.order_id, crm_digitos(v.telefone), 'enviado', 'lote dos antigos (18/10)')
  on conflict do nothing;
  update crm_lote_avaliacao set enviado_em = now() where telefone = v.telefone;
end $$;

select cron.schedule('avaliacao-antigos', '*/5 * * * *', 'select crm_enviar_lote_avaliacao()');
