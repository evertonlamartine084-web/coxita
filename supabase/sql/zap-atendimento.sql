-- Atendimento do WhatsApp dentro do painel (aba Atendimento), em qualquer aparelho.
--
-- Entrada: a Evolution do PC da loja chama a função zap-webhook a cada mensagem que entra ou sai do
-- número, e ela grava aqui. Saída: quem responde pelo painel grava a mensagem com status 'enviar';
-- o painel do PC da loja (o único que alcança a Evolution) envia e marca 'enviada' com o wa_id.
-- Pedido do dono em 14/10/2026. Antes disso nenhum texto de conversa era guardado no banco.

create table if not exists zap_conversas (
  chave text primary key,             -- telefone (5584...) ou, sem ele, o jid
  jid text not null,                  -- para onde a Evolution envia
  telefone text,
  nome text,
  ultima_msg text,
  ultima_em timestamptz,
  ultima_de_mim boolean not null default false,
  nao_lidas int not null default 0,
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_zap_conversas_ultima on zap_conversas (ultima_em desc);

create table if not exists zap_mensagens (
  id uuid primary key default gen_random_uuid(),
  wa_id text unique,
  conversa text not null references zap_conversas(chave) on delete cascade,
  de_mim boolean not null,
  texto text,
  tipo text not null default 'texto',
  status text not null default 'recebida',   -- recebida | enviar | enviando | enviada | erro
  erro text,
  enviada_por text,
  criada_em timestamptz not null default now()
);
create index if not exists idx_zap_mensagens_conversa on zap_mensagens (conversa, criada_em desc);
create index if not exists idx_zap_mensagens_fila on zap_mensagens (status) where status in ('enviar', 'enviando');

alter table zap_conversas enable row level security;
alter table zap_mensagens enable row level security;
drop policy if exists "zap_conversas_admin" on zap_conversas;
create policy "zap_conversas_admin" on zap_conversas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "zap_mensagens_admin" on zap_mensagens;
create policy "zap_mensagens_admin" on zap_mensagens for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Mensagem nova atualiza a conversa (prévia, hora, não lidas).
create or replace function zap_atualizar_conversa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update zap_conversas
     set ultima_msg = left(coalesce(new.texto, '[' || new.tipo || ']'), 200),
         ultima_em = new.criada_em,
         ultima_de_mim = new.de_mim,
         nao_lidas = case when new.de_mim then 0 else nao_lidas + 1 end,
         atualizado_em = now()
   where chave = new.conversa
     and (ultima_em is null or new.criada_em >= ultima_em);
  return new;
end $$;

drop trigger if exists trg_zap_atualizar_conversa on zap_mensagens;
create trigger trg_zap_atualizar_conversa after insert on zap_mensagens
  for each row execute function zap_atualizar_conversa();

-- Segredo que a Evolution manda na URL do webhook (o painel do PC da loja lê daqui para configurar).
alter table zap_config add column if not exists webhook_segredo text;
update zap_config set webhook_segredo = encode(gen_random_bytes(24), 'hex') where id = 1 and webhook_segredo is null;
