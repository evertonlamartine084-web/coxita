-- Óleo de fritura nos pacotes fritos e o doce de soro como o doce de leite do churros (27/10/2026).
--
-- O óleo entra na ficha do PRODUTO frito, por unidade, e não na do sabor: o congelado usa a mesma
-- ficha de sabor e não passa pela fritadeira. Quantidade é estimativa (absorção do salgado mais a
-- reposição da fritadeira) até o dono medir: 2 ml por salgadinho e doce, 3 ml por pastel.

insert into supplies (name, unit, kind, pack_price, pack_quantity, preco_em, preco_origem, note)
values ('Óleo de soja', 'L', 'insumo', 7.49, 0.9, '2026-10-01', 'Planilha de insumos, outubro', 'Garrafa de 900 ml')
on conflict (name) do update
   set pack_price = excluded.pack_price, pack_quantity = excluded.pack_quantity,
       preco_em = excluded.preco_em, preco_origem = excluded.preco_origem, note = excluded.note;

insert into product_recipe_items (product_id, supply_id, quantity)
select p.id, s.id, case when p.flavor_group = 'pasteis' then 0.003 else 0.002 end
  from products p
  join categories c on c.id = p.category_id
  join supplies s on s.name = 'Óleo de soja'
 where p.flavor_group in ('salgados', 'doces', 'pasteis')
   and c.name <> 'Congelados'
on conflict (product_id, supply_id) do update set quantity = excluded.quantity;

-- O churros leva o doce de soro de leite Aurea de 4,8 kg (confirmado pelo dono).
update supplies set note = 'Doce de soro de leite Aurea, balde de 4,8 kg' where name = 'Doce de leite';

insert into compras_vinculos (chave, supply_id, quantidade_por_embalagem)
select normalizar_item_compra('Doce de soro de leite aurea 4,8kg'), id, 4.8 from supplies where name = 'Doce de leite'
on conflict (chave) do update set supply_id = excluded.supply_id, quantidade_por_embalagem = excluded.quantidade_por_embalagem;

update compras_itens i
   set supply_id = v.supply_id
  from compras_vinculos v
 where v.chave = normalizar_item_compra(i.nome)
   and i.supply_id is distinct from v.supply_id;
