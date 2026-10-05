-- Salgados e doces finos (linha Gourmet) lançados pelo painel (05/10/2026).
--
-- No site o pedido Gourmet continua pelo WhatsApp (página /gourmet). Para a loja lançar o pedido
-- no painel, cada peça vira um produto vendido por unidade, com preço de cartão (price) e de
-- Pix/dinheiro (cash_price), numa categoria desligada no site. `so_painel` tira o produto do
-- cardápio do site (inclusive da aba "Todos", que não olha a categoria).

alter table products add column if not exists so_painel boolean not null default false;

insert into categories (name, slug, sort_order, active)
values ('Gourmet', 'gourmet-painel', 90, false)
on conflict (slug) do nothing;

insert into products (category_id, name, description, price, cash_price, sort_order, active, so_painel)
select c.id, v.nome, v.descricao, v.cartao, v.avista,
       v.ordem, true, true
  from categories c,
       (values
  ('Quiche de tomate confit', 'Massa sablée com creme de mussarela de búfala, tomate confit e manjericão fresco.', 1.78, 1.54, 1, 'salgada'),
  ('Quiche de frango cremoso', 'Massa sablée com recheio de frango cremoso, coberto por ervas frescas e azeite.', 0.5, 0.43, 2, 'salgada'),
  ('Quiche de camarão', 'Massa sablée com creme de mussarela de búfala e camarão alho e óleo.', 1.88, 1.63, 3, 'salgada'),
  ('Quiche sertanejo', 'Massa sablée com carne de sol, queijo coalho, requeijão, nata, coentro e pimenta biquinho.', 1.13, 0.98, 4, 'salgada'),
  ('Empada de frango clássica', 'Massa sablée com recheio de frango cremoso, coberta por ervas frescas.', 0.43, 0.37, 5, 'salgada'),
  ('Tartelete de frutas frescas', 'Massa sablée com creme pâtissière, kiwi, morango e manga picados.', 0.85, 0.74, 6, 'doce'),
  ('Empada de doce de leite', 'Empada de massa sablée com doce de leite.', 0.7, 0.61, 7, 'doce'),
  ('Choux au craquelin', 'Massa choux com casquinha de craquelin, recheada com creme pâtissière.', 0.3, 0.26, 8, 'doce'),
  ('Carolina', 'Massa choux recheada com doce de leite e coberta com chocolate meio amargo.', 1.28, 1.11, 9, 'doce'),
  ('Cannoli tradicional', 'Recheado com creme de ricota, cream cheese e cerejas.', 2.58, 2.24, 10, 'doce')
       ) as v(nome, descricao, cartao, avista, ordem, tipo)
 where c.slug = 'gourmet-painel'
   and not exists (select 1 from products p where p.name = v.nome and p.so_painel);
