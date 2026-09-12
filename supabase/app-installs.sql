-- Quantas pessoas têm o app instalado.
--
-- A web NÃO avisa quando alguém desinstala: não existe evento nem consulta. Por isso a tabela
-- guarda duas coisas diferentes, e o painel mostra as duas:
--   installed_at   → carimbo de quem instalou alguma vez. Só cresce; nunca cai.
--   last_seen_app  → última vez que o site foi aberto DENTRO do app (display-mode standalone).
--                    É esse que responde "quantas pessoas ainda usam", porque quem desinstalou
--                    simplesmente para de aparecer.
--
-- A chave é um uuid gerado no aparelho e guardado no localStorage. Não identifica ninguém: se a
-- pessoa limpar os dados do site, vira um device novo — o número erra pra mais, e é o melhor
-- que a plataforma permite sem login.

create table if not exists app_installs (
  device_id uuid primary key,
  platform text,                 -- 'android' | 'ios' | 'desktop'
  installed_at timestamptz,      -- null = nunca chegou a instalar
  last_seen_app timestamptz,     -- null = nunca abriu pelo app
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_installs_installed_at_idx on app_installs (installed_at);
create index if not exists app_installs_last_seen_app_idx on app_installs (last_seen_app);

alter table app_installs enable row level security;

-- Sem policy pública de insert/update DE PROPÓSITO.
--
-- O caminho óbvio seria `for update using (true)`, como o push_subscriptions faz para insert.
-- Só que update aberto deixa qualquer visitante reescrever a linha de QUALQUER aparelho: daria
-- pra zerar a base instalada inteira com uma requisição. O aparelho escreve só pela função
-- abaixo, que decide o que pode mudar.
create policy "app_installs_admin_all" on app_installs for all using (auth.role() = 'authenticated');

/**
 * Registra presença deste aparelho. Chamada pelo site, sem login.
 *
 * `installed_at` usa coalesce: o primeiro carimbo vale para sempre, senão reinstalar (ou só
 * reabrir o app) empurraria a data pra frente e "instalou há 30 dias" nunca seria verdade.
 */
create or replace function registrar_app_install(
  p_device_id uuid,
  p_platform text,
  p_instalou boolean,
  p_usando_app boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into app_installs as a (device_id, platform, installed_at, last_seen_app, updated_at)
  values (
    p_device_id,
    p_platform,
    case when p_instalou or p_usando_app then now() end,
    case when p_usando_app then now() end,
    now()
  )
  on conflict (device_id) do update set
    platform      = excluded.platform,
    installed_at  = coalesce(a.installed_at, excluded.installed_at),
    last_seen_app = coalesce(excluded.last_seen_app, a.last_seen_app),
    updated_at    = now();
$$;

grant execute on function registrar_app_install(uuid, text, boolean, boolean) to anon, authenticated;

-- Contagens para o painel. SECURITY DEFINER porque a leitura da tabela é só do admin, e a
-- função devolve apenas agregados — nunca uma linha de aparelho.
create or replace function app_install_stats()
returns table (
  instalados bigint,
  ativos_30d bigint,
  ativos_7d bigint,
  novos_30d bigint,
  novos_7d bigint
)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where installed_at is not null),
    count(*) filter (where last_seen_app > now() - interval '30 days'),
    count(*) filter (where last_seen_app > now() - interval '7 days'),
    count(*) filter (where installed_at > now() - interval '30 days'),
    count(*) filter (where installed_at > now() - interval '7 days')
  from app_installs;
$$;

grant execute on function app_install_stats() to authenticated;
