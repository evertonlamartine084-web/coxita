-- Números fora do funil de carrinho abandonado (16/10/2026): o dono testando o checkout não pode
-- virar "carrinho capturado" nem receber a mensagem de recuperação. A lista fica numa tabela só
-- do painel (o site não lê); salvar_carrinho simplesmente não guarda o carrinho desses números.
-- Para incluir outro: insert into crm_numeros_ignorados (digitos, quem) values ('84999999999', 'Fulano');

create table if not exists crm_numeros_ignorados (
  digitos text primary key check (digitos ~ '^\d{10,11}$'),
  quem text,
  criado_em timestamptz not null default now()
);
alter table crm_numeros_ignorados enable row level security;
drop policy if exists crm_numeros_ignorados_painel on crm_numeros_ignorados;
create policy crm_numeros_ignorados_painel on crm_numeros_ignorados for all using (auth.role() = 'authenticated');

insert into crm_numeros_ignorados (digitos, quem) values ('84997094693', 'Everton (dono)')
on conflict (digitos) do nothing;

create or replace function salvar_carrinho(p_id uuid, p_nome text, p_telefone text, p_itens jsonb, p_subtotal numeric, p_pedido uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dig text := crm_digitos(p_telefone);
begin
  if length(v_dig) < 10 then return; end if;
  if exists (select 1 from crm_numeros_ignorados where digitos = v_dig) then return; end if;
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
