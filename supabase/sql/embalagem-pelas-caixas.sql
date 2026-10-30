-- Embalagem pelas caixas compradas (30/10/2026).
--
-- products.custo_embalagem era um número fixo, tirado da planilha em 27/10 (caixa + saco e
-- guardanapo). Agora cada pacote fica ligado à caixa que leva, e as caixas viram insumos: quando
-- uma compra de caixa entra, o gatilho de compras_itens muda o preço da caixa e este, o custo de
-- embalagem dos pacotes que a usam.
--   - 50 (e 25): caixa 25x25x5;  100: caixa 30x30x5;  200: caixa 35x35x5;
--   - o resto (saco, guardanapo) continua fixo em embalagem_extra: 0,63 / 1,26 / 2,52.
-- Congelado vai em saco (0,19 a cada 50) e fica de fora.

alter table products add column if not exists embalagem_supply_id uuid references supplies(id) on delete set null;
alter table products add column if not exists embalagem_extra numeric(10,2) not null default 0;

insert into supplies (name, unit, kind, pack_price, pack_quantity, preco_em, preco_origem, note)
select v.nome, 'un', 'insumo', v.preco, 1, v.em::date, v.origem, 'Caixa do pacote: entra no custo de embalagem'
  from (values
    ('Caixa 25x25x5', 2.90, '2026-09-01', 'Planilha de insumos, setembro'),
    ('Caixa 30x30x5', 3.67, '2026-10-01', 'Planilha de insumos, outubro'),
    ('Caixa 35x35x5', 4.16, '2026-09-01', 'Planilha de insumos, setembro')
  ) as v(nome, preco, em, origem)
 where not exists (select 1 from supplies s where s.name = v.nome);

-- O que a planilha registrou antes das compras pelo painel.
insert into insumo_precos (supply_id, em, preco, loja, origem, descricao)
select s.id, v.em::date, v.preco, 'Seridó Embalagens', 'planilha', v.descricao
  from (values
    ('Caixa 25x25x5', '2026-09-01', 2.90, 'CAIXA SALGADOS LISA BRANCO/PARDO 25X25X5'),
    ('Caixa 30x30x5', '2026-09-01', 3.75, 'CAIXA SALGADOS LISA BRANCO/PARDO 30X30X5'),
    ('Caixa 30x30x5', '2026-10-01', 3.67, 'CAIXA SALGADOS LISA BRANCO/PARDO 30X30X5'),
    ('Caixa 35x35x5', '2026-09-01', 4.16, 'CAIXA SALGADOS LISA BRANCO/PARDO 35X35X5')
  ) as v(insumo, em, preco, descricao)
  join supplies s on s.name = v.insumo
 where not exists (select 1 from insumo_precos h where h.supply_id = s.id and h.em = v.em::date and h.origem = 'planilha');

-- Cada pacote com a sua caixa.
update products p
   set embalagem_supply_id = s.id,
       embalagem_extra = case p.pack_size when 25 then 0.63 when 50 then 0.63 when 100 then 1.26 when 200 then 2.52 end
  from supplies s
 where p.flavor_group is not null
   and p.pack_size in (25, 50, 100, 200)
   and p.name not ilike '%congelad%'
   and s.name = case p.pack_size when 25 then 'Caixa 25x25x5' when 50 then 'Caixa 25x25x5'
                                 when 100 then 'Caixa 30x30x5' when 200 then 'Caixa 35x35x5' end;

-- Preço da caixa mudou: refaz o custo de embalagem de quem usa ela.
create or replace function embalagem_pela_caixa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update products p
     set custo_embalagem = round(coalesce(new.pack_price / nullif(new.pack_quantity, 0), 0) + p.embalagem_extra, 2)
   where p.embalagem_supply_id = new.id;
  return new;
end $$;

drop trigger if exists embalagem_pela_caixa on supplies;
create trigger embalagem_pela_caixa
  after update of pack_price, pack_quantity on supplies
  for each row execute function embalagem_pela_caixa();

-- Nome no cupom da Seridó -> caixa (1 por unidade).
insert into compras_vinculos (chave, supply_id, quantidade_por_embalagem)
select normalizar_item_compra(v.nome), s.id, 1
  from (values
    ('Caixa salgados lisa branco/pardo 25x25x5', 'Caixa 25x25x5'),
    ('Caixa salgados lisa branco/pardo 30x30x5', 'Caixa 30x30x5'),
    ('Caixa salgados lisa branco/pardo 35x35x5', 'Caixa 35x35x5')
  ) as v(nome, insumo)
  join supplies s on s.name = v.insumo
on conflict (chave) do update
   set supply_id = excluded.supply_id, quantidade_por_embalagem = excluded.quantidade_por_embalagem;

-- As caixas já lançadas pegam o vínculo (o gatilho põe o preço na caixa e no histórico, e o de
-- cima, no custo de embalagem).
update compras_itens i
   set supply_id = v.supply_id
  from compras_vinculos v
 where i.supply_id is null
   and v.chave = normalizar_item_compra(i.nome)
   and v.supply_id in (select id from supplies where name like 'Caixa %x%x5');

-- Caixa sem compra pelo painel (a de 25): acerta o custo pelo preço que já tem.
update products p
   set custo_embalagem = round(s.pack_price / nullif(s.pack_quantity, 0) + p.embalagem_extra, 2)
  from supplies s
 where s.id = p.embalagem_supply_id;
