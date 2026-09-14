-- Preço por sabor, por tamanho de pacote.
--
-- Nos salgados todo sabor custa igual e o preço mora no pacote. Nos pastéis
-- não: cada recheio tem o seu, e o cliente monta 25 de um e 25 de outro. O
-- pacote passa a valer a soma proporcional do que tem dentro --
-- 25 de queijo e presunto num pacote de 50 entram com metade do preço de 50
-- daquele sabor.
--
-- Por que (sabor, tamanho) e não preço por unidade: a escala não é linear.
-- Queijo e presunto sai a R$ 0,49/un no pacote de 50, R$ 0,47 no de 100 e
-- R$ 0,45 no de 200 -- guardar só o preço unitário apagaria o desconto de
-- volume, que é justamente o que faz o cliente levar mais.
create table if not exists flavor_prices (
  flavor_id   uuid not null references flavors(id) on delete cascade,
  pack_size   int  not null,
  price       numeric(10,2) not null check (price > 0),
  cash_price  numeric(10,2) not null check (cash_price > 0),
  updated_at  timestamptz not null default now(),
  primary key (flavor_id, pack_size),
  constraint flavor_prices_cash_menor check (cash_price <= price)
);

alter table flavor_prices enable row level security;

drop policy if exists "flavor_prices legivel" on flavor_prices;
create policy "flavor_prices legivel" on flavor_prices for select using (true);
drop policy if exists "flavor_prices admin" on flavor_prices;
create policy "flavor_prices admin" on flavor_prices for all to authenticated using (true) with check (true);

-- Queijo e presunto, linha de 30%. Os outros quatro sabores entram quando a
-- cozinha passar a tabela de cada um.
insert into flavor_prices (flavor_id, pack_size, price, cash_price)
select f.id, v.pack_size, v.price, v.cash_price
  from flavors f
  join (values (50, 24.49, 22.49), (100, 47.00, 43.00), (200, 90.69, 82.69))
         as v(pack_size, price, cash_price) on true
 where f.name = 'Pastel de queijo e presunto'
on conflict (flavor_id, pack_size) do update
  set price = excluded.price, cash_price = excluded.cash_price, updated_at = now();
