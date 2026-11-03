-- Transcrição dos áudios do Zap (pedido do dono em 03/11/2026): o robô do PC da loja
-- (loja-pc/transcricao) roda o Whisper e grava o texto aqui, pela função zap-transcrever. O
-- Atendimento mostra embaixo do áudio e o montar-pedido lê junto com a conversa.
alter table zap_mensagens add column if not exists transcricao text;
alter table zap_mensagens add column if not exists transcricao_em timestamptz;
alter table zap_mensagens add column if not exists transcricao_erro text;
create index if not exists zap_mensagens_audio_sem_texto on zap_mensagens (criada_em desc)
  where tipo = 'audio' and midia_path is not null and transcricao is null and transcricao_erro is null;
