-- Produto arquivado: fora do cardápio e fora da aba "Fora do cardápio" (28/10/2026).
--
-- A aba tinha 39 produtos, quase todos pacotes de pastel por sabor que a ficha por sabor
-- substituiu e bebidas que nunca venderam. Arquivar e não apagar: dá para trazer de volta, e
-- produto com pedido não pode sumir do histórico.

alter table products add column if not exists arquivado boolean not null default false;

update products p
   set arquivado = true
 where not p.active
   and not exists (select 1 from order_items oi where oi.product_id = p.id);
