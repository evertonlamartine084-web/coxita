import { useEffect, useState } from 'react'
import { getSettings, updateSettings } from '../../services/settings'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import toast from 'react-hot-toast'

const fields = [
  { key: 'store_name', label: 'Nome da Loja' },
  { key: 'hero_image', label: 'Imagem do topo da home', placeholder: 'Ex: /fotos/coxinha-frango-mao.webp' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'address', label: 'Endereço' },
  { key: 'opening_hours', label: 'Horário de Funcionamento (exibição)', placeholder: 'Ex: Loja: todos os dias, 9h às 21h. Entrega: segunda a sábado, das 13h às 18h' },
  { key: 'opening_time', label: 'Entrega começa às (seg a sáb)', type: 'time' },
  { key: 'closing_time', label: 'Entrega termina às', type: 'time' },
  { key: 'estimated_delivery', label: 'Tempo estimado de entrega', placeholder: 'Ex: 30-45 min' },
  // a taxa é calculada pelo CEP: R$ por km pelo caminho de carro, até a distância máxima
  // "nao" tira a entrega do site (só retirada); o painel continua lançando entrega combinada
  { key: 'entrega_ativa', label: 'Entrega pelo site ligada (sim/nao)', placeholder: 'sim ou nao' },
  // agenda de entrega de 30 em 30 min (aba Rotas e checkout)
  { key: 'entrega_por_horario', label: 'Entregas por horário de 30 min', type: 'number' },
  { key: 'entrega_antecedencia_min', label: 'Antecedência mínima para marcar entrega (min)', type: 'number' },
  { key: 'entrega_dias_agenda', label: 'Dias à frente para marcar entrega', type: 'number' },
  { key: 'delivery_fee_per_km', label: 'Taxa de entrega (R$ por km)', type: 'number' },
  { key: 'delivery_max_km', label: 'Entrega até (km)', type: 'number' },
  { key: 'min_order', label: 'Pedido Mínimo (R$)', type: 'number' },
  { key: 'pix_key', label: 'Chave Pix' },
  { key: 'pix_name', label: 'Nome no Pix' },
  { key: 'loyalty_goal', label: 'Fidelidade: coxinhas para ganhar 1 grátis', type: 'number' },
  // O preço do cardápio já cobre a taxa do crédito (ver Margens). Enquanto
  // este número for igual ou menor que essa taxa, o desconto não sai da
  // margem -- sai do que a maquininha deixou de cobrar.
  { key: 'desconto_avista_percent', label: 'Desconto no pix/dinheiro (%)', type: 'number' },
  // Só ligar depois que o contador configurar NCM e tributação no Bling: antes disso toda
  // tentativa falha. Desligada, a nota sai pelo botão no pedido.
  // Tag do Google: medem visitas, pedidos e cliques no WhatsApp. Vazios, nada é carregado no site.
  { key: 'google_tag_id', label: 'Google Analytics (ID da métrica, G-...)', placeholder: 'Ex: G-AB12CD34EF' },
  { key: 'google_ads_id', label: 'Google Ads (ID da conta, AW-...)', placeholder: 'Ex: AW-123456789' },
  { key: 'google_ads_conversao_pedido', label: 'Google Ads: rótulo da conversão "pedido feito"', placeholder: 'Ex: AbC-D_efG-h12' },
  { key: 'google_ads_conversao_whatsapp', label: 'Google Ads: rótulo da conversão "chamou no WhatsApp"', placeholder: 'Ex: XyZ-1_abC-d34' },
  { key: 'bling_nfe_automatica', label: 'Emitir nota sozinho ao sair para entrega (sim/nao)', placeholder: 'sim ou nao' },
]

const bannerFields = [
  { key: 'banner_active', label: 'Banner ativo (sim/nao)', placeholder: 'sim ou nao' },
  { key: 'banner_text', label: 'Texto do banner', placeholder: 'Ex: Combo família com 20% OFF hoje!' },
  { key: 'banner_emoji', label: 'Emoji do banner', placeholder: 'Ex: 🔥' },
  { key: 'banner_link', label: 'Link do banner (opcional)', placeholder: '/cardapio' },
]

export default function SettingsPage() {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSettings()
      .then(setForm)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleChange = (key, value) => {
    setForm(f => ({ ...f, [key]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateSettings(form)
      toast.success('Configurações salvas!')
    } catch {
      toast.error('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Configurações</h1>
      <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-bold text-lg text-gray-700 mb-2">Geral</h2>
          {fields.map(f => (
            <Input
              key={f.key}
              label={f.label}
              type={f.type || 'text'}
              step={f.type === 'number' ? '0.01' : undefined}
              value={form[f.key] || ''}
              onChange={e => handleChange(f.key, e.target.value)}
              placeholder={f.placeholder}
            />
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-bold text-lg text-gray-700 mb-2">Banner Promocional</h2>
          <p className="text-gray-400 text-sm -mt-2">Aparece no topo da home para todos os clientes</p>
          {bannerFields.map(f => (
            <Input
              key={f.key}
              label={f.label}
              value={form[f.key] || ''}
              onChange={e => handleChange(f.key, e.target.value)}
              placeholder={f.placeholder}
            />
          ))}
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </form>
    </div>
  )
}
