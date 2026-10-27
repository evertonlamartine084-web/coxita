-- Custo fixo por unidade, rateado das despesas fixas da planilha (27/10/2026).
--
-- A função custo-fixo (supabase/functions/custo-fixo) lê o bloco "Despesas fixas" das abas dos
-- dois meses fechados anteriores na planilha "Insumos e despesas fixas", tira a média do mês e
-- chama aplicar_custo_fixo, que divide pelas unidades vendidas no último mês fechado (salgados,
-- doces e pastéis, fritos e congelados; refrigerante e gourmet não contam) e grava em
-- pricing_params.fixed_cost_per_unit. Com menos de 2.000 unidades no mês não mexe.
--
-- Os produtos de sabor deixam de ter custo fixo próprio (era zero) e passam a usar o rateado;
-- refrigerante continua zero.
--
-- A conta fica em pricing_params.custo_fixo_conta, e não em settings, porque settings tem leitura
-- pública e custo não é assunto do cliente.

alter table pricing_params add column if not exists custo_fixo_conta jsonb;

create or replace function aplicar_custo_fixo(p_despesas_mes numeric, p_detalhe jsonb default '{}')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_mes_atual timestamp := date_trunc('month', now() at time zone 'America/Fortaleza');
  v_ini timestamptz := (v_mes_atual - interval '1 month') at time zone 'America/Fortaleza';
  v_fim timestamptz := v_mes_atual at time zone 'America/Fortaleza';
  v_unidades numeric;
  v_por_unidade numeric;
  v_conta jsonb;
begin
  select sum(oif.quantity)
    into v_unidades
    from order_item_flavors oif
    join order_items oi on oi.id = oif.order_item_id
    join orders o on o.id = oi.order_id
   where o.status <> 'cancelado'
     and o.created_at >= v_ini and o.created_at < v_fim;

  v_conta := jsonb_build_object(
    'em', now(),
    'despesas_mes', p_despesas_mes,
    'unidades', coalesce(v_unidades, 0),
    'mes_das_unidades', to_char(v_ini at time zone 'America/Fortaleza', 'MM/YYYY'),
    'detalhe', p_detalhe
  );

  if coalesce(v_unidades, 0) < 2000 or coalesce(p_despesas_mes, 0) <= 0 then
    update pricing_params
       set custo_fixo_conta = v_conta || jsonb_build_object('mantido', true)
     where id;
    return v_conta || jsonb_build_object('mantido', true);
  end if;

  v_por_unidade := round(p_despesas_mes / v_unidades, 4);
  update pricing_params
     set fixed_cost_per_unit = v_por_unidade,
         custo_fixo_conta = v_conta || jsonb_build_object('por_unidade', v_por_unidade),
         updated_at = now()
   where id;
  return v_conta || jsonb_build_object('por_unidade', v_por_unidade);
end $$;

revoke all on function aplicar_custo_fixo(numeric, jsonb) from public, anon, authenticated;

-- Chamada do pg_cron: a função do Supabase lê a planilha e devolve para aplicar_custo_fixo.
create or replace function pedir_custo_fixo() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_segredo text;
  v_anon text;
begin
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'emissao_nota_segredo';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'supabase_anon_key';
  if v_segredo is null or v_anon is null then
    raise warning 'custo fixo sem segredos no vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://ruehnwnihmysycrpddgy.supabase.co/functions/v1/custo-fixo',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-emissao-interna', v_segredo
    ),
    timeout_milliseconds := 60000
  );
end $$;

revoke all on function pedir_custo_fixo() from public, anon, authenticated;

-- Produtos de sabor passam a usar o custo fixo rateado.
update products set custo_fixo_unidade = null where flavor_group is not null;

-- Ponto de partida, até o primeiro dia 1: média de setembro e outubro (R$ 1.470,16 e R$ 510,21,
-- sem os percentuais de tarifa e imposto) sobre as 14.370 unidades de outubro até hoje.
update pricing_params
   set fixed_cost_per_unit = 0.0689,
       custo_fixo_conta = jsonb_build_object(
         'em', now(), 'despesas_mes', 990.19, 'unidades', 14370, 'mes_das_unidades', '10/2026 (até 27/10)',
         'por_unidade', 0.0689, 'inicial', true),
       updated_at = now()
 where id;

-- Todo dia 1, às 6h de Natal (9h UTC), depois do óleo.
select cron.unschedule(jobid) from cron.job where jobname = 'custo-fixo';
select cron.schedule('custo-fixo', '5 9 1 * *', 'select pedir_custo_fixo()');
