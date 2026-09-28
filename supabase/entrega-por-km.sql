-- Taxa de entrega por km (28/09/2026): R$ 2,00 por km pelo caminho de carro, sem mínimo, até 10 km.
--
-- Quem calcula é a função `calcular-entrega` (servidor): ela acha a coordenada do CEP do cliente,
-- mede a rota a partir da loja e grava uma cotação aqui. O checkout manda o id da cotação junto
-- com o pedido, e `criar_pedido` usa a taxa da cotação — não a que veio do navegador. Pedido
-- lançado no painel (usuário logado) continua com a taxa que o atendente informar.

insert into settings (key, value) values
  ('delivery_fee_per_km', '2'),
  ('delivery_max_km', '10'),
  -- porta da loja (Rua José Miranda da Silva, 301), pelo Street View que o dono mandou. O CEP
  -- 59133-302 cai no meio da rua, a uns 600 m daqui, e errava a distância em até 1 km
  ('loja_lat', '-5.7352728'),
  ('loja_lng', '-35.2321784')
on conflict (key) do nothing;

create table if not exists entrega_cotacoes (
  id uuid primary key default gen_random_uuid(),
  cep text not null,
  numero text,
  lat numeric,
  lng numeric,
  km numeric not null,
  taxa numeric not null,
  dentro_area boolean not null,
  -- 'rota' = caminho de carro; 'estimada' = linha reta x 1,35 quando o serviço de rotas falha;
  -- sufixo '-cliente' = coordenada do CEP achada pelo navegador (o servidor é bloqueado pelos serviços)
  metodo text not null,
  criada_em timestamptz not null default now()
);
create index if not exists entrega_cotacoes_cep on entrega_cotacoes (cep, criada_em desc);
-- só a função do servidor (service role) e o criar_pedido (security definer) mexem nesta tabela
alter table entrega_cotacoes enable row level security;

alter table orders add column if not exists delivery_km numeric;

create or replace function public.criar_pedido(p_pedido jsonb, p_itens jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order orders%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_sabor jsonb;
  v_cot entrega_cotacoes%rowtype;
  v_taxa numeric := coalesce((p_pedido->>'delivery_fee')::numeric, 0);
  v_total numeric := (p_pedido->>'total')::numeric;
  v_km numeric := nullif(p_pedido->>'delivery_km', '')::numeric;
begin
  -- Pedido do site com entrega: a taxa é a da cotação do servidor. O total que veio do navegador
  -- já inclui a taxa dele; troca uma pela outra.
  if p_pedido->>'delivery_type' = 'entrega' and coalesce(auth.role(), 'anon') <> 'authenticated' then
    select * into v_cot from entrega_cotacoes
     where id = nullif(p_pedido->>'cotacao_entrega', '')::uuid
       and criada_em > now() - interval '12 hours';
    if not found then
      raise exception 'entrega-sem-cotacao' using hint = 'Calcule a entrega de novo pelo CEP.';
    end if;
    if not v_cot.dentro_area then
      raise exception 'entrega-fora-da-area';
    end if;
    if v_cot.cep <> regexp_replace(coalesce(p_pedido->>'address_cep', ''), '\D', '', 'g') then
      raise exception 'entrega-cep-diferente';
    end if;
    v_total := v_total - v_taxa + v_cot.taxa;
    v_taxa := v_cot.taxa;
    v_km := v_cot.km;
  end if;

  insert into orders (
    customer_name, customer_phone, customer_cpf, delivery_type, address_cep, address, neighborhood,
    address_number, address_complement, address_reference, notes, payment_method,
    change_for, scheduled_for, subtotal, delivery_fee, delivery_km, discount, discount_avista, coupon_code, total
  )
  values (
    p_pedido->>'customer_name', p_pedido->>'customer_phone', nullif(p_pedido->>'customer_cpf',''),
    p_pedido->>'delivery_type',
    p_pedido->>'address_cep', p_pedido->>'address', p_pedido->>'neighborhood',
    p_pedido->>'address_number', p_pedido->>'address_complement', p_pedido->>'address_reference',
    p_pedido->>'notes', p_pedido->>'payment_method',
    (p_pedido->>'change_for')::numeric, (p_pedido->>'scheduled_for')::timestamptz,
    (p_pedido->>'subtotal')::numeric, v_taxa, v_km,
    coalesce((p_pedido->>'discount')::numeric, 0),
    coalesce((p_pedido->>'discount_avista')::numeric, 0),
    p_pedido->>'coupon_code',
    v_total
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    values (
      v_order.id, (v_item->>'product_id')::uuid, v_item->>'product_name',
      (v_item->>'quantity')::int, (v_item->>'unit_price')::numeric, (v_item->>'total_price')::numeric
    )
    returning id into v_item_id;

    for v_sabor in select * from jsonb_array_elements(coalesce(v_item->'flavors', '[]'::jsonb))
    loop
      insert into order_item_flavors (order_item_id, flavor_id, flavor_name, quantity)
      values (v_item_id, (v_sabor->>'flavor_id')::uuid, v_sabor->>'flavor_name', (v_sabor->>'quantity')::int);
    end loop;
  end loop;

  return to_jsonb(v_order);
end;
$function$;
