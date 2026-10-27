-- Notas fiscais da noite (09/10/2026).
--
-- Decisão do dono: a nota sai uma vez por dia, à noite, só de pedido ENTREGUE (venda fechada e
-- paga; não tem mais risco de cancelamento, e NFC-e só cancela em 30 min). A emissão na hora
-- (settings.bling_nfe_automatica, gatilho trg_emitir_nota_do_pedido) continua DESLIGADA.
--
-- Das 22h às 23h58 (Natal), a cada 2 minutos, o cron pega UM pedido entregue sem nota e chama a
-- bling-emitir-nota, que tem trava própria: pedido com nota emitida, cancelada ou em emissão não
-- recebe outra. Um por vez para não estourar o limite do Bling (3 chamadas/s); dá 60 notas
-- por noite. Pedido sem item com valor (os "Compras anteriores") fica de fora. Pedido que deu
-- erro só é tentado de novo na noite seguinte (12 h depois), para não repetir o mesmo erro a
-- noite inteira.

create or replace function emitir_proxima_nota_da_noite()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_numero int;
  v_segredo text;
  v_anon text;
begin
  select o.id, o.order_number into v_id, v_numero
    from orders o
   where o.status = 'entregue'
     and o.bling_nfe_numero is null
     and coalesce(o.bling_nfe_status, '') not in ('emitida', 'cancelada')
     and (o.bling_nfe_status is null
          or (o.bling_nfe_status = 'erro' and o.bling_nfe_em < now() - interval '12 hours')
          or (o.bling_nfe_status = 'pendente' and o.bling_nfe_em < now() - interval '10 minutes'))
     and exists (select 1 from order_items i where i.order_id = o.id and i.total_price > 0)
   order by o.created_at
   limit 1;
  if v_id is null then
    return null;
  end if;

  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'emissao_nota_segredo';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'supabase_anon_key';
  if v_segredo is null or v_anon is null then
    raise warning 'notas da noite sem segredos no vault';
    return null;
  end if;

  perform net.http_post(
    url := 'https://ruehnwnihmysycrpddgy.supabase.co/functions/v1/bling-emitir-nota',
    body := jsonb_build_object('order_id', v_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-emissao-interna', v_segredo
    ),
    timeout_milliseconds := 120000
  );
  return v_numero;
end;
$$;

revoke all on function emitir_proxima_nota_da_noite() from public, anon, authenticated;

-- pg_cron roda em UTC: 22h–23h58 em Natal (UTC-3) = 1h–2h58 UTC
select cron.unschedule('notas-da-noite') where exists (select 1 from cron.job where jobname = 'notas-da-noite');
select cron.schedule('notas-da-noite', '*/2 1-2 * * *', 'select emitir_proxima_nota_da_noite()');
