-- Atendimento: apagar para todos e editar (14/10/2026). O painel grava a ação pendente e o PC da
-- loja executa na Evolution. remote_jid = o jid exato da mensagem na Evolution (apagar/editar
-- precisam dele; a conversa pode estar guardada pelo telefone e a mensagem pelo @lid).
alter table zap_mensagens add column if not exists apagada boolean not null default false;
alter table zap_mensagens add column if not exists editada boolean not null default false;
alter table zap_mensagens add column if not exists acao_pendente jsonb;  -- {"tipo":"apagar"} | {"tipo":"editar","texto":"..."}
alter table zap_mensagens add column if not exists remote_jid text;
create index if not exists idx_zap_mensagens_acao_pendente on zap_mensagens (id) where acao_pendente is not null;
