# Robô de transcrição dos áudios do Zap no PC da loja

Escreve os áudios que chegam no Zap: o texto aparece embaixo do áudio no Atendimento e entra
na leitura do "Montar pedido". Roda o Whisper aqui no PC (sem custo por áudio), no Docker do
Ubuntu do WSL, como a Evolution e o robô da Receita.

## Instalar (uma vez)

1. Copie esta pasta inteira (com o `chave.env`) para o PC da loja, por exemplo `C:\CoxelliTranscricao`.
2. Dê dois cliques em `instalar.bat`. Na primeira vez ele baixa o Whisper (uns 1,6 GB) e demora.

Depois disso ele volta sozinho quando o PC liga (`restart: always`). Ele começa pelos áudios
dos últimos 30 dias que ainda não têm texto, do mais novo para o mais velho.

## Ver se está vivo

No PC: `wsl -u root -- bash -c "cd /opt/transcricao && docker compose logs --tail 30"`.
O último sinal de vida fica em settings.transcricao_robo_estado.
