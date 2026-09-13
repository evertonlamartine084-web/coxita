-- Estoque de salgado pronto, por sabor.
--
-- A cozinha frita e congela em lote, e o que sai do freezer é unidade de
-- sabor, não pacote: um cento de 50 coxinhas e 50 kibes tira 50 de cada. Por
-- isso o estoque mora no sabor.
--
-- Duas tabelas, e não uma coluna com o saldo: `stock_moves` guarda cada
-- entrada e cada baixa com o motivo, e o saldo em `flavor_stock` é o
-- acumulado. Sem o histórico, um número errado no freezer não teria como ser
-- explicado -- e número de estoque sempre diverge uma hora.

create table if not exists flavor_stock (
  flavor_id   uuid primary key references flavors(id) on delete cascade,
  quantidade  int not null default 0,
  minimo      int not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists stock_moves (
  id          uuid primary key default gen_random_uuid(),
  flavor_id   uuid not null references flavors(id) on delete cascade,
  delta       int  not null,
  motivo      text not null check (motivo in ('producao', 'pedido', 'cancelamento', 'ajuste', 'perda')),
  order_id    uuid references orders(id) on delete set null,
  observacao  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_stock_moves_flavor on stock_moves(flavor_id, created_at desc);
create index if not exists idx_stock_moves_order  on stock_moves(order_id);

alter table flavor_stock enable row level security;
alter table stock_moves  enable row level security;

-- Saldo é público (o site pode querer esconder sabor que acabou); escrita é do painel.
drop policy if exists "flavor_stock legivel" on flavor_stock;
create policy "flavor_stock legivel" on flavor_stock for select using (true);
drop policy if exists "flavor_stock admin" on flavor_stock;
create policy "flavor_stock admin" on flavor_stock for all to authenticated using (true) with check (true);

drop policy if exists "stock_moves admin" on stock_moves;
create policy "stock_moves admin" on stock_moves for all to authenticated using (true) with check (true);

-- Um movimento é a única porta de entrada: escrever o saldo direto deixaria o
-- histórico mentindo.
create or replace function registrar_movimento_estoque(
  p_flavor_id  uuid,
  p_delta      int,
  p_motivo     text,
  p_order_id   uuid default null,
  p_observacao text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo int;
begin
  if p_delta = 0 then
    return (select quantidade from flavor_stock where flavor_id = p_flavor_id);
  end if;

  insert into stock_moves (flavor_id, delta, motivo, order_id, observacao)
  values (p_flavor_id, p_delta, p_motivo, p_order_id, p_observacao);

  insert into flavor_stock (flavor_id, quantidade, updated_at)
  values (p_flavor_id, p_delta, now())
  on conflict (flavor_id) do update
    set quantidade = flavor_stock.quantidade + excluded.quantidade,
        updated_at = now()
  returning quantidade into v_saldo;

  return v_saldo;
end;
$$;

-- Baixa automática: o sabor escolhido é por pacote, e o item pode ter mais de
-- um pacote -- 2 centos de 50 coxinhas tiram 100 coxinhas do freezer.
create or replace function baixar_estoque_do_pedido() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pacotes int;
  v_order   uuid;
begin
  select oi.quantity, oi.order_id into v_pacotes, v_order
    from order_items oi where oi.id = new.order_item_id;

  perform registrar_movimento_estoque(
    new.flavor_id, -(new.quantity * coalesce(v_pacotes, 1)), 'pedido', v_order);

  return new;
end;
$$;

drop trigger if exists trg_baixar_estoque on order_item_flavors;
create trigger trg_baixar_estoque
  after insert on order_item_flavors
  for each row execute function baixar_estoque_do_pedido();

-- Cancelou, volta para o freezer: o salgado não foi entregue.
create or replace function devolver_estoque_do_pedido() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelado' and coalesce(old.status, '') <> 'cancelado' then
    insert into stock_moves (flavor_id, delta, motivo, order_id)
    select m.flavor_id, -sum(m.delta), 'cancelamento', new.id
      from stock_moves m
     where m.order_id = new.id and m.motivo = 'pedido'
     group by m.flavor_id
    having sum(m.delta) <> 0;

    update flavor_stock fs
       set quantidade = fs.quantidade + devolvido.total,
           updated_at = now()
      from (select flavor_id, -sum(delta) as total
              from stock_moves
             where order_id = new.id and motivo = 'pedido'
             group by flavor_id) as devolvido
     where fs.flavor_id = devolvido.flavor_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_devolver_estoque on orders;
create trigger trg_devolver_estoque
  after update of status on orders
  for each row execute function devolver_estoque_do_pedido();

-- Todo sabor ativo começa zerado, para aparecer na tela desde o primeiro dia.
insert into flavor_stock (flavor_id, quantidade)
select id, 0 from flavors where active
on conflict (flavor_id) do nothing;
