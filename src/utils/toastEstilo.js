/**
 * Aparencia dos toasts de confirmacao. Vive fora dos componentes porque mais de
 * um caminho leva ao carrinho -- card de produto e card de sabor -- e os dois
 * precisam confirmar do mesmo jeito.
 */
export const ESTILO_TOAST = {
  icon: null,
  style: {
    background: '#3D2410',
    color: '#fff',
    borderRadius: '1rem',
    fontFamily: "'Barlow', Arial, sans-serif",
    fontWeight: 600,
  },
}
