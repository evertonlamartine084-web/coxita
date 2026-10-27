-- ============================================================
-- COXELLI - Foto do recheio na mao ("Olha o recheio", na home)
--
-- Rode depois de pasteis.sql. E idempotente.
--
-- Por que uma coluna nova em vez de trocar image_url: sao duas fotos com
-- funcoes diferentes. No cardapio o pastel aparece no prato, inteiro, para
-- mostrar o produto; na home aparece partido e na mao, para dar vontade.
-- Guardar so uma perderia metade do trabalho de foto.
-- ============================================================

alter table flavors add column if not exists image_closeup_url text;

comment on column flavors.image_closeup_url is
  'Foto do recheio aberto, na mao. Usada na faixa de destaque da home.';

update flavors set image_closeup_url = v.url, updated_at = now()
  from (values
    ('Pastel de frango',            '/fotos/pastel-frango-mao.webp'),
    ('Pastel de carne',             '/fotos/pastel-carne-mao.webp'),
    ('Pastel sertanejo',            '/fotos/pastel-sertanejo-mao.webp'),
    ('Pastel de pizza',             '/fotos/pastel-pizza-mao.webp'),
    ('Pastel de queijo e presunto', '/fotos/pastel-queijo-presunto-mao.webp')
  ) as v(nome, url)
 where flavors.name = v.nome;

-- Conferencia: as cinco linhas com as duas fotos preenchidas.
select name, image_url, image_closeup_url
  from flavors
 where image_closeup_url is not null
 order by sort_order;
