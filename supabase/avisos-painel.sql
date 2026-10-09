-- Avisos do painel (09/10/2026): o que está parado e ninguém está vendo.
--
-- Em 02/10 o Bling caiu e ficou 6 dias sem emitir nota sem ninguém saber. Esta função junta,
-- numa leitura só, os sinais de vida de cada integração para o painel mostrar uma faixa:
--   - Bling: última renovação do acesso e erro de conexão recente na emissão;
--   - impressora: último "verificando" do painel com a impressão ligada (a cada 5 min);
--   - grupo do Zap: último "zap_vivo" do painel da loja (a cada 5 min, com o estado do WhatsApp).
-- Security definer porque integracao_bling só a service_role lê; devolve só datas e estados.

create or replace function status_integracoes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'bling_atualizado', (select atualizado_em from integracao_bling where id = 1),
    'bling_erro', (
      select bling_nfe_erro from orders
       where bling_nfe_em > now() - interval '2 days'
         and bling_nfe_status = 'erro'
         and (bling_nfe_erro ilike '%reconect%' or bling_nfe_erro ilike '%recusou%' or bling_nfe_erro ilike '%autoriza%')
       order by bling_nfe_em desc limit 1),
    'impressao_viva', (select max(created_at) from impressao_log where evento = 'verificando'),
    'zap_vivo', (select max(created_at) from impressao_log where evento = 'zap_vivo'),
    'zap_estado', (select detalhe->>'estado' from impressao_log where evento = 'zap_vivo' order by created_at desc limit 1),
    'agora', now()
  );
$$;

revoke all on function status_integracoes() from public, anon;
grant execute on function status_integracoes() to authenticated;
