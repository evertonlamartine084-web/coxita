-- Histórico de preço dos insumos, para comparar compra com compra (28/10/2026).
--
-- supplies guarda só o preço de hoje. insumo_precos guarda cada preço pago, já por unidade do
-- insumo (R$ por kg, L ou un), com data e loja: é dele que a tela de Margens tira o "antes", a
-- variação e o mais barato dos últimos 90 dias, e a de Compras o aviso de "veio mais caro".
--
-- Entra por dois caminhos:
--   - compra:   item de compra ligado a um insumo (gatilho em compras_itens, abaixo);
--   - planilha: o que estava na planilha "Insumos e despesas fixas" de setembro e outubro,
--               carregado uma vez (supabase/sql/insumo-precos-planilha.sql). Sem dia nem loja:
--               a data é o 1º do mês.
--
-- E limpa sobras da tela: refrigerante (revenda, saiu da lista de produtos), o recheio de carne de
-- sol que nenhuma ficha usa e as fichas dos pacotes de pastel antigos, que a ficha por sabor
-- substituiu e que contariam o custo em dobro se um deles voltasse.

create table if not exists insumo_precos (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references supplies(id) on delete cascade,
  em date not null,
  preco numeric(12,4) not null check (preco > 0),   -- R$ por unidade do insumo (kg, L, un)
  loja text,
  origem text not null check (origem in ('compra', 'planilha')),
  descricao text,                                    -- como veio escrito: "Req reke minas bisn 1,8kg"
  compra_item_id uuid unique references compras_itens(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create index if not exists idx_insumo_precos_supply on insumo_precos(supply_id, em desc);

alter table insumo_precos enable row level security;
drop policy if exists insumo_precos_painel on insumo_precos;
create policy insumo_precos_painel on insumo_precos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- O gatilho de compra passa a gravar no histórico também (toda compra, não só a mais nova) e a
-- tirar de lá o item que foi desligado do insumo.
create or replace function compras_item_atualizar_insumo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_qtd numeric;
  v_data date;
  v_loja text;
begin
  if new.supply_id is null or coalesce(new.valor_unitario, 0) <= 0 then
    delete from insumo_precos where compra_item_id = new.id;
    return new;
  end if;

  if upper(coalesce(new.unidade, '')) like 'KG%' then
    v_qtd := 1;                                 -- vendido a peso: valor unitário já é o do kg
  else
    select v.quantidade_por_embalagem * multiplo_da_unidade(new.unidade) into v_qtd
      from compras_vinculos v
     where v.chave = normalizar_item_compra(new.nome) and v.supply_id = new.supply_id;
  end if;
  if coalesce(v_qtd, 0) <= 0 then
    return new;
  end if;

  select coalesce(c.emitida_em, c.created_at)::date, coalesce(c.emitente_nome, c.emitente_nome_sefaz)
    into v_data, v_loja
    from compras c where c.id = new.compra_id;

  insert into insumo_precos (supply_id, em, preco, loja, origem, descricao, compra_item_id)
  values (new.supply_id, v_data, round(new.valor_unitario / v_qtd, 4), v_loja, 'compra', new.nome, new.id)
  on conflict (compra_item_id) do update
     set supply_id = excluded.supply_id, em = excluded.em, preco = excluded.preco,
         loja = excluded.loja, descricao = excluded.descricao;

  update supplies s
     set pack_price = round(new.valor_unitario, 2),
         pack_quantity = v_qtd,
         preco_em = v_data,
         preco_origem = 'Compra' || coalesce(' em ' || v_loja, ''),
         updated_at = now()
   where s.id = new.supply_id
     and s.kind = 'insumo'
     and (s.preco_em is null or s.preco_em <= v_data);

  return new;
end $$;

-- As compras que já estão ligadas entram no histórico.
insert into insumo_precos (supply_id, em, preco, loja, origem, descricao, compra_item_id)
select i.supply_id,
       coalesce(c.emitida_em, c.created_at)::date,
       round(i.valor_unitario / case when upper(coalesce(i.unidade, '')) like 'KG%' then 1
                                     else v.quantidade_por_embalagem * multiplo_da_unidade(i.unidade) end, 4),
       coalesce(c.emitente_nome, c.emitente_nome_sefaz), 'compra', i.nome, i.id
  from compras_itens i
  join compras c on c.id = i.compra_id
  left join compras_vinculos v on v.chave = normalizar_item_compra(i.nome) and v.supply_id = i.supply_id
 where i.supply_id is not null
   and coalesce(i.valor_unitario, 0) > 0
   and (upper(coalesce(i.unidade, '')) like 'KG%' or v.quantidade_por_embalagem > 0)
on conflict (compra_item_id) do nothing;

-- Sobras.
delete from product_recipe_items r
 using supplies s
 where r.supply_id = s.id and s.name in ('Coca-Cola lata', 'Fanta ou Sprite lata', 'Refrigerante 1 litro');
delete from supplies where name in ('Coca-Cola lata', 'Fanta ou Sprite lata', 'Refrigerante 1 litro');

delete from supplies s
 where s.name = 'Recheio de carne de sol'
   and not exists (select 1 from supply_recipe_items r where r.child_id = s.id)
   and not exists (select 1 from product_recipe_items r where r.supply_id = s.id);

delete from product_recipe_items r
 using products p, supplies s
 where r.product_id = p.id and r.supply_id = s.id
   and not p.active
   and s.name <> 'Óleo de soja';
