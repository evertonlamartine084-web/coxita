-- De onde veio o pedido do site (14/10/2026): anúncio do Google, busca, Perfil, Instagram, direto…
-- O site guarda a origem da visita no aparelho (src/services/origem.js) e, logo depois de criar o
-- pedido, chama gravar_origem_pedido. Fica fora de criar_pedido de propósito: se isto falhar, o
-- pedido não pode falhar junto.
alter table orders add column if not exists origem jsonb;

create or replace function gravar_origem_pedido(p_order_id uuid, p_token text, p_origem jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  -- só o próprio pedido (pelo código do link), uma vez, logo depois de criado, e coisa pequena
  if p_origem is null or jsonb_typeof(p_origem) <> 'object' or length(p_origem::text) > 2000 then return; end if;
  update orders set origem = p_origem
   where id = p_order_id and public_token = p_token and origem is null
     and created_at > now() - interval '15 minutes';
end $$;
revoke all on function gravar_origem_pedido(uuid, text, jsonb) from public;
grant execute on function gravar_origem_pedido(uuid, text, jsonb) to anon, authenticated;
