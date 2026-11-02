-- Onde comprar: robô que procura todo dia o preço dos insumos nos mercados de Natal (02/11/2026).
--
-- A função cotar-mercados (supabase/functions/cotar-mercados) busca cada insumo de mercado_buscas
-- no Atacadão e no Nordestão, lê o tamanho no nome ("900ml", "5kg") e grava o preço por kg/L/un em
-- mercado_precos, uma linha por produto por dia. A tela "Onde comprar" do painel compara com o que
-- se paga hoje (supplies.pack_price / pack_quantity) e marca a oferta que vale a pena.
--
-- Busca: `termos` separados por ";"; o nome tem que começar com um de `comeca`, ter as palavras de
-- `incluir` e nenhuma de `excluir`. Produto que não é o insumo sai pelo botão "não é isso"
-- (mercado_ignorados), sem mexer na busca.

create table if not exists mercado_buscas (
  supply_id uuid primary key references supplies(id) on delete cascade,
  termos text not null,
  comeca text[] not null default '{}',
  incluir text[] not null default '{}',
  excluir text[] not null default '{}',
  minimo numeric(10,3),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create table if not exists mercado_precos (
  id bigint generated always as identity primary key,
  supply_id uuid not null references supplies(id) on delete cascade,
  mercado text not null,
  produto_id text not null,
  produto text not null,
  marca text,
  tamanho numeric(12,4) not null,
  preco numeric(10,2) not null,
  preco_original numeric(10,2),
  preco_unidade numeric(12,4) not null,
  link text,
  visto_em date not null default (now() at time zone 'America/Fortaleza')::date,
  unique (supply_id, mercado, produto_id, visto_em)
);
create index if not exists mercado_precos_dia_idx on mercado_precos (visto_em desc, supply_id, preco_unidade);

create table if not exists mercado_ignorados (
  supply_id uuid not null references supplies(id) on delete cascade,
  mercado text not null,
  produto_id text not null,
  produto text,
  criado_em timestamptz not null default now(),
  primary key (supply_id, mercado, produto_id)
);

create table if not exists mercado_rodadas (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  insumos int,
  precos int,
  erros jsonb not null default '[]'
);

alter table mercado_buscas enable row level security;
alter table mercado_precos enable row level security;
alter table mercado_ignorados enable row level security;
alter table mercado_rodadas enable row level security;
do $$
declare t text;
begin
  foreach t in array array['mercado_buscas', 'mercado_precos', 'mercado_ignorados', 'mercado_rodadas'] loop
    execute format('drop policy if exists %I on %I', t || '_painel', t);
    execute format('create policy %I on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t || '_painel', t);
  end loop;
end $$;

-- As buscas de partida, testadas em 02/11 nos dois mercados.
insert into mercado_buscas (supply_id, termos, comeca, incluir, excluir)
select s.id, v.termos, v.comeca, v.incluir, v.excluir
  from (values
    ('Farinha de trigo', 'farinha de trigo', array['farinha de trigo'], array[]::text[], array['integral','pizza','bolo','fermento','mistura','pastel']),
    ('Óleo de soja', 'oleo de soja', array['oleo de soja'], array[]::text[], array['composto','spray']),
    ('Margarina', 'margarina', array['margarina'], array[]::text[], array['light','sem sal']),
    ('Frango', 'peito de frango;file de peito', array['peito de frango','file de peito de frango','file de frango','peito frango'], array[]::text[], array['empanado','temperado','defumado','grelhado']),
    ('Queijo mussarela', 'queijo mussarela', array['queijo mussarela','mussarela'], array[]::text[], array['fat','ralad','bufala','palito']),
    ('Queijo coalho', 'queijo coalho', array['queijo coalho'], array[]::text[], array['espeto','palito','fatiad','oregano']),
    ('Presunto', 'presunto', array['presunto'], array[]::text[], array['parma','cru','fat','peru']),
    ('Calabresa', 'linguica calabresa', array['linguica calabresa','linguica tipo calabresa'], array[]::text[], array['fatiad']),
    ('Bacon', 'bacon', array['bacon'], array[]::text[], array['fatiad','sabor']),
    ('Carne moída', 'carne moida', array['carne moida bovina','carne bovina moida','carne moida'], array[]::text[], array['suina','soja','frango','cordeiro']),
    ('Carne de sol', 'carne de sol', array['carne de sol','carne do sol'], array[]::text[], array[]::text[]),
    ('Cebola', 'cebola', array['cebola'], array[]::text[], array['roxa','po','frita','desidratada','conserva','granulada']),
    ('Leite', 'leite integral', array['leite'], array['integral'], array['po','condensado','fermentado','coco','ninho']),
    ('Açúcar', 'acucar cristal;acucar refinado', array['acucar'], array[]::text[], array['mascavo','demerara','confeiteiro','light']),
    ('Sal', 'sal refinado', array['sal '], array[]::text[], array['grosso','rosa','light','temperado']),
    ('Requeijão cremoso', 'requeijao culinario;requeijao bisnaga;requeijao cremoso', array['requeijao'], array[]::text[], array['light','cheddar']),
    ('Requeijão cheddar', 'cheddar culinario;requeijao cheddar', array['requeijao','cheddar','mistura'], array['cheddar'], array['fatiad','ralad','molho']),
    ('Salsicha', 'salsicha', array['salsicha'], array[]::text[], array['vegana','lata','conserva']),
    ('Doce de leite', 'doce de leite', array['doce de leite'], array[]::text[], array[]::text[]),
    ('Farinha de rosca', 'farinha de rosca', array['farinha de rosca'], array[]::text[], array[]::text[]),
    ('Massa de pastel', 'massa de pastel', array['massa para pastel','massa de pastel','massa pastel'], array[]::text[], array['disco']),
    ('Cominho', 'cominho', array['cominho'], array[]::text[], array['pimenta']),
    ('Colorífico', 'colorifico', array['colorifico'], array[]::text[], array[]::text[]),
    ('Orégano', 'oregano', array['oregano'], array[]::text[], array[]::text[]),
    ('Alho em pó', 'alho em po;alho desidratado', array['alho'], array[]::text[], array['sal','pasta','frito']),
    ('Pimenta do reino', 'pimenta do reino', array['pimenta do reino','pimenta-do-reino'], array[]::text[], array[]::text[]),
    ('Páprica doce', 'paprica doce', array['paprica'], array['doce'], array[]::text[]),
    ('Açafrão', 'acafrao', array['acafrao'], array[]::text[], array[]::text[]),
    ('Coentro em pó', 'coentro em po', array['coentro'], array['po'], array[]::text[]),
    ('Nutella', 'nutella', array['nutella'], array[]::text[], array['biscoito','wafer']),
    ('Brigadeiro', 'brigadeiro', array['brigadeiro','mistura para brigadeiro'], array[]::text[], array['bombom','bolo','biscoito'])
  ) as v(insumo, termos, comeca, incluir, excluir)
  join supplies s on s.name = v.insumo
on conflict (supply_id) do nothing;

-- Pedido do pg_cron: a função busca, grava e registra a rodada.
create or replace function pedir_cotacao_mercados() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_segredo text;
  v_anon text;
begin
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'emissao_nota_segredo';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'supabase_anon_key';
  if v_segredo is null or v_anon is null then
    raise warning 'cotação sem segredos no vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://ruehnwnihmysycrpddgy.supabase.co/functions/v1/cotar-mercados',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-emissao-interna', v_segredo
    ),
    timeout_milliseconds := 150000
  );
end $$;
revoke all on function pedir_cotacao_mercados() from public, anon, authenticated;

-- Todo dia às 6h30 de Natal (9h30 UTC): oferta de mercado costuma virar de madrugada.
select cron.unschedule(jobid) from cron.job where jobname = 'cotar-mercados';
select cron.schedule('cotar-mercados', '30 9 * * *', 'select pedir_cotacao_mercados()');
