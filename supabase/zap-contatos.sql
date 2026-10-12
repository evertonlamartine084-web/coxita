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

-- Etiquetas do WhatsApp Business da conversa ("Pedido finalizado" = comprou)
alter table zap_contatos add column if not exists etiquetas text[] not null default '{}';

-- Cartões de contato (vCard) recebidos ou mandados no Zap da loja: a equipe manda o contato de
-- quem fez o pedido, e o hub liga o cartão ao pedido sem telefone (12/10/2026). Do cartão só
-- sobem o nome e o número; quem mandou e quando, para achar o pedido do dia.
create table if not exists zap_cartoes (
  id text primary key,               -- id da mensagem + posição do cartão nela
  numero text not null,              -- número do cartão, só dígitos, com DDI
  nome text,                         -- nome que veio no cartão
  enviado_por text,                  -- número de quem mandou (null = a própria loja)
  enviado_por_nome text,
  enviado_em timestamptz not null,
  descartado boolean not null default false,  -- "não é de pedido", escondido no hub
  atualizado_em timestamptz not null default now()
);
alter table zap_cartoes enable row level security;
drop policy if exists zap_cartoes_painel on zap_cartoes;
create policy zap_cartoes_painel on zap_cartoes for all using (auth.role() = 'authenticated');
