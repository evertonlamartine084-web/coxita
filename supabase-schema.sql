-- ========================================
-- COXITA - Supabase Database Schema
-- ========================================

-- 1. CATEGORIES
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_categories_slug on categories(slug);
create index idx_categories_active on categories(active);

-- 2. PRODUCTS
create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text,
  price decimal(10,2) not null,
  image_url text,
  active boolean default true,
  featured boolean default false,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_products_category on products(category_id);
create index idx_products_active on products(active);
create index idx_products_featured on products(featured);

-- 3. ORDERS
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number serial unique,
  customer_name text not null,
  customer_phone text not null,
  delivery_type text not null check (delivery_type in ('entrega', 'retirada')),
  address text,
  neighborhood text,
  address_number text,
  address_complement text,
  address_reference text,
  notes text,
  payment_method text not null check (payment_method in ('dinheiro', 'pix', 'credito', 'debito')),
  change_for decimal(10,2),
  subtotal decimal(10,2) not null,
  delivery_fee decimal(10,2) default 0,
  discount decimal(10,2) default 0,
  coupon_code text,
  total decimal(10,2) not null,
  status text not null default 'pendente' check (status in ('pendente', 'em_preparo', 'saiu_entrega', 'entregue', 'cancelado')),
  scheduled_for timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_orders_status on orders(status);
create index idx_orders_created on orders(created_at desc);

-- 4. ORDER ITEMS
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade not null,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  quantity int not null,
  unit_price decimal(10,2) not null,
  total_price decimal(10,2) not null
);

create index idx_order_items_order on order_items(order_id);

-- 5. SETTINGS (key-value store)
create table settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Default settings
insert into settings (key, value) values
  ('store_name', 'Coxita'),
  ('logo_url', ''),
  ('whatsapp', ''),
  ('address', ''),
  ('opening_hours', 'Seg-Sex: 11h-21h | Sáb-Dom: 11h-22h'),
  ('delivery_fee', '5.00'),
  ('min_order', '15.00'),
  ('pix_key', ''),
  ('pix_name', 'Coxita Ltda');

-- Default categories
insert into categories (name, slug, sort_order) values
  ('Coxinhas Tradicionais', 'tradicionais', 1),
  ('Especiais', 'especiais', 2),
  ('Combos', 'combos', 3),
  ('Bebidas', 'bebidas', 4),
  ('Extras', 'extras', 5);

-- 6. COUPONS
create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value decimal(10,2) not null,
  min_order decimal(10,2) default 0,
  max_uses int,
  used_count int default 0,
  active boolean default true,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create index idx_coupons_code on coupons(code);

-- 7. REVIEWS
create table reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade not null unique,
  order_number int not null,
  customer_name text not null,
  rating int not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz default now()
);

create index idx_reviews_order on reviews(order_id);
create index idx_reviews_rating on reviews(rating);

-- ========================================
-- ROW LEVEL SECURITY
-- ========================================

alter table categories enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table settings enable row level security;
alter table coupons enable row level security;
alter table reviews enable row level security;

-- Public read for categories, products, settings
create policy "categories_public_read" on categories for select using (true);
create policy "products_public_read" on products for select using (true);
create policy "settings_public_read" on settings for select using (true);

-- Coupons: public read for validation, admin full access
create policy "coupons_public_read" on coupons for select using (true);
create policy "coupons_admin_all" on coupons for all using (auth.role() = 'authenticated');

-- Public access for reviews
create policy "reviews_public_read" on reviews for select using (true);
create policy "reviews_public_insert" on reviews for insert with check (true);

-- Public read for orders and order_items (order tracking)
create policy "orders_public_read" on orders for select using (true);
create policy "order_items_public_read" on order_items for select using (true);

-- Public insert for orders and order_items (customers place orders)
create policy "orders_public_insert" on orders for insert with check (true);
create policy "order_items_public_insert" on order_items for insert with check (true);

-- Authenticated full access (admin)
create policy "categories_admin_all" on categories for all using (auth.role() = 'authenticated');
create policy "products_admin_all" on products for all using (auth.role() = 'authenticated');
create policy "orders_admin_all" on orders for all using (auth.role() = 'authenticated');
create policy "order_items_admin_all" on order_items for all using (auth.role() = 'authenticated');
create policy "settings_admin_all" on settings for all using (auth.role() = 'authenticated');
create policy "reviews_admin_all" on reviews for all using (auth.role() = 'authenticated');

-- ========================================
-- STORAGE BUCKET FOR PRODUCT IMAGES
-- ========================================
-- Run in Supabase Dashboard > Storage:
-- Create bucket: "products" (public)

-- Or via SQL:
insert into storage.buckets (id, name, public) values ('products', 'products', true);

create policy "products_images_public_read"
  on storage.objects for select
  using (bucket_id = 'products');

create policy "products_images_admin_upload"
  on storage.objects for insert
  with check (bucket_id = 'products' and auth.role() = 'authenticated');

create policy "products_images_admin_update"
  on storage.objects for update
  using (bucket_id = 'products' and auth.role() = 'authenticated');

create policy "products_images_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'products' and auth.role() = 'authenticated');

-- ========================================
-- FUNCTION: Update updated_at on changes
-- ========================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger categories_updated_at before update on categories
  for each row execute function update_updated_at();

create trigger products_updated_at before update on products
  for each row execute function update_updated_at();

create trigger orders_updated_at before update on orders
  for each row execute function update_updated_at();

create trigger settings_updated_at before update on settings
  for each row execute function update_updated_at();
