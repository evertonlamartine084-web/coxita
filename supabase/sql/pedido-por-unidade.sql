-- Item por unidade, lançado pelo painel (02/10/2026).
--
-- Encomenda de balcão nem sempre fecha de 25 em 25 ("70 churros de doce de
-- leite"). O passo de 25 continua no site (src/utils/pacote.js); o banco passa
-- a aceitar qualquer quantidade positiva, porque o painel grava pelas mesmas
-- funções do site (criar_pedido, editar_itens_pedido).

alter table order_item_flavors drop constraint if exists order_item_flavors_quantity_check;
alter table order_item_flavors add constraint order_item_flavors_quantity_check check (quantity > 0);

-- O preço à vista do produto é do pacote inteiro. Item quebrado (70 de um
-- cento) leva só a fração dele; sem isto, 44,00 > 33,60 jogava o item no
-- percentual e o desconto mudava a cada edição.
create or replace function editar_itens_pedido_desconto_avista(
  p_order_id uuid, p_subtotal numeric, p_desconto_cupom numeric)
returns numeric
language sql
stable
as $$
  with itens as (
    select oi.unit_price, oi.quantity,
           case
             when p.cash_price is null then null
             when p.pack_size > 0 and coalesce(f.unidades, 0) > 0
               then round(p.cash_price * f.unidades / p.pack_size, 2)
             else p.cash_price
           end as cash_price
      from order_items oi
      left join products p on p.id = oi.product_id
      left join (select order_item_id, sum(quantity) as unidades
                   from order_item_flavors group by order_item_id) f
        on f.order_item_id = oi.id
     where oi.order_id = p_order_id
  )
  select least(
    round(coalesce(sum(
      case
        when cash_price is not null and cash_price <= unit_price
          then (unit_price - cash_price) * quantity
        else round(unit_price * quantity
                   * coalesce((select value::numeric from settings
                                where key = 'desconto_avista_percent'), 0) / 100, 2)
      end
    ), 0), 2),
    greatest(p_subtotal - p_desconto_cupom, 0)
  )
  from itens;
$$;
