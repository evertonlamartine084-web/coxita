-- Registro do que a impressão automática faz em cada aparelho do painel.
--
-- A impressora fica num computador da loja que não se vê daqui: sem isto, "não imprimiu" não
-- diz se o painel estava desligado, numa versão velha, sem a chave ligada, ou se o Chrome
-- recebeu o documento e não saiu nada. Cada aparelho grava o seu passo a passo.
create table if not exists impressao_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  aparelho text not null,        -- id sorteado por navegador, guardado no localStorage
  versao text,                   -- script de entrada do painel: diz se o aparelho está atualizado
  evento text not null,
  pedido int,
  detalhe jsonb
);

create index if not exists idx_impressao_log_created on impressao_log (created_at desc);

alter table impressao_log enable row level security;

drop policy if exists "painel grava log de impressao" on impressao_log;
create policy "painel grava log de impressao" on impressao_log
  for insert to authenticated with check (true);

drop policy if exists "painel le log de impressao" on impressao_log;
create policy "painel le log de impressao" on impressao_log
  for select to authenticated using (true);
