-- Atendimento: foto de perfil na lista e mídia (foto, áudio, figurinha) dentro da conversa.
-- O PC da loja baixa da Evolution e sobe para o bucket privado zap-midia; o painel mostra com
-- link assinado. Pedido do dono em 14/10/2026.
alter table zap_conversas add column if not exists foto_url text;
alter table zap_conversas add column if not exists foto_em timestamptz;
alter table zap_mensagens add column if not exists midia_path text;
alter table zap_mensagens add column if not exists midia_tipo text;
alter table zap_mensagens add column if not exists midia_tentou_em timestamptz;
create index if not exists idx_zap_mensagens_midia_pendente on zap_mensagens (criada_em desc)
  where midia_path is null and tipo in ('imagem', 'audio', 'figurinha');

insert into storage.buckets (id, name, public) values ('zap-midia', 'zap-midia', false)
  on conflict (id) do nothing;
drop policy if exists "zap_midia_admin_ler" on storage.objects;
create policy "zap_midia_admin_ler" on storage.objects for select
  using (bucket_id = 'zap-midia' and auth.role() = 'authenticated');
drop policy if exists "zap_midia_admin_gravar" on storage.objects;
create policy "zap_midia_admin_gravar" on storage.objects for insert
  with check (bucket_id = 'zap-midia' and auth.role() = 'authenticated');
