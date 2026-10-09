-- Origem do pedido (09/10/2026): site, iFood, WhatsApp ou balcão.
--
-- Antes, pedido do iFood era lançado com o cliente "Ifood" e não havia como separar o que veio
-- de cada canal. Agora cada pedido tem a sua origem: o site grava 'site' sozinho (e quem compra
-- não consegue mudar isso), e o painel escolhe entre WhatsApp, balcão e iFood ao lançar.
--
-- Os pedidos que já existiam foram classificados assim:
--   cliente "Ifood"                         -> ifood
--   "Compras anteriores" e vendas lançadas depois (#63 a #74, faturamento manual do dia) -> balcao
--   lançado pelo painel ("Pedido lançado no painel" nas observações) -> whatsapp
--   o resto (sem observação do painel)      -> site

alter table orders add column if not exists canal text;

update orders set canal = case
    when customer_name ilike 'ifood%' then 'ifood'
    when order_number between 63 and 74 and coalesce(notes, '') not ilike '%lançado no painel%' then 'balcao'
    when coalesce(notes, '') ilike '%lançado no painel%' then 'whatsapp'
    else 'site'
  end
 where canal is null;

alter table orders alter column canal set default 'site';
alter table orders alter column canal set not null;
alter table orders drop constraint if exists orders_canal_check;
alter table orders add constraint orders_canal_check check (canal in ('site', 'ifood', 'whatsapp', 'balcao'));

create or replace function public.criar_pedido(p_pedido jsonb, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order orders%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_sabor jsonb;
  v_cot entrega_cotacoes%rowtype;
  v_taxa numeric := coalesce((p_pedido->>'delivery_fee')::numeric, 0);
  v_total numeric := (p_pedido->>'total')::numeric;
  v_km numeric := nullif(p_pedido->>'delivery_km', '')::numeric;
  v_lat numeric;
  v_lng numeric;
  v_quando timestamptz := nullif(p_pedido->>'scheduled_for', '')::timestamptz;
  v_local timestamp;
  v_por_horario int;
  v_antecedencia int;
begin
  -- Entrega pausada pelo painel (settings.entrega_ativa = 'nao'): o site só aceita retirada.
  -- Pedido lançado pela loja (logado) segue livre, para entrega combinada à parte.
  if p_pedido->>'delivery_type' = 'entrega' and coalesce(auth.role(), 'anon') <> 'authenticated'
     and coalesce((select value from settings where key = 'entrega_ativa'), 'sim') = 'nao' then
    raise exception 'entrega-pausada' using hint = 'As entregas estão pausadas. Escolha a retirada.';
  end if;

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
    v_lat := v_cot.lat;
    v_lng := v_cot.lng;

    -- Horário marcado, de 30 em 30 min, como agenda de barbearia (04/10/2026). Cada horário
    -- aceita `entrega_por_horario` entregas; a trava por horário impede dois clientes de
    -- pegarem a última vaga ao mesmo tempo.
    if v_quando is null then
      raise exception 'entrega-sem-horario' using hint = 'Escolha um horário de entrega.';
    end if;
    v_local := v_quando at time zone 'America/Fortaleza';
    select coalesce(nullif(value, '')::int, 30) into v_antecedencia from settings where key = 'entrega_antecedencia_min';
    if extract(minute from v_local) not in (0, 30) or extract(second from v_local) <> 0
       or extract(isodow from v_local) = 7
       or v_local::time < coalesce((select nullif(value, '') from settings where key = 'opening_time'), '13:00')::time
       or v_local::time >= coalesce((select nullif(value, '') from settings where key = 'closing_time'), '18:00')::time
       or v_quando < now() + make_interval(mins => greatest(coalesce(v_antecedencia, 30) - 10, 0))
       or v_quando > now() + interval '8 days' then
      raise exception 'horario-invalido' using hint = 'Esse horário não está disponível. Escolha outro.';
    end if;
    perform pg_advisory_xact_lock(hashtext('entrega:' || v_quando::text));
    select coalesce(nullif(value, '')::int, 1) into v_por_horario from settings where key = 'entrega_por_horario';
    if (select count(*) from orders
         where delivery_type = 'entrega' and status <> 'cancelado' and scheduled_for = v_quando)
       >= coalesce(v_por_horario, 1) then
      raise exception 'horario-ocupado' using hint = 'Esse horário acabou de ser reservado. Escolha outro.';
    end if;
  end if;

  insert into orders (
    customer_name, customer_phone, customer_cpf, delivery_type, address_cep, address, neighborhood,
    address_number, address_complement, address_reference, notes, payment_method,
    change_for, scheduled_for, subtotal, delivery_fee, delivery_km, discount, discount_avista, coupon_code, total,
    entrega_lat, entrega_lng, canal
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
    v_total,
    v_lat, v_lng,
    -- quem compra pelo site não escolhe a origem; o painel diz de onde veio (padrão WhatsApp)
    case when coalesce(auth.role(), 'anon') = 'authenticated'
         then coalesce(nullif(p_pedido->>'canal', ''), 'whatsapp')
         else 'site' end
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
