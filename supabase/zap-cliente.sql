-- Mensagens para o cliente no WhatsApp (10/10/2026).
--
-- O painel do PC da loja (o mesmo que manda o pedido para o grupo, pela Evolution) avisa o
-- cliente: pedido recebido (só os do site), em preparo, saiu para entrega ou pronto para
-- retirada, e entregue (agradecimento e, se settings.google_avaliacao_url existir, o link de
-- avaliação). zap_cliente guarda o que já foi mandado, {evento: momento} — nunca repete, e
-- mudar o status pelo celular também dispara, porque o PC da loja vê a mudança.

alter table orders add column if not exists zap_cliente jsonb not null default '{}'::jsonb;
insert into settings (key, value) values ('google_avaliacao_url', '') on conflict (key) do nothing;
