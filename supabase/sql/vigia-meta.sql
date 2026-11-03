-- Vigia da Meta (pedido do dono em 03/11/2026): teste de criativos do "Cento no Zap". O painel do
-- PC da loja lê o desempenho por anúncio (hub-meta, só leitura) e avisa no grupo da loja quando um
-- anúncio está ruim (sugere desligar) ou quando um está ganhando, mais um placar diário. Desligar
-- continua com o dono: o token da Meta só lê.

insert into crm_fluxos (id, nome, ativo, config) values (
  'vigia_meta', 'Vigia da Meta', true,
  jsonb_build_object(
    'inicio', '2026-11-03',         -- dia em que o teste começou (conta daqui para frente)
    'gasto_sem_conversa', 8,        -- gastou isso e nenhuma conversa: desligar
    'gasto_para_comparar', 10,      -- só compara custo depois de gastar isso
    'multiplo', 2,                  -- custo por conversa X vezes o do melhor: desligar
    'conversas_para_vencer', 8,     -- o melhor só é "vencedor" com essas conversas
    'hora_placar', 20               -- placar do dia no grupo
  )
) on conflict (id) do nothing;

-- Trava de aviso: cada aviso (chave) sai uma vez só no grupo.
create table if not exists meta_vigia (
  chave text primary key,
  criado_em timestamptz not null default now()
);
alter table meta_vigia enable row level security;
drop policy if exists meta_vigia_painel on meta_vigia;
create policy meta_vigia_painel on meta_vigia for all using (auth.role() = 'authenticated');
