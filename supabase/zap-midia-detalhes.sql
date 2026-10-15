-- Atendimento (15/10/2026): tamanho do arquivo (documento mostra "PDF · 230 kB") e dados extras da
-- mensagem, como as coordenadas da localização ({"lat": -5.73, "lng": -35.23}) para abrir no mapa.
alter table zap_mensagens add column if not exists midia_tamanho bigint;
alter table zap_mensagens add column if not exists dados jsonb;
