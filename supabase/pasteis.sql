-- ============================================================
-- COXELLI - Pastelzinhos: fotos + aba propria no cardapio
--
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- E idempotente: pode rodar mais de uma vez sem duplicar nada.
--
-- As fotos NAO ficam no Storage: sao arquivos do proprio site, em
-- public/fotos/, servidos pela CDN junto com o resto do bundle. Por isso
-- image_url e um caminho relativo -- ele resolve para o dominio de onde a
-- pagina foi aberta, tanto em producao quanto no `npm run dev`.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Grupo do sabor
--
-- A aba "Pasteis" do cardapio precisa distinguir pastel de coxinha, e o nome
-- nao serve para isso: filtrar por texto quebra no primeiro sabor renomeado.
-- Default 'salgados' para que os sabores que ja existem continuem onde estao.
-- ------------------------------------------------------------

alter table flavors add column if not exists group_slug text not null default 'salgados';

comment on column flavors.group_slug is
  'Aba do cardapio onde o sabor aparece. Hoje: salgados | pasteis.';

create index if not exists idx_flavors_group on flavors(group_slug);

-- ------------------------------------------------------------
-- 2. Os cinco pasteis fotografados
-- ------------------------------------------------------------

insert into flavors (name, description, image_url, group_slug, sort_order, active) values
  ('Pastel de frango',            'Frango desfiado temperado no açafrão',    '/fotos/pastel-frango.webp',          'pasteis', 13, true),
  ('Pastel de carne',             'Carne moída, queijo e cheiro verde',      '/fotos/pastel-carne.webp',           'pasteis', 14, true),
  ('Pastel sertanejo',            'Carne de sol com queijo coalho',          '/fotos/pastel-sertanejo.webp',       'pasteis', 15, true),
  ('Pastel de pizza',             'Presunto, mussarela e orégano',           '/fotos/pastel-pizza.webp',           'pasteis', 16, true),
  ('Pastel de queijo e presunto', 'O clássico, presunto e queijo derretido', '/fotos/pastel-queijo-presunto.webp', 'pasteis', 17, true)
on conflict (name) do update set
  description = excluded.description,
  image_url   = excluded.image_url,
  group_slug  = excluded.group_slug,
  sort_order  = excluded.sort_order,
  active      = excluded.active,
  updated_at  = now();

-- Os dois pastelzinhos genericos saem do cardapio. Eles cobrem os mesmos
-- recheios dos novos ("Pastelzinho de carne" x "Pastel de carne"), sem foto e
-- com descricao generica -- lado a lado, o cliente ve o mesmo pastel duas vezes
-- e nao sabe qual escolher.
--
-- active = false em vez de delete: pedido antigo referencia flavor_id, e apagar
-- a linha deixaria historico sem nome de sabor.
update flavors
   set active = false, updated_at = now()
 where name in ('Pastelzinho de carne', 'Pastelzinho de queijo');

-- Conferencia: os pasteis devem sair com image_url preenchido.
select name, group_slug, image_url, sort_order, active
  from flavors
 order by group_slug, sort_order;
