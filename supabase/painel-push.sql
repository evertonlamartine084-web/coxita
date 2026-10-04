-- Notificação de pedido novo no app do painel (04/10/2026).
--
-- Antes só existia push para o CLIENTE (push_subscriptions, por pedido). A loja dependia do
-- ntfy e da sirene com o painel aberto; o app do painel no iPhone não recebia nada.

create table if not exists painel_push (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table painel_push enable row level security;

-- só quem entra no painel grava ou apaga aparelho; a função lê com a service role
drop policy if exists "painel grava aparelho" on painel_push;
create policy "painel grava aparelho" on painel_push
  for all to authenticated using (true) with check (true);

-- Pedido do site (anônimo) avisa os aparelhos da loja. Pedido lançado no painel, não: quem
-- lançou já sabe.
create or replace function avisar_painel_pedido_novo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segredo text;
  v_anon text;
begin
  if coalesce(auth.role(), 'anon') = 'authenticated' then
    return new;
  end if;
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'emissao_nota_segredo';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'supabase_anon_key';
  if v_segredo is null or v_anon is null then
    raise warning 'aviso do painel sem segredos no vault; pedido % sem push', new.order_number;
    return new;
  end if;
  perform net.http_post(
    url := 'https://ruehnwnihmysycrpddgy.supabase.co/functions/v1/avisar-painel',
    body := jsonb_build_object('order_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-emissao-interna', v_segredo
    ),
    timeout_milliseconds := 20000
  );
  return new;
end;
$$;

drop trigger if exists trg_avisar_painel on orders;
create trigger trg_avisar_painel
  after insert on orders
  for each row execute function avisar_painel_pedido_novo();
