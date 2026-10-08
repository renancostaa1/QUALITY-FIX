// Regras de negócio do painel. Ajuste aqui.

// 3 meses sem comprar = cliente inativo
export const DIAS_PARA_INATIVAR = 90;

// Só entram na visão de inativos clientes que compraram nos últimos N meses (evita listar quem parou há anos)
export const JANELA_INATIVOS_MESES = 24;

// As views não trazem prazo de entrega: pedido em andamento há mais de N dias desde a emissão = atrasado
export const DIAS_LIMITE_ENTREGA = 10;

// Tipos de documento de VW_PEDIDOS considerados. TIPO=2 (sem NF) fica de fora até confirmar o que é
export const TIPOS_PEDIDO = [1];

// Quantos meses para trás o painel permite navegar (mês atual + N anteriores)
export const MESES_NAVEGAVEIS = 4;
