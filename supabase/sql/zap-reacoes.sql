-- Reações no Atendimento (14/10/2026): o 👍 ❤️ do cliente e o da loja ficam na mensagem reagida.
-- reacoes = {"cliente": "👍", "loja": "❤️"}; reacao_pendente = reação que alguém deu no painel e
-- o PC da loja ainda não mandou pela Evolution.
alter table zap_mensagens add column if not exists reacoes jsonb not null default '{}'::jsonb;
alter table zap_mensagens add column if not exists reacao_pendente text;
create index if not exists idx_zap_mensagens_reacao_pendente on zap_mensagens (id) where reacao_pendente is not null;

-- Emoji vazio = reação removida.
create or replace function zap_reagir(p_wa_id text, p_de text, p_emoji text) returns void
language sql security invoker set search_path = public as $$
  update zap_mensagens
     set reacoes = case when coalesce(p_emoji, '') = '' then reacoes - p_de
                        else reacoes || jsonb_build_object(p_de, p_emoji) end
   where wa_id = p_wa_id;
$$;
grant execute on function zap_reagir(text, text, text) to authenticated;
