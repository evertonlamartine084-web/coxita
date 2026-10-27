-- Onde vive o token do Bling.
--
-- Uma linha só (id fixo = 1): a loja conecta uma conta do Bling, não várias. O access_token
-- dura poucas horas e o refresh_token é de vida longa — guardar os dois é o que permite renovar
-- sozinho, sem alguém ter que reautorizar no meio do expediente.
--
-- Sem policy pública de nada: quem lê e escreve é a Edge Function, com service_role. Um token
-- de ERP vazando dá acesso ao faturamento inteiro da empresa.
create table if not exists integracao_bling (
  id int primary key default 1,
  access_token text not null,
  refresh_token text not null,
  expira_em timestamptz not null,
  atualizado_em timestamptz not null default now(),
  constraint uma_linha_so check (id = 1)
);

alter table integracao_bling enable row level security;
-- nem o admin logado lê pelo PostgREST: não há motivo para o token passar pelo navegador
