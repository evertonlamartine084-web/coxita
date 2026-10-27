-- Compras pelo cupom (26/10/2026): o dono aponta a câmera para o QR code do cupom de mercado
-- (NFC-e), a função `cupom-ler` busca a nota na SEFAZ-RN e os itens entram aqui e nas duas
-- planilhas do Google (itens por mês e totais por fornecedor). Ver supabase/functions/cupom-ler.
--
-- A SEFAZ pede um código de segurança de 6 letras antes de mostrar a nota. Quem digita é a pessoa
-- no painel; a sessão da SEFAZ (cookie + campos do formulário) fica em `cupom_sessoes` entre o
-- passo de abrir e o de confirmar, só para a service_role.

create table if not exists compras (
  id uuid primary key default gen_random_uuid(),
  chave_acesso text unique,                 -- 44 dígitos da NFC-e; impede lançar o mesmo cupom 2x
  numero text,                              -- nNF + série, como está no cupom
  emitente_nome text not null,
  emitente_cnpj text,
  emitida_em timestamptz,
  total numeric(12,2) not null default 0,
  forma_pagamento text,                     -- Dinheiro, Cartão de Crédito, Cartão de Débito, PIX…
  qtd_itens int not null default 0,
  url_qrcode text,
  planilha_totais_linha int,                -- linha gravada na planilha de totais (null = não foi)
  planilha_erro text,                       -- último erro ao gravar nas planilhas, se houve
  observacao text,
  created_at timestamptz not null default now()
);

create table if not exists compras_itens (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras(id) on delete cascade,
  ordem int not null default 0,
  codigo text,
  nome text not null,
  quantidade numeric(14,4) not null default 1,
  unidade text not null default 'UN',
  valor_unitario numeric(12,4) not null default 0,
  valor_total numeric(12,2) not null default 0,
  -- comida | limpeza (limpeza e embalagens) | outro (não vai para a planilha de itens)
  categoria text not null default 'comida' check (categoria in ('comida', 'limpeza', 'outro')),
  supply_id uuid references supplies(id) on delete set null,   -- ligação futura com o insumo
  planilha_linha int,                       -- linha gravada na planilha de itens (null = não foi)
  created_at timestamptz not null default now()
);
create index if not exists idx_compras_itens_compra on compras_itens(compra_id);

-- O painel lembra em que bloco cada item foi lançado, pelo nome como vem no cupom
create table if not exists compras_categorias (
  nome text primary key,                    -- nome normalizado (maiúsculas, sem acento, sem espaço duplo)
  categoria text not null check (categoria in ('comida', 'limpeza', 'outro')),
  atualizado_em timestamptz not null default now()
);

create table if not exists cupom_sessoes (
  id uuid primary key default gen_random_uuid(),
  chave_acesso text,
  url_qrcode text not null,
  cookie text,
  action text,                              -- para onde o formulário da SEFAZ envia
  campos jsonb,                             -- __VIEWSTATE e companhia
  html text,                                -- página da nota, guardada para conferir o leitor
  created_at timestamptz not null default now()
);

alter table compras enable row level security;
alter table compras_itens enable row level security;
alter table compras_categorias enable row level security;
alter table cupom_sessoes enable row level security;

drop policy if exists compras_painel on compras;
create policy compras_painel on compras for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists compras_itens_painel on compras_itens;
create policy compras_itens_painel on compras_itens for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists compras_categorias_painel on compras_categorias;
create policy compras_categorias_painel on compras_categorias for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- cupom_sessoes: nenhuma policy = só a service_role (a função) lê e escreve

-- Planilhas de destino: cópias de teste por enquanto; trocar pelas de produção aqui, sem deploy
insert into settings (key, value) values
  ('planilha_itens_id', '10IC8FKKKhWccRAZFGUxAalZ0OAB_d8VUhKrbCW8KupQ'),
  ('planilha_totais_id', '1mx5ZvjM6UGhIKRTkPAMz2FKg4YeHzg_4xXBIJZh2QzM'),
  ('planilha_totais_aba', '2026')
on conflict (key) do nothing;

-- sessões velhas não servem para nada (a SEFAZ expira em ~20 min)
create or replace function limpar_cupom_sessoes() returns void
language sql security definer set search_path = public as $$
  delete from cupom_sessoes where created_at < now() - interval '2 hours';
$$;
