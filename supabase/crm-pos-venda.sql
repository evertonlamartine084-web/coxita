-- CRM, fluxo 2: pós-venda (hub → CRM). Três etapas, cada uma liga e desliga sozinha:
--   avaliacao — X horas depois de entregue, manda o link de avaliação do Google (todo mundo)
--   alerta    — nota 1 a 3 vira aviso no grupo da loja, para alguém ligar para o cliente
--   recompra  — quem comprou uma vez só recebe, X dias depois, um convite para voltar
-- Como no carrinho abandonado, o banco decide quem está devendo (crm_pos_venda_devidos) e o
-- painel do PC da loja manda pela Evolution, registrando cada envio em crm_envios.

-- Quando o pedido foi entregue: updated_at muda com qualquer edição depois (marcar pago, nota)
alter table orders add column if not exists entregue_em timestamptz;
-- os já entregues: o horário do aviso "entregue" no Zap, se houve; senão o dia marcado ou o do
-- pedido. updated_at não serve: a emissão das notas (Bling) mexeu em todos em outubro.
update orders set entregue_em = coalesce(
    case when zap_cliente->>'entregue' ~ '^\d{4}-' then (zap_cliente->>'entregue')::timestamptz end,
    scheduled_for, created_at)
  where status = 'entregue';

-- Telefone que dá para chamar: DDD válido e 8 ou 9 dígitos, sem número de mentira (0000…, 9999…)
create or replace function crm_telefone_valido(p text) returns boolean
language sql immutable as $$
  select crm_digitos(p) ~ '^[1-9][1-9]9?[2-9][0-9]{7}$' and crm_digitos(p) !~ '^(.)\1+$'
$$;

create or replace function marcar_entregue_em() returns trigger
language plpgsql as $$
begin
  if new.status = 'entregue' and (tg_op = 'INSERT' or old.status is distinct from 'entregue') then
    new.entregue_em := coalesce(new.entregue_em, now());
  elsif new.status <> 'entregue' then
    new.entregue_em := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_entregue_em on orders;
create trigger trg_entregue_em before insert or update of status on orders
  for each row execute function marcar_entregue_em();

create table if not exists crm_envios (
  id uuid primary key default gen_random_uuid(),
  fluxo text not null,
  etapa text not null,
  order_id uuid references orders(id) on delete cascade,
  review_id uuid references reviews(id) on delete cascade,
  telefone_digitos text,
  status text not null default 'enviado' check (status in ('enviando', 'enviado', 'erro')),
  motivo text,
  enviado_em timestamptz not null default now()
);
create unique index if not exists crm_envios_pedido_uniq on crm_envios (etapa, order_id) where order_id is not null;
create unique index if not exists crm_envios_review_uniq on crm_envios (etapa, review_id) where review_id is not null;
create index if not exists crm_envios_tel_idx on crm_envios (telefone_digitos, etapa, enviado_em);
alter table crm_envios enable row level security;
drop policy if exists crm_envios_painel on crm_envios;
create policy crm_envios_painel on crm_envios for all using (auth.role() = 'authenticated');

insert into crm_fluxos (id, nome, ativo, config) values (
  'pos_venda', 'Pós-venda', false,
  jsonb_build_object(
    'hora_inicio', 10,
    'hora_fim', 20,
    'avaliacao', jsonb_build_object(
      'ativo', true,
      'horas_apos', 20,
      'mensagem', E'Oi, {nome}! Aqui é da Coxelli 🧡\n\nO que você achou dos salgados? Se puder, deixa sua avaliação no Google. Leva 10 segundos e ajuda muito a gente:\n{link}'
    ),
    'alerta', jsonb_build_object('ativo', true),
    'recompra', jsonb_build_object(
      'ativo', false,
      'dias_apos', 10,
      'cupom', '',
      'mensagem', E'Oi, {nome}! Bateu vontade de coxinha? 😋\n\nO cardápio da Coxelli está aqui, com entrega e retirada:\n{link}'
    )
  )
) on conflict (id) do nothing;

-- Painel: quem está devendo mensagem de pós-venda agora (no máximo 5 de cada etapa por volta).
create or replace function crm_pos_venda_devidos()
returns table (
  etapa text, order_id uuid, review_id uuid, order_number int, nome text, telefone text,
  public_token text, rating int, comentario text, total numeric
)
language plpgsql security definer set search_path = public as $$
declare
  v_ativo boolean;
  v_cfg jsonb;
begin
  if auth.role() <> 'authenticated' then raise exception 'só o painel'; end if;
  select f.ativo, f.config into v_ativo, v_cfg from crm_fluxos f where f.id = 'pos_venda';
  if not coalesce(v_ativo, false) then return; end if;

  -- 1. pedir a nota: entregue há X horas (até 3 dias), site/Zap/balcão, sem nota ainda, e a
  --    mesma pessoa não recebeu pedido de nota nos últimos 30 dias
  if coalesce((v_cfg->'avaliacao'->>'ativo')::boolean, false) then
    return query
      select distinct on (crm_digitos(o.customer_phone))
        'avaliacao'::text, o.id, null::uuid, o.order_number, o.customer_name, o.customer_phone,
        o.public_token::text, null::int, null::text, o.total
      from orders o
      where o.status = 'entregue'
        and coalesce(o.canal, 'site') in ('site', 'whatsapp', 'balcao')
        and o.reposicao_de is null
        -- pedido que deu problema (teve reposição) é conversa da loja, não de robô
        and not exists (select 1 from orders rp where rp.reposicao_de = o.id)
        and o.public_token is not null
        and crm_telefone_valido(o.customer_phone)
        and o.created_at > now() - interval '7 days'
        and o.entregue_em < now() - make_interval(hours => coalesce((v_cfg->'avaliacao'->>'horas_apos')::int, 20))
        and o.entregue_em > now() - interval '3 days'
        and not exists (select 1 from reviews r where r.order_id = o.id)
        and not exists (select 1 from crm_envios e where e.etapa = 'avaliacao' and e.order_id = o.id)
        and not exists (
          select 1 from crm_envios e
          where e.etapa = 'avaliacao' and e.telefone_digitos = crm_digitos(o.customer_phone)
            and e.enviado_em > now() - interval '30 days'
        )
      order by crm_digitos(o.customer_phone), o.entregue_em desc
      limit 5;
  end if;

  -- 2. nota baixa (1 a 3) dos últimos 2 dias que ainda não virou aviso no grupo
  if coalesce((v_cfg->'alerta'->>'ativo')::boolean, false) then
    return query
      select 'alerta'::text, o.id, r.id, o.order_number, o.customer_name, o.customer_phone,
        o.public_token::text, r.rating, r.comment, o.total
      from reviews r join orders o on o.id = r.order_id
      where r.rating <= 3
        and r.created_at > now() - interval '2 days'
        and not exists (select 1 from crm_envios e where e.etapa = 'alerta' and e.review_id = r.id)
      limit 5;
  end if;

  -- 3. segunda compra: o único pedido da pessoa foi entregue há X dias (até X+5) e ela não
  --    pediu de novo
  if coalesce((v_cfg->'recompra'->>'ativo')::boolean, false) then
    return query
      select 'recompra'::text, o.id, null::uuid, o.order_number, o.customer_name, o.customer_phone,
        o.public_token::text, null::int, null::text, o.total
      from orders o
      where o.status = 'entregue'
        and coalesce(o.canal, 'site') in ('site', 'whatsapp', 'balcao')
        and o.reposicao_de is null
        -- pedido que deu problema (teve reposição) é conversa da loja, não de robô
        and not exists (select 1 from orders rp where rp.reposicao_de = o.id)
        and crm_telefone_valido(o.customer_phone)
        and o.entregue_em < now() - make_interval(days => coalesce((v_cfg->'recompra'->>'dias_apos')::int, 10))
        and o.entregue_em > now() - make_interval(days => coalesce((v_cfg->'recompra'->>'dias_apos')::int, 10) + 5)
        and not exists (
          select 1 from orders x
          where x.id <> o.id and x.status <> 'cancelado' and x.reposicao_de is null
            and crm_digitos(x.customer_phone) = crm_digitos(o.customer_phone)
        )
        -- nota baixa não recebe convite para voltar: ali a conversa é outra
        and not exists (select 1 from reviews r where r.order_id = o.id and r.rating <= 3)
        and not exists (select 1 from crm_envios e where e.etapa = 'recompra' and e.order_id = o.id)
      limit 5;
  end if;
end $$;
revoke all on function crm_pos_venda_devidos() from public, anon;
grant execute on function crm_pos_venda_devidos() to authenticated;

-- Hub: números do funil no período
create or replace function crm_pos_venda_resumo(p_desde timestamptz)
returns jsonb
language sql stable security definer set search_path = public as $$
  with pedidos as (
    select e.order_id, e.enviado_em from crm_envios e
    where e.etapa = 'avaliacao' and e.status = 'enviado' and e.enviado_em >= p_desde
  ), recompras as (
    select e.order_id, e.enviado_em, e.telefone_digitos from crm_envios e
    where e.etapa = 'recompra' and e.status = 'enviado' and e.enviado_em >= p_desde
  )
  select jsonb_build_object(
    'pedidos_de_nota', (select count(*) from pedidos),
    'avaliaram', (select count(*) from pedidos p join reviews r on r.order_id = p.order_id),
    'nota_media', (select round(avg(r.rating)::numeric, 1) from reviews r where r.created_at >= p_desde),
    'notas', (select coalesce(jsonb_object_agg(rating, n), '{}'::jsonb) from (
      select rating, count(*) n from reviews where created_at >= p_desde group by rating) x),
    'alertas', (select count(*) from crm_envios where etapa = 'alerta' and enviado_em >= p_desde),
    'convites', (select count(*) from recompras),
    'voltaram', (select count(*) from recompras c where exists (
      select 1 from orders x where crm_digitos(x.customer_phone) = c.telefone_digitos
        and x.created_at > c.enviado_em and x.created_at < c.enviado_em + interval '15 days'
        and x.status <> 'cancelado')),
    'valor_voltou', (select coalesce(sum(x.total), 0) from recompras c join lateral (
      select total from orders x where crm_digitos(x.customer_phone) = c.telefone_digitos
        and x.created_at > c.enviado_em and x.created_at < c.enviado_em + interval '15 days'
        and x.status <> 'cancelado' order by x.created_at limit 1) x on true)
  )
$$;
revoke all on function crm_pos_venda_resumo(timestamptz) from public, anon;
grant execute on function crm_pos_venda_resumo(timestamptz) to authenticated;
