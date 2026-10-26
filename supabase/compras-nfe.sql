-- NF-e de compra pela Receita (26/10/2026): o robô do PC da loja (loja-pc/sefaz) entrega o XML à
-- função `nfe-receber`, que grava a compra para CONFERÊNCIA no painel; só depois de conferida ela
-- vai para as planilhas. Ver supabase/compras-cupom.sql para o resto da estrutura.

alter table compras add column if not exists origem text not null default 'nfce';      -- nfce (cupom) | nfe (Receita)
alter table compras add column if not exists conferida boolean not null default true;  -- false = esperando a pessoa conferir os blocos
alter table compras add column if not exists xml text;                                 -- o XML completo da NF-e, para auditoria
alter table compras add column if not exists emitente_nome_sefaz text;                 -- razão social como veio, quando o nome foi encurtado
create index if not exists idx_compras_conferida on compras(conferida) where conferida = false;

-- O robô se identifica por um segredo compartilhado (não tem login de usuário):
--   supabase secrets set NFE_ROBO_SEGREDO=<o mesmo do chave.env do PC da loja>
-- O painel mostra quando o robô deu o último sinal de vida:
insert into settings (key, value) values ('nfe_robo_estado', '{}') on conflict (key) do nothing;
