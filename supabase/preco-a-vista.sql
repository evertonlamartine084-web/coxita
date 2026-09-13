-- Preço à vista por produto.
--
-- Até aqui o desconto de pix/dinheiro era um percentual único sobre o subtotal.
-- Isso não reproduz a tabela de preços da cozinha: lá cada tamanho tem o seu
-- valor à vista, calculado pela margem e não como desconto do preço cheio --
-- R$ 17,00 vira R$ 15,79 (7,1%), R$ 32,00 vira R$ 29,59 (7,5%) e R$ 60,59 vira
-- R$ 55,69 (8,1%). Percentual nenhum acerta os três.
--
-- Nulo mantém o comportamento antigo: quem não tem preço próprio segue no
-- percentual de `settings.desconto_avista_percent`.
alter table products add column if not exists cash_price numeric(10,2);

comment on column products.cash_price is
  'Preço no pix/dinheiro. Nulo = usa o percentual das settings.';

alter table products drop constraint if exists products_cash_price_check;
alter table products add constraint products_cash_price_check
  check (cash_price is null or (cash_price > 0 and cash_price <= price));

-- A funcao que recalcula o pedido quando o admin mexe nos itens passa a somar
-- item a item: quem tem `cash_price` desconta a diferenca dele, e o resto cai
-- no percentual. Antes ela aplicava o percentual sobre o subtotal inteiro, o
-- que voltaria a inventar centavos justamente na tela onde o pedido e gravado.
create or replace function editar_itens_pedido_desconto_avista(
  p_order_id uuid,
  p_subtotal numeric,
  p_desconto_cupom numeric
) returns numeric
language sql
stable
as $$
  select least(
    round(coalesce(sum(
      case
        when p.cash_price is not null and p.cash_price <= oi.unit_price
          then (oi.unit_price - p.cash_price) * oi.quantity
        else round(oi.unit_price * oi.quantity
                   * coalesce((select value::numeric from settings
                                where key = 'desconto_avista_percent'), 0) / 100, 2)
      end
    ), 0), 2),
    greatest(p_subtotal - p_desconto_cupom, 0)
  )
  from order_items oi
  left join products p on p.id = oi.product_id
  where oi.order_id = p_order_id;
$$;
