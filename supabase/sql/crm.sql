-- CRM do hub (/hub/crm): fluxos de mensagem automática no WhatsApp. O primeiro é o carrinho
-- abandonado: quem preencheu nome e telefone no checkout e não fechou o pedido (ou fechou com Pix
-- ou cartão on-line e não pagou) recebe uma mensagem depois de 1 h.
--
-- Quem manda é o painel do PC da loja (o mesmo laço dos avisos de pedido, pela Evolution); o
-- banco só decide quem está devendo mensagem (crm_carrinhos_devidos) e guarda o resultado.

create table if not exists crm_fluxos (
  id text primary key,
  nome text not null,
  ativo boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table crm_fluxos enable row level security;
drop policy if exists crm_fluxos_painel on crm_fluxos;
create policy crm_fluxos_painel on crm_fluxos for all using (auth.role() = 'authenticated');

insert into crm_fluxos (id, nome, ativo, config) values (
  'carrinho_abandonado', 'Carrinho abandonado', false,
  jsonb_build_object(
    'espera_min', 60,
    'hora_inicio', 9,
    'hora_fim', 21,
    'cupom', '',
    'mensagem', E'Oi, {nome}! Aqui é da Coxelli 🧡\n\nVi que você montou um pedido no nosso site e não chegou a finalizar:\n{itens}\n\nFicou alguma dúvida? É só responder aqui que a gente te ajuda. Se preferir, o seu carrinho está guardado neste link:\n{link}'
  )
) on conflict (id) do nothing;

create table if not exists carrinhos (
  id uuid primary key,
  nome text,
  telefone text not null,
  telefone_digitos text not null,
  itens jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  pedido_id uuid references orders(id) on delete set null,
  status text not null default 'aberto'
    check (status in ('aberto', 'convertido', 'avisado', 'recuperado', 'ignorado', 'erro')),
  motivo text,
  avisado_em timestamptz,
  recuperado_pedido_id uuid references orders(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists carrinhos_status_idx on carrinhos (status, atualizado_em);
create index if not exists carrinhos_tel_idx on carrinhos (telefone_digitos);
alter table carrinhos enable row level security;
drop policy if exists carrinhos_painel on carrinhos;
create policy carrinhos_painel on carrinhos for all using (auth.role() = 'authenticated');

-- Os 11 últimos dígitos: (84) 99999-9999, 84999999999 e +55 84 99999-9999 viram a mesma pessoa
create or replace function crm_digitos(p text) returns text
language sql immutable as $$ select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 11) $$;

-- Site (anônimo): guarda o carrinho de quem já digitou o telefone no checkout. O id é gerado no
-- aparelho e muda a cada carrinho novo. Depois de avisado, o carrinho não volta a "aberto".
create or replace function salvar_carrinho(p_id uuid, p_nome text, p_telefone text, p_itens jsonb, p_subtotal numeric, p_pedido uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dig text := crm_digitos(p_telefone);
begin
  if length(v_dig) < 10 then return; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 40
     or length(p_itens::text) > 60000 then
    return;
  end if;
  -- pedido informado tem que ser deste telefone: ninguém pendura pedido alheio no carrinho
  if p_pedido is not null and not exists (
    select 1 from orders where id = p_pedido and crm_digitos(customer_phone) = v_dig
  ) then
    p_pedido := null;
  end if;

  insert into carrinhos (id, nome, telefone, telefone_digitos, itens, subtotal, pedido_id)
  values (p_id, left(trim(p_nome), 80), left(trim(p_telefone), 30), v_dig, p_itens, greatest(coalesce(p_subtotal, 0), 0), p_pedido)
  on conflict (id) do update set
    nome = excluded.nome,
    telefone = excluded.telefone,
    telefone_digitos = excluded.telefone_digitos,
    itens = excluded.itens,
    subtotal = excluded.subtotal,
    pedido_id = coalesce(excluded.pedido_id, carrinhos.pedido_id),
    atualizado_em = now()
  where carrinhos.status = 'aberto';
end $$;
revoke all on function salvar_carrinho(uuid, text, text, jsonb, numeric, uuid) from public;
grant execute on function salvar_carrinho(uuid, text, text, jsonb, numeric, uuid) to anon, authenticated;

-- Site (anônimo): o link da mensagem devolve só os itens, nunca nome ou telefone
create or replace function carrinho_para_recuperar(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select itens from carrinhos where id = p_id and criado_em > now() - interval '15 days'
$$;
revoke all on function carrinho_para_recuperar(uuid) from public;
grant execute on function carrinho_para_recuperar(uuid) to anon, authenticated;

-- Pedido que "fecha" o carrinho: do mesmo telefone, feito depois que o carrinho começou, não
-- cancelado e, se for Pix/cartão on-line do site, já pago.
create or replace function crm_pedido_que_fechou(p_dig text, p_desde timestamptz)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from orders
  where crm_digitos(customer_phone) = p_dig
    and created_at >= p_desde - interval '5 minutes'
    and status <> 'cancelado'
    and reposicao_de is null
    -- pedido lançado no painel (Zap, balcão) vale sempre: cartão ali é pago na entrega
    and (coalesce(canal, 'site') <> 'site' or payment_method not in ('pix_online', 'credito', 'debito', 'cartao')
         or payment_status = 'pago')
  order by created_at
  limit 1
$$;

-- Painel: põe os status em dia e devolve quem está devendo mensagem agora.
--  aberto + comprou            → convertido (não precisou de mensagem)
--  avisado + comprou depois    → recuperado (a mensagem trouxe a venda, até 7 dias)
--  aberto há mais que a espera → devido (no máximo 1 mensagem por telefone a cada 7 dias)
create or replace function crm_carrinhos_devidos()
returns setof carrinhos
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb;
  v_ativo boolean;
  c carrinhos;
  v_pedido uuid;
begin
  if auth.role() <> 'authenticated' then raise exception 'só o painel'; end if;
  select ativo, config into v_ativo, v_cfg from crm_fluxos where id = 'carrinho_abandonado';

  for c in select * from carrinhos where status in ('aberto', 'avisado') and criado_em > now() - interval '15 days' loop
    v_pedido := crm_pedido_que_fechou(c.telefone_digitos, c.criado_em);
    if v_pedido is null then continue; end if;
    if c.status = 'aberto' then
      update carrinhos set status = 'convertido', pedido_id = v_pedido where id = c.id;
    elsif exists (select 1 from orders where id = v_pedido and created_at >= c.avisado_em)
       and c.avisado_em > now() - interval '7 days' then
      update carrinhos set status = 'recuperado', recuperado_pedido_id = v_pedido where id = c.id;
    end if;
  end loop;

  -- carrinho velho que nunca foi avisado (fluxo desligado, fora do horário) não é mais mandado
  update carrinhos set status = 'ignorado', motivo = 'passou de 24 h'
  where status = 'aberto' and atualizado_em < now() - interval '24 hours';

  if not coalesce(v_ativo, false) then return; end if;

  return query
    select distinct on (k.telefone_digitos) k.* from carrinhos k
    where k.status = 'aberto'
      and k.atualizado_em < now() - make_interval(mins => coalesce((v_cfg->>'espera_min')::int, 60))
      and not exists (
        select 1 from carrinhos o
        where o.telefone_digitos = k.telefone_digitos and o.avisado_em > now() - interval '7 days'
      )
    order by k.telefone_digitos, k.atualizado_em desc
    limit 5;
end $$;
revoke all on function crm_carrinhos_devidos() from public;
grant execute on function crm_carrinhos_devidos() to authenticated;
