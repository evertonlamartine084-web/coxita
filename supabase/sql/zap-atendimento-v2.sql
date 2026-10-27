-- Atendimento, etapa 1 "igual ao WhatsApp" (14/10/2026): tempo real, citação, situação de entrega
-- (✓ ✓✓ lida), mídia enviada pelo painel e respostas rápidas.

-- tempo real: o painel escuta inserções e mudanças em vez de perguntar a cada 3 s
do $$ begin
  begin alter publication supabase_realtime add table zap_mensagens; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table zap_conversas; exception when duplicate_object then null; end;
end $$;

alter table zap_mensagens add column if not exists responde_a text;        -- wa_id da mensagem citada
alter table zap_mensagens add column if not exists responde_texto text;    -- prévia da citada
alter table zap_mensagens add column if not exists status_wa text;         -- enviado | entregue | lido
alter table zap_mensagens add column if not exists midia_nome text;        -- nome do arquivo (documento)

create table if not exists zap_respostas_rapidas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  texto text not null,
  criado_em timestamptz not null default now()
);
alter table zap_respostas_rapidas enable row level security;
drop policy if exists "zap_respostas_admin" on zap_respostas_rapidas;
create policy "zap_respostas_admin" on zap_respostas_rapidas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- mídia: o painel apaga anexo que desistiu de mandar; nada mais
drop policy if exists "zap_midia_admin_apagar" on storage.objects;
create policy "zap_midia_admin_apagar" on storage.objects for delete
  using (bucket_id = 'zap-midia' and auth.role() = 'authenticated');
