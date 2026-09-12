import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { semear } from './services/cache'
import { registerServiceWorker } from './services/registerServiceWorker.jsx'

// Cardapio que o build embutiu no HTML (scripts/dados-iniciais.mjs). Plantar
// antes do render e o que faz a primeira pintura sair com conteudo em vez de
// "Carregando..." -- as paginas ja liam o cache de forma sincrona via peek().
for (const [chave, dados] of Object.entries(window.__COXELLI__ ?? {})) {
  semear(chave, dados)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
