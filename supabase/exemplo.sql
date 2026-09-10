-- =====================================================================
-- Lançamentos de exemplo (opcional)
--
-- Serve só para ver as telas preenchidas. Execute no SQL Editor do
-- Supabase DEPOIS de criar sua conta no app e entrar pelo menos uma vez.
-- Os lançamentos são criados para o primeiro usuário cadastrado.
--
-- Para apagar os exemplos depois:
--   delete from public.lancamentos where observacao = 'exemplo';
-- =====================================================================

do $$
declare
    dono uuid;
    mes  text := to_char(current_date, 'YYYY-MM');
begin
    select id into dono from auth.users order by created_at limit 1;
    if dono is null then
        raise exception 'Nenhum usuário cadastrado. Crie sua conta no app primeiro.';
    end if;

    insert into public.lancamentos (user_id, conta_id, pasta_id, tipo, data, descricao, valor_centavos, observacao)
    select dono, c.id, c.pasta_id, c.tipo, (mes || '-' || e.dia)::date, e.descricao, e.valor, 'exemplo'
      from (values
        ('Corretor',  'Comissão de venda',            '28', 'Comissão de venda',    250000),
        ('Corretor',  'Comissão de venda',            '18', 'Comissão de venda',    180000),
        ('Corretor',  'Comissão de locação',          '10', 'Comissão de locação',  820000),
        ('Corretor',  'Combustível',                  '27', 'Combustível',           18000),
        ('Corretor',  'Combustível',                  '12', 'Combustível',          102000),
        ('Corretor',  'Marketing',                    '25', 'Marketing',             65000),
        ('Corretor',  'Alimentação',                  '22', 'Alimentação',           42000),
        ('Corretor',  'Internet/Telefone',            '20', 'Internet/Telefone',     28000),
        ('Corretor',  'Outros',                       '15', 'Outros',                70000),
        ('Barbearia', 'Serviços (cortes e barba)',    '28', 'Serviços',              32000),
        ('Barbearia', 'Serviços (cortes e barba)',    '18', 'Serviços',              29000),
        ('Barbearia', 'Serviços (cortes e barba)',    '08', 'Serviços',             714000),
        ('Barbearia', 'Venda de produtos',            '14', 'Venda de produtos',    100000),
        ('Barbearia', 'Produtos (pomadas, etc.)',     '27', 'Produtos',              18000),
        ('Barbearia', 'Produtos (pomadas, etc.)',     '05', 'Reposição de estoque',  80000),
        ('Barbearia', 'Aluguel',                      '25', 'Aluguel',               75000),
        ('Barbearia', 'Energia/Água',                 '22', 'Energia/Água',          42000),
        ('Barbearia', 'Internet/Telefone',            '20', 'Internet/Telefone',     31000),
        ('Barbearia', 'Outros',                       '16', 'Outros',                52000),
        ('Casa',      'Salário',                      '18', 'Salário',              500000),
        ('Casa',      'Moradia (aluguel/cond.)',      '28', 'Aluguel',              120000),
        ('Casa',      'Contas (água, luz, internet)', '27', 'Conta de luz',          28000),
        ('Casa',      'Contas (água, luz, internet)', '22', 'Internet',              40000),
        ('Casa',      'Alimentação',                  '25', 'Mercado',               52000),
        ('Casa',      'Transporte',                   '21', 'Transporte',            42000),
        ('Casa',      'Outros',                       '12', 'Outros',                60000)
      ) as e(pasta, conta, dia, descricao, valor)
      join public.pastas p on p.user_id = dono and p.nome = e.pasta
      join public.contas c on c.pasta_id = p.id and c.nome = e.conta;

    raise notice 'Lançamentos de exemplo criados para o mês %.', mes;
end;
$$;
