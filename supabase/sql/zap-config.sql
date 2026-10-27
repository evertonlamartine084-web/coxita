-- Copia da configuracao do grupo do Zap (ver src/utils/zapDoGrupo.js).
-- A configuracao vive no localStorage do PC da loja; se o Chrome for limpo, a chave da Evolution
-- e o grupo se perdiam. Esta linha unica guarda a copia e a lista de numeros sem WhatsApp.
-- So o painel logado le e grava: a chave da Evolution nao pode ir para a tabela publica settings.
create table if not exists zap_config (
  id int primary key default 1 check (id = 1),
  config jsonb not null default '{}'::jsonb,
  sem_whatsapp text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table zap_config enable row level security;

drop policy if exists "zap_config_admin" on zap_config;
create policy "zap_config_admin" on zap_config for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into zap_config (id) values (1) on conflict (id) do nothing;
