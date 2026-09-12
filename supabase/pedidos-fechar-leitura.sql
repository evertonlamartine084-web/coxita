-- PARTE B: fecha a leitura pública de pedidos.
--
-- Só rodar DEPOIS que o site estiver usando as funções da Parte A, senão o cliente perde o
-- acompanhamento de pedido no mesmo instante.

drop policy if exists "orders_public_read" on orders;
drop policy if exists "order_items_public_read" on order_items;
drop policy if exists "order_messages_public_read" on order_messages;
drop policy if exists "order_messages_public_update" on order_messages;
drop policy if exists "orders_public_insert" on orders;
drop policy if exists "order_items_public_insert" on order_items;
drop policy if exists "order_messages_public_insert" on order_messages;
