-- NF-e pedida pelo código de barras (26/10/2026): o painel lê a chave do DANFE e ela entra aqui;
-- o robô do PC da loja (loja-pc/sefaz/robo.py) pega as pendentes a cada minuto, dá ciência,
-- baixa o XML na Receita e devolve o resultado pela função nfe-receber.

create table if not exists nfe_pedidas (
  chave text primary key check (chave ~ '^\d{44}$'),
  status text not null default 'pendente'
    check (status in ('pendente', 'buscando', 'recebida', 'nao_encontrada', 'erro')),
  mensagem text,
  tentativas int not null default 0,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
alter table nfe_pedidas enable row level security;
drop policy if exists nfe_pedidas_painel on nfe_pedidas;
create policy nfe_pedidas_painel on nfe_pedidas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
