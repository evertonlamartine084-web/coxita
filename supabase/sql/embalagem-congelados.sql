-- Congelado vai em saco para o congelador, não na caixa do frito. O saco custa R$ 0,19 e cabe no
-- máximo 50 salgados: 1 saco no de 50, 2 no de 100, 4 no de 200 (informado pelo dono em 27/10/2026).
update products p
   set custo_embalagem = 0.19 * ceil(p.pack_size / 50.0)
  from categories c
 where c.id = p.category_id and c.name = 'Congelados' and p.pack_size is not null;
