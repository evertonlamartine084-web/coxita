-- Hub da Coxelli (/hub): guarda a resposta do Google (Analytics e Search Console) por período,
-- para o hub abrir rápido e não gastar cota da API a cada clique. Só a função hub-google
-- (service role) lê e grava; o painel recebe os dados pela função.
create table if not exists hub_cache (
  chave text primary key,
  dados jsonb not null,
  criado_em timestamptz not null default now()
);

alter table hub_cache enable row level security;
