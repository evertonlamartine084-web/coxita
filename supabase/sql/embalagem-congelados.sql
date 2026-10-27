-- Congelado vai em saco para o congelador, não na caixa do frito: R$ 0,19 por pacote, qualquer
-- tamanho (informado pelo dono em 27/10/2026).
update products p
   set custo_embalagem = 0.19
  from categories c
 where c.id = p.category_id and c.name = 'Congelados';
