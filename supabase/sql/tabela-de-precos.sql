-- Tabela de preços do cardápio.
--
-- A cozinha trabalha com uma grade: três faixas de margem (frito 30%, frito
-- 25% e congelado 15%) por três tamanhos (50, 100 e 200), cada célula com o
-- valor do cartão e o do pix. Até aqui essa grade só existia numa planilha, e
-- cada mudança de preço virava um update produto a produto.
--
-- Aqui ela vira dado: o pacote aponta para uma faixa, a grade guarda os
-- valores, e aplicar reescreve o preço de todos os pacotes daquela faixa.
-- O preço continua no produto -- é ele que o site lê --, então um item pode
-- fugir da tabela sem que isso quebre nada.

create table if not exists price_tiers (
  slug        text primary key,
  label       text not null,
  descricao   text,
  sort_order  int not null default 0
);

create table if not exists price_table (
  tier        text not null references price_tiers(slug) on delete cascade,
  pack_size   int  not null,
  price       numeric(10,2) not null check (price > 0),
  cash_price  numeric(10,2) not null check (cash_price > 0),
  updated_at  timestamptz not null default now(),
  primary key (tier, pack_size),
  constraint price_table_cash_menor check (cash_price <= price)
);

alter table products add column if not exists price_tier text
  references price_tiers(slug) on delete set null;

comment on column products.price_tier is
  'Faixa da tabela de preços. Nulo = preço avulso, fora da grade.';

alter table price_tiers enable row level security;
alter table price_table enable row level security;

-- A grade não é segredo, mas quem escreve é o painel.
drop policy if exists "price_tiers legivel" on price_tiers;
create policy "price_tiers legivel" on price_tiers for select using (true);
drop policy if exists "price_tiers admin" on price_tiers;
create policy "price_tiers admin" on price_tiers for all to authenticated using (true) with check (true);

drop policy if exists "price_table legivel" on price_table;
create policy "price_table legivel" on price_table for select using (true);
drop policy if exists "price_table admin" on price_table;
create policy "price_table admin" on price_table for all to authenticated using (true) with check (true);

insert into price_tiers (slug, label, descricao, sort_order) values
  ('frito_30',     'Frito · margem 30%',     'O padrão do cardápio', 1),
  ('frito_25',     'Frito · margem 25%',     'Margem menor, para promoção ou volume', 2),
  ('congelado_15', 'Congelado · margem 15%', 'Cru, para fritar em casa', 3)
on conflict (slug) do update set label = excluded.label,
                                 descricao = excluded.descricao,
                                 sort_order = excluded.sort_order;

insert into price_table (tier, pack_size, price, cash_price) values
  ('frito_30',      50, 17.00, 16.00),
  ('frito_30',     100, 32.00, 30.00),
  ('frito_30',     200, 60.69, 55.69),
  ('frito_25',      50, 16.00, 15.00),
  ('frito_25',     100, 30.00, 28.00),
  ('frito_25',     200, 56.69, 52.69),
  ('congelado_15',  50, 14.49, 13.49),
  ('congelado_15', 100, 27.00, 25.00),
  ('congelado_15', 200, 50.69, 46.69)
on conflict (tier, pack_size) do update set price = excluded.price,
                                            cash_price = excluded.cash_price,
                                            updated_at = now();
