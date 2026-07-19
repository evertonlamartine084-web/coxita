-- ============================================================
-- COXELLI - Centos de salgados montados por sabor + bebidas
--
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- E idempotente: pode rodar mais de uma vez sem duplicar nada.
--
-- Modelo:
--   Um produto com `pack_size` preenchido (25, 50, 75, 100) e um PACOTE.
--   O cliente distribui exatamente `pack_size` unidades entre os sabores,
--   sempre em multiplos de 25 (ver PASSO_SABOR em src/utils/pacote.js).
--   Preco e fixo por pacote, nao muda conforme o sabor escolhido.
--   Um produto com `pack_size` nulo (refrigerante) e vendido normalmente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Estrutura
-- ------------------------------------------------------------

-- Tamanho do pacote. Nulo = produto avulso (bebidas).
alter table products add column if not exists pack_size int;

alter table products drop constraint if exists products_pack_size_multiplo_de_25;
alter table products add constraint products_pack_size_multiplo_de_25
  check (pack_size is null or (pack_size > 0 and pack_size % 25 = 0));

comment on column products.pack_size is
  'Unidades que o cliente distribui entre sabores, em multiplos de 25. Nulo = produto avulso.';

-- Sabores disponiveis para montar os pacotes.
create table if not exists flavors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  image_url text,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- para bancos criados antes desta coluna existir
alter table flavors add column if not exists image_url text;

create index if not exists idx_flavors_active on flavors(active);

-- Sabores escolhidos dentro de um item do pedido.
-- flavor_name e desnormalizado de proposito: se o sabor for renomeado ou
-- apagado depois, o pedido antigo continua legivel -- mesma razao pela qual
-- order_items ja guarda product_name.
create table if not exists order_item_flavors (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid references order_items(id) on delete cascade not null,
  flavor_id uuid references flavors(id) on delete set null,
  flavor_name text not null,
  -- Sabores sao escolhidos de 25 em 25.
  quantity int not null check (quantity > 0 and quantity % 25 = 0)
);

create index if not exists idx_order_item_flavors_item on order_item_flavors(order_item_id);

-- ------------------------------------------------------------
-- 2. Seguranca (mesmo padrao das outras tabelas)
-- ------------------------------------------------------------

alter table flavors enable row level security;
alter table order_item_flavors enable row level security;

drop policy if exists "flavors_public_read" on flavors;
create policy "flavors_public_read" on flavors for select using (true);

drop policy if exists "flavors_admin_all" on flavors;
create policy "flavors_admin_all" on flavors for all using (auth.role() = 'authenticated');

drop policy if exists "order_item_flavors_public_read" on order_item_flavors;
create policy "order_item_flavors_public_read" on order_item_flavors for select using (true);

drop policy if exists "order_item_flavors_public_insert" on order_item_flavors;
create policy "order_item_flavors_public_insert" on order_item_flavors for insert with check (true);

drop policy if exists "order_item_flavors_admin_all" on order_item_flavors;
create policy "order_item_flavors_admin_all" on order_item_flavors for all using (auth.role() = 'authenticated');

drop trigger if exists flavors_updated_at on flavors;
create trigger flavors_updated_at before update on flavors
  for each row execute function update_updated_at();

-- ------------------------------------------------------------
-- 3. Categorias
-- ------------------------------------------------------------

insert into categories (name, slug, sort_order) values
  ('Centos de Salgados', 'centos', 1),
  ('Bebidas', 'bebidas', 2)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

-- ------------------------------------------------------------
-- 4. Sabores
-- ------------------------------------------------------------

insert into flavors (name, description, sort_order) values
  ('Coxinha de frango',              'A classica, desfiada e temperada',     1),
  ('Coxinha de frango com catupiry', 'Recheio cremoso de catupiry',          2),
  ('Baiaozinho de camarao',          'Camarao selecionado, receita da casa', 3),
  ('Kibe',                           'Carne com trigo e hortela',            4),
  ('Risole de carne',                'Carne moida temperada',                5),
  ('Risole de frango',               'Frango cremoso',                       6),
  ('Enroladinho de salsicha',        'Massa leve com salsicha',              7),
  ('Bolinha de queijo',              'Queijo derretido por dentro',          8),
  ('Croquete de carne',              'Carne desfiada e empanada',            9),
  ('Empada de frango',               'Massa amanteigada',                   10),
  ('Pastelzinho de carne',           'Frito na hora',                       11),
  ('Pastelzinho de queijo',          'Frito na hora',                       12)
on conflict (name) do update set
  description = excluded.description,
  sort_order  = excluded.sort_order,
  active      = true;

-- ------------------------------------------------------------
-- 5. Produtos
--
-- ATENCAO: os precos abaixo sao chute. Ajuste no painel antes de publicar.
-- ------------------------------------------------------------

-- `products` nao tem constraint unica em name, entao `on conflict` nao
-- protegeria contra duplicata: o `where not exists` e o que torna o seed
-- seguro para rodar de novo.

-- Pacotes de salgados. Sabores escolhidos de 25 em 25, entao o cento aceita
-- ate 4 sabores, o de 75 ate 3, e assim por diante.
insert into products (category_id, name, description, price, pack_size, featured, sort_order)
select c.id, p.name, p.description, p.price, p.pack_size, p.featured, p.sort_order
from (values
  ('Cento de Salgados',      'Monte seu cento: 100 salgados, ate 4 sabores (25 em 25).', 90.00::decimal, 100, true,  1),
  ('75 Salgados',            'Monte seu pacote: 75 salgados, ate 3 sabores.',            70.00::decimal,  75, false, 2),
  ('Meio Cento de Salgados', 'Monte seu meio cento: 50 salgados, ate 2 sabores.',        50.00::decimal,  50, true,  3),
  ('25 Salgados',            'Ideal para reunioes menores: 25 salgados de um sabor.',    28.00::decimal,  25, false, 4)
) as p(name, description, price, pack_size, featured, sort_order)
cross join (select id from categories where slug = 'centos') c
where not exists (select 1 from products x where x.name = p.name);

-- Bebidas (pack_size nulo = produto avulso)
insert into products (category_id, name, description, price, sort_order)
select c.id, b.name, b.description, b.price, b.sort_order
from (values
  ('Coca-Cola Lata 350ml',            'Gelada',              6.00::decimal,  1),
  ('Coca-Cola Zero Lata 350ml',       'Gelada, sem acucar',  6.00::decimal,  2),
  ('Guarana Antarctica Lata 350ml',   'Gelada',              5.50::decimal,  3),
  ('Guarana Antarctica Zero 350ml',   'Gelada, sem acucar',  5.50::decimal,  4),
  ('Fanta Laranja Lata 350ml',        'Gelada',              5.50::decimal,  5),
  ('Fanta Uva Lata 350ml',            'Gelada',              5.50::decimal,  6),
  ('Sprite Lata 350ml',               'Gelada',              5.50::decimal,  7),
  ('Coca-Cola 2 Litros',              'Para a mesa toda',   12.00::decimal,  8),
  ('Guarana Antarctica 2 Litros',     'Para a mesa toda',   10.00::decimal,  9),
  ('Agua Mineral 500ml',              'Sem gas',             3.00::decimal, 10)
) as b(name, description, price, sort_order)
cross join (select id from categories where slug = 'bebidas') c
where not exists (select 1 from products x where x.name = b.name);
