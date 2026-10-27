-- Conversa de número escondido (@lid): o WhatsApp não manda nem nome nem telefone. Mas as
-- mensagens automáticas da loja nessa conversa têm o código do pedido ("código *AB12*") ou o
-- link de acompanhamento (/acompanhar/<token>), e o pedido tem nome e telefone. Sem pedido, o
-- primeiro nome da saudação ("Oi, Andreza!", "Obrigado por pedir na Coxelli, Carol!") serve de nome.
create or replace function zap_vincular_conversas_por_pedido() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in
    select distinct on (c.chave) c.chave, c.nome, o.customer_name, o.customer_phone
      from zap_conversas c
      join zap_mensagens m on m.conversa = c.chave and m.de_mim
      join orders o on (o.codigo_cliente is not null and m.texto ilike '%*' || o.codigo_cliente || '*%')
                    or (o.public_token is not null and m.texto like '%/acompanhar/' || o.public_token || '%')
     where c.telefone is null
     order by c.chave, o.created_at desc
  loop
    update zap_conversas
       set nome = coalesce(nome, r.customer_name),
           telefone = case
             when length(regexp_replace(coalesce(r.customer_phone, ''), '\D', '', 'g')) in (10, 11)
               then '55' || regexp_replace(r.customer_phone, '\D', '', 'g') end
     where chave = r.chave;
    n := n + 1;
  end loop;

  update zap_conversas c set nome = s.nome
    from (
      select distinct on (m.conversa) m.conversa,
             coalesce(substring(m.texto from '^Oi, ([^!,]{2,30})!'),
                      substring(m.texto from 'Obrigado por pedir na Coxelli, ([^!,]{2,30})!')) as nome
        from zap_mensagens m
       where m.de_mim and (m.texto ~ '^Oi, [^!,]{2,30}!' or m.texto ~ 'Obrigado por pedir na Coxelli, [^!,]{2,30}!')
       order by m.conversa, m.criada_em desc
    ) s
   where c.chave = s.conversa and c.nome is null and s.nome is not null;
  return n;
end $$;
