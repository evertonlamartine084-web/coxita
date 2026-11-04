# Robô leitor de pedido do Zap no PC da loja

Lê as conversas do WhatsApp e monta o pedido sozinho (sabores, quantidade, dia, horário,
entrega/retirada, endereço e pagamento), só com regras — sem IA paga. No Atendimento aparece a
faixa "Pedido na conversa · Falta: horário" com o botão para conferir e criar. Roda no Docker do
Ubuntu do WSL, como a Evolution, o robô da Receita e o da transcrição.

As regras ficam em `src/utils/lerPedidoDoZap.js`; o `lerPedidoDoZap.js` desta pasta é uma cópia
feita pelo `copiar-regras.sh` (rode antes de levar a pasta para o PC).

## Instalar (uma vez)

1. Copie esta pasta inteira (com o `chave.env`) para o PC da loja, por exemplo `C:\CoxelliLeitorPedido`.
2. Dê dois cliques em `instalar.bat`.

Volta sozinho quando o PC liga (`restart: always`).

## Ver se está vivo

No PC: `wsl -u root -- bash -c "cd /opt/leitor-pedido && docker compose logs --tail 30"`.
O último sinal de vida fica em settings.leitor_pedido_robo_estado.
