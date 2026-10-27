-- 27/10/2026: compras passam a ir para as planilhas reais (antes eram cópias de teste).
-- As notas já lançadas ficam só nas cópias; só as próximas vão para estas.
update settings set value = '14QkAPvUCo0q1Ilst5sZUXHA77j0j9mck93WaMo-mQbI' where key = 'planilha_itens_id';   -- Insumos e despesas fixas - Coxelli
update settings set value = '12DsXUjizjLeSWlfkEHIpt-X-sgkVUOZiYRYiip3Cukw' where key = 'planilha_totais_id';  -- Contabilidade - Coxelli
select key, value from settings where key like 'planilha%';
