-- Lembrete de agendado no celular, com o app do painel fechado (04/10/2026).
--
-- A sirene de "1 h antes" (AdminLayout) só toca com o painel aberto. Aqui o próprio banco confere
-- a cada minuto e manda o push pela função avisar-painel, uma vez por pedido.

create extension if not exists pg_cron;

alter table orders add column if not exists lembrete_enviado_em timestamptz;

create or replace function lembrar_agendados()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segredo text;
  v_anon text;
  v_pedido record;
  v_n int := 0;
begin
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'emissao_nota_segredo';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'supabase_anon_key';
  if v_segredo is null or v_anon is null then return 0; end if;

  for v_pedido in
    update orders
       set lembrete_enviado_em = now()
     where status in ('pendente', 'em_preparo')
       and lembrete_enviado_em is null
       and scheduled_for between now() - interval '30 minutes' and now() + interval '1 hour'
    returning id
  loop
    perform net.http_post(
      url := 'https://ruehnwnihmysycrpddgy.supabase.co/functions/v1/avisar-painel',
      body := jsonb_build_object('order_id', v_pedido.id, 'tipo', 'lembrete'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'x-emissao-interna', v_segredo
      ),
      timeout_milliseconds := 20000
    );
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- agendados que já passaram não lembram mais (sem isto, todos os antigos dispararam no 1º minuto)
update orders set lembrete_enviado_em = now()
 where lembrete_enviado_em is null and scheduled_for < now() - interval '30 minutes';

select cron.unschedule('lembrar-agendados') where exists (select 1 from cron.job where jobname = 'lembrar-agendados');
select cron.schedule('lembrar-agendados', '* * * * *', 'select lembrar_agendados()');
