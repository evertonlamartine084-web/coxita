-- Código curto que o CLIENTE vê, no lugar do número sequencial.
--
-- `order_number` conta quantos pedidos a loja já fez: mostrar "#3" para o cliente entrega o
-- tamanho da operação. Ele continua existindo e é o que a cozinha usa — só deixa de aparecer
-- para quem compra.
--
-- Alfabeto sem 0/O e 1/I/L: o cliente vai ditar esse código no WhatsApp ou no telefone, e
-- confundir zero com ó gera pedido errado. Sobram 32 letras e dígitos; 4 posições dão ~1 milhão
-- de combinações, de sobra para o volume de uma loja.

create or replace function gerar_codigo_cliente()
returns text
language plpgsql
as $$
declare
  alfabeto text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidato text;
  tentativas int := 0;
begin
  loop
    candidato := '';
    for i in 1..4 loop
      candidato := candidato || substr(alfabeto, floor(random() * length(alfabeto) + 1)::int, 1);
    end loop;

    exit when not exists (select 1 from orders where codigo_cliente = candidato);

    tentativas := tentativas + 1;
    -- com a base cheia, 4 posições podem colidir sempre; aí cresce para 5 em vez de travar
    if tentativas > 20 then
      candidato := candidato || substr(alfabeto, floor(random() * length(alfabeto) + 1)::int, 1);
      exit;
    end if;
  end loop;

  return candidato;
end;
$$;

alter table orders add column if not exists codigo_cliente text;

update orders set codigo_cliente = gerar_codigo_cliente() where codigo_cliente is null;

alter table orders alter column codigo_cliente set default gerar_codigo_cliente();
alter table orders alter column codigo_cliente set not null;

create unique index if not exists idx_orders_codigo_cliente on orders (codigo_cliente);
