-- Preço do iFood e lucro real do iFood (09/10/2026).
--
-- O cardápio do iFood tem preço próprio (50 salgados a R$ 23,59, contra R$ 17 no site). O iFood
-- fica com 23% (plano Entrega) + 3,2% (taxa de transação) do valor dos produtos; conferido no
-- relatório de conciliação de outubro, centavo por centavo. Taxa de entrega, taxa de serviço e
-- parcelado são cobrados do cliente e só passam pelo repasse; promoção do iFood é paga por ele.
--
-- products.preco_ifood: preço no cardápio do iFood (nulo = não vende lá). Pacotes maiores que
-- 50 seguem o múltiplo do pacote de 50, que é o que o iFood vende.

alter table products add column if not exists preco_ifood numeric(10,2);
alter table pricing_params add column if not exists ifood_comissao numeric(5,2) not null default 23;
alter table pricing_params add column if not exists ifood_taxa_transacao numeric(5,2) not null default 3.2;

update products p set preco_ifood = v.preco
  from (values
    ('Meio Cento de Salgados', 23.59), ('Cento de Salgados', 47.18), ('200 Salgados', 94.36),
    ('50 Coxinhas de Nutella', 66.00), ('Cento de Coxinhas de Nutella', 132.00), ('200 Coxinhas de Nutella', 264.00),
    ('50 Churros de Doce de Leite', 36.00), ('Cento de Churros de Doce de Leite', 72.00), ('200 Churros de Doce de Leite', 144.00),
    ('50 Churros de Brigadeiro', 36.00), ('Cento de Churros de Brigadeiro', 72.00), ('200 Churros de Brigadeiro', 144.00),
    ('Pepsi 1 Litro', 11.00), ('Guaraná Antarctica 1 Litro', 11.00),
    ('Coca-Cola Lata 350ml', 7.79), ('Sprite Lata 350ml', 6.59), ('Fanta Lata 350ml', 6.59)
  ) v(nome, preco)
 where p.name = v.nome;
