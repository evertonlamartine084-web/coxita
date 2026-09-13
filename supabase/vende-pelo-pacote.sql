-- Categoria que se vende pelo pacote, e não pelo recheio.
--
-- Congelado é outro produto: o cliente leva o saco para fritar em casa, não
-- escolhe "coxinha" e depois o tamanho. Sem essa distinção o modal de um sabor
-- oferecia meio cento frito e meio cento congelado lado a lado, e a vitrine de
-- sabores mostrava salgado dourado numa aba que vende cru.
--
-- Estava sendo deduzido de "o pacote tem foto?", que acertava por coincidência:
-- no dia em que o cento de salgados ganhasse foto, ele sumiria do cardápio.
alter table categories add column if not exists vende_pelo_pacote boolean not null default false;

comment on column categories.vende_pelo_pacote is
  'Aba que vende o pacote em si: não mostra vitrine de sabores, e seus pacotes não aparecem no modal de um sabor.';

update categories set vende_pelo_pacote = true where slug = 'congelados';
