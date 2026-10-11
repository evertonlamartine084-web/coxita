-- Contatos do WhatsApp da loja (Evolution no PC da loja), para achar o telefone dos pedidos
-- lançados no painel só com o primeiro nome. O painel da loja manda só o resumo de cada
-- conversa: número, nome salvo no celular / nome do perfil e os dias em que houve mensagem
-- (com quantas). O texto das mensagens não sai do PC da loja.
create table if not exists zap_contatos (
  numero text primary key,           -- só dígitos, com DDI (5584999999999)
  nome text,                         -- nome salvo no celular da loja, se veio
  nome_perfil text,                  -- nome que a pessoa pôs no WhatsApp
  dias jsonb not null default '{}'::jsonb,  -- {"2026-10-04": 12, ...} mensagens por dia
  primeira_msg timestamptz,
  ultima_msg timestamptz,
  msgs int not null default 0,
  atualizado_em timestamptz not null default now()
);
create index if not exists zap_contatos_digitos_idx on zap_contatos (crm_digitos(numero));
alter table zap_contatos enable row level security;
drop policy if exists zap_contatos_painel on zap_contatos;
create policy zap_contatos_painel on zap_contatos for all using (auth.role() = 'authenticated');

-- Pedido do hub para o painel da loja sincronizar agora (o painel olha a cada 2 min)
insert into settings (key, value) values ('zap_sincronizar_pedido', ''), ('zap_sincronizado_em', '')
on conflict (key) do nothing;
