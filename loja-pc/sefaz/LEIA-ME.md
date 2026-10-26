# Robô da Receita (NF-e de compra) no PC da loja

Busca na Receita as notas de empresa emitidas para o CNPJ da Coxelli (compras com CNPJ no
atacarejo, distribuidores), dá ciência, baixa o XML e manda para o painel, que lança para
conferência e depois nas planilhas. Roda no Docker do Ubuntu do WSL, como a Evolution.

## Instalar (uma vez)

1. Copie esta pasta para `C:\CoxelliSefaz` no PC da loja.
2. Coloque lá o `certificado.pfx` (o A1 da Coxelli, o mesmo do Bling).
3. Copie `chave.env.exemplo` para `chave.env` e preencha a senha do certificado e o segredo.
4. Dê dois cliques em `instalar.bat`.

Depois disso ele volta sozinho quando o PC liga (o mesmo laço que segura a Evolution segura o
Docker, e o contêiner tem `restart: always`).

## Ver se está vivo

No painel, em Compras, aparece "robô da Receita visto às HH:MM". No PC:
`wsl -u root -- bash -c "cd /opt/sefaz && docker compose logs --tail 50"`.
