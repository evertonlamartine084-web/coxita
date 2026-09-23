-- Emissão automática da NFC-e pelo banco, não pelo painel. Complementa bling-emissao.sql.
--
-- Antes, quem pedia a nota era a tela em que alguém clicava "Saiu para entrega": status mudado
-- por outro caminho, ou página fechada no meio, e a nota não saía. Agora o próprio banco chama a
-- função bling-emitir-nota quando o pedido sai, venha a mudança de onde vier.
--
-- Pré-requisitos, fora deste arquivo porque são segredos:
--   select vault.create_secret('<segredo>', 'emissao_nota_segredo');
--   select vault.create_secret('<anon key>', 'supabase_anon_key');
--   supabase secrets set EMISSAO_INTERNA_SEGREDO=<segredo>
-- O segredo prova à função que a chamada veio do banco; a anon key só passa o portão de JWT da
-- plataforma, que não aceita chamada sem token.

create extension if not exists pg_net;

create or replace function emitir_nota_ao_sair()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segredo text;
  v_anon text;
begin
  -- só na passagem para "saiu para entrega", com a automática ligada e sem nota ainda
  if new.status is distinct from 'saiu_entrega' or old.status = 'saiu_entrega' then
    return new;
  end if;
  if coalesce(new.bling_nfe_status, '') in ('emitida', 'cancelada', 'pendente') then
    return new;
  end if;
  if coalesce((select value from settings where key = 'bling_nfe_automatica'), 'nao') <> 'sim' then
    return new;
  end if;

  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'emissao_nota_segredo';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'supabase_anon_key';
  if v_segredo is null or v_anon is null then
    -- sem os segredos a chamada seria recusada; o botão "Emitir nota" continua valendo
    raise warning 'emissão automática sem segredos no vault; pedido % fica para o botão', new.id;
    return new;
  end if;

  -- pg_net é assíncrono: a mudança de status não espera o Bling, e sai mesmo se ele estiver fora.
  -- Se a função falhar, o erro fica gravado no pedido e o botão tenta de novo.
  perform net.http_post(
    url := 'https://ruehnwnihmysycrpddgy.supabase.co/functions/v1/bling-emitir-nota',
    body := jsonb_build_object('order_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-emissao-interna', v_segredo
    ),
    -- a emissão passa por três chamadas ao Bling e pela Sefaz; 5 s (o padrão) cortaria no meio
    timeout_milliseconds := 60000
  );
  return new;
end;
$$;

revoke all on function emitir_nota_ao_sair() from public, anon, authenticated;

drop trigger if exists trg_emitir_nota_ao_sair on orders;
create trigger trg_emitir_nota_ao_sair
  after update of status on orders
  for each row execute function emitir_nota_ao_sair();
