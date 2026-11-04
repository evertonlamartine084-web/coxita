-- Número escondido do WhatsApp (…@lid) ligado ao telefone (04/11/2026). Depois de reconectar pelo
-- QR, a Evolution passou a mandar clientes antigos só com o @lid, sem o número junto, e cada um
-- virava uma conversa nova sem nome. O painel aprende o par quando a mesma mensagem (wa_id) já
-- estava gravada na conversa do telefone, ou quando a atendente informa o telefone ao renomear.
create table if not exists zap_lids (
  lid text primary key,
  telefone text not null,
  origem text,
  criado_em timestamptz not null default now()
);
alter table zap_lids enable row level security;
drop policy if exists "zap_lids_admin" on zap_lids;
create policy "zap_lids_admin" on zap_lids for all to authenticated using (true) with check (true);

-- junta a conversa do @lid na do telefone (mensagens, e apaga a conversa vazia)
create or replace function zap_juntar_lid(p_lid text, p_telefone text, p_origem text default null)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_n integer;
begin
  insert into zap_lids (lid, telefone, origem) values (p_lid, p_telefone, p_origem)
    on conflict (lid) do update set telefone = excluded.telefone;
  insert into zap_conversas (chave, jid, telefone, nome, nome_origem, ultima_msg, ultima_em, ultima_de_mim)
    select p_telefone, p_telefone || '@s.whatsapp.net', p_telefone, c.nome, c.nome_origem, c.ultima_msg, c.ultima_em, c.ultima_de_mim
      from zap_conversas c where c.chave = p_lid
    on conflict (chave) do nothing;
  update zap_mensagens set conversa = p_telefone where conversa = p_lid;
  get diagnostics v_n = row_count;
  -- prévia da conversa do telefone fica com a mensagem mais nova das duas
  update zap_conversas t set ultima_msg = l.ultima_msg, ultima_em = l.ultima_em, ultima_de_mim = l.ultima_de_mim,
         nao_lidas = coalesce(t.nao_lidas, 0) + coalesce(l.nao_lidas, 0)
    from zap_conversas l where t.chave = p_telefone and l.chave = p_lid and l.ultima_em > coalesce(t.ultima_em, 'epoch');
  delete from zap_conversas where chave = p_lid;
  return v_n;
end $$;
grant execute on function zap_juntar_lid(text, text, text) to authenticated;
