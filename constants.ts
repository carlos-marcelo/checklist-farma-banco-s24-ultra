import { ChecklistDefinition, InputType, ThemeColor, AccessModule, AccessLevelMeta } from './types';

export const DROGARIA_LOGO_URL = "https://i.imgur.com/example-placeholder.png"; // We will build a CSS logo to avoid external dependency issues

const INFO_BASICA_SECTION = {
  id: 'info_basica',
  title: 'Informações Básicas',
  items: [
    { id: 'empresa', text: 'Empresa', type: InputType.TEXT, required: true },
    { id: 'nome_coordenador', text: 'Nome do Coordenador / Aplicador', type: InputType.TEXT, required: true },
    { id: 'filial', text: 'Filial', type: InputType.TEXT, required: true },
    { id: 'area', text: 'Área', type: InputType.TEXT, required: false }, // Auto-filled
    { id: 'gestor', text: 'Gestor(a)', type: InputType.TEXT, required: true },
    { id: 'data_aplicacao', text: 'Data de Aplicação', type: InputType.DATE, required: true },
  ]
};

export const CHECKLISTS: ChecklistDefinition[] = [
  {
    id: 'gerencial',
    title: 'Checklist Gerencial',
    description: 'Avaliação de estrutura, equipamentos e POP de Gestão.',
    sections: [
      INFO_BASICA_SECTION,
      {
        id: 'estrutura',
        title: 'Estrutura Predial e Equipamentos',
        items: [
          { id: 'equipamentos', text: '1- Equipamentos eletrônicos (teclado, mouse, monitor, cabos, POS, ETC....)', type: InputType.TEXTAREA, required: true },
          { id: 'estrutura_predial', text: '2- Estrutura Predial (Descreva avarias)', type: InputType.TEXTAREA, required: true },
        ]
      },
      {
        id: 'pop_gestao',
        title: 'Procedimento Operacional Padrão (POP) Gestão',
        items: [
          { id: 'pop_1', text: '1- Análise de Log´s de Eventos e uso da senha do gestor.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_2', text: '2- Conhecimento das metas (Faturamento, CMV, Perfumaria, TKT, Fidelização, Metas App e Canais Digitais).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_3', text: '3- Impressão e assinatura da planilha de acompanhamento de vendas diária.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_4', text: '4- Análise do Índice de Fidelização (Meta > 80%).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_5', text: '5- Metas diárias individuais estabelecidas.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_6', text: '6- Presença no balcão em horários de pico.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_7', text: '7- Metas quinzenais/mensais expostas no mural.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_8', text: '8- Ata de reunião semanal de resultados.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_9', text: '9- Marketing: Café, balões, exposições chamativas.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_10', text: '10- Verificação de transações TEF e senhas.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_11', text: '11- Escala de folgas e férias (até dia 25).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_12', text: '12- Controle de caixa (sem acúmulo > 24hrs).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_13', text: '13- Conferência fundo de caixa x escritório.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_14', text: '14- Notas Fiscais pendentes resolvidadas (max 5 dias).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_15', text: '15- Reenvio de conteúdos promocionais nas redes.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_16', text: '16- Revisão de setores e pré-vencidos (até dia 20). Produtos segregados em caixas de papelão c/ códigos e quantidades visíveis.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_17', text: '17- Limpeza e organização (esponja/sapólio semanal).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_18', text: '18- Controle de validade: Identificação de responsáveis por setor e verificação da precificação/validade.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_19', text: '19- Precificação e alteração de preços (max 24hrs).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_20', text: '20- Ambientação, decoração e bandeirolas.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pop_21', text: '21- Entradas de mercadorias e erros de fração.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      },
      {
        id: 'gestor_farmaceutico',
        title: 'Gestor e Farmacêutico',
        items: [
          { id: 'gf_22', text: '22- Balanços de controlados/antibióticos (dias 10, 20, 30).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'gf_23', text: '23- Segregação de pré-vencidos e solicitação de preço especial.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'gf_24', text: '24- Controle SNGPC e receitas.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'gf_25', text: '25- Sala farmacêutica e injetáveis (limpeza/controle).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'gf_26', text: '26- Planilha de temperatura da geladeira.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'gf_27', text: '27- Supervisão da limpeza da auxiliar.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'gf_28', text: '28- Alvarás e documentos regulatórios em dia.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      },
      {
        id: 'postura_pdv',
        title: 'Postura do Gestor e Equipe (PDV)',
        items: [
          { id: 'pdv_1', text: '1- Uso da campainha na entrada de clientes.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pdv_2', text: '2- Abertura de caixa cartão diária.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pdv_3', text: '3- Abordagem nominal ao cliente.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pdv_4', text: '4- Solicitação de CPF no atendimento.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pdv_5', text: '5- Cadastro correto no Cashback (com token).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pdv_6', text: '6- Oferecimento de itens "Bola da Vez".', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pdv_7', text: '7- Postura e prontidão na porta da filial.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pdv_8', text: '8- Suporte do gestor na negociação e vendas.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pdv_9', text: '9- Motivação da equipe (campanhas/desafios).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pdv_10', text: '10- Acompanhamento canais digitais (WhatsApp/Televendas/App) e oferta do App Drogaria Cidade/Cadastros.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pdv_11', text: '11- Finalização nominal e oferta de resgate Cashback.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pdv_12', text: '12- Orientação sobre canais digitais aos clientes.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      },
      {
        id: 'final',
        title: 'Finalização',
        items: [
          { id: 'consideracoes', text: 'Considerações Finais e Observações', type: InputType.TEXTAREA, required: true },
        ]
      }
    ]
  },
  {
    id: 'limpeza',
    title: 'Plano de Limpeza Completa',
    description: 'Cronograma otimizado e verificação de limpeza (1 dia c/ esfregação mensal).',
    sections: [
      INFO_BASICA_SECTION,
      {
        id: 'banheiro_cozinha',
        title: 'Banheiro e Cozinha',
        items: [
          { id: 'limp_banheiro', text: 'Banheiro: Lixo, sanitário, pia, espelho, chão.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'limp_cozinha', text: 'Cozinha: Lixo, pia, fogão, chão, louça.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      },
      {
        id: 'deposito',
        title: 'Depósito e Pallets',
        items: [
          { id: 'limp_deposito', text: 'Depósito: Organização, teias, varrer, limpar chão.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'limp_pallets', text: 'Pallets: Limpeza com água e detergente.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      },
      {
        id: 'sala_corredores',
        title: 'Salas e Corredores',
        items: [
          { id: 'limp_teias', text: 'Remoção de teias de aranha.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'limp_po', text: 'Pó dos móveis e objetos.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'limp_vidros', text: 'Janelas e portas de vidro.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'limp_chao_sala', text: 'Varrer e passar pano úmido.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      },
      {
        id: 'esfregacao',
        title: 'Esfregação Mensal do Chão',
        items: [
          { id: 'esf_aplicacao', text: 'Aplicação de desengordurante/sapólio.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'esf_acao', text: 'Tempo de ação do produto.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'esf_escova', text: 'Esfregação com escova/vassoura.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'esf_enxague', text: 'Enxágue e secagem.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      }
    ]
  },
  {
    id: 'cronograma',
    title: 'Cronograma Diário de Atividades',
    description: 'Rotina operacional das 07:30 às 18:00.',
    sections: [
      INFO_BASICA_SECTION,
      {
        id: 'manha',
        title: 'Manhã (07:30 - 12:00)',
        items: [
          { id: 'crono_0730', text: '07:30 - Logs, Fechamento Caixas, Café.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_0800', text: '08:00 - Revisão de Metas (CMV, TKT, etc).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_0815', text: '08:15 - Impressão/Análise Planilha Vendas.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_0845', text: '08:45 - Análise Índice Fidelização.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_0915', text: '09:15 - Reunião Alinhamento Equipe.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_0945', text: '09:45 - Análise Resultados Individuais.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_app_manha', text: 'Acompanhamento de vendas no App e Canais Digitais (Entrada/Saída).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_1015', text: '10:15 - Política de Precificação.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_1030', text: '10:30 - Ações Corretivas.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_1100', text: '11:00 - Monitoramento Contínuo.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_1130', text: '11:30 - Preparação Turno Tarde.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      },
      {
        id: 'tarde',
        title: 'Tarde (14:30 - 18:00)',
        items: [
          { id: 'crono_1430', text: '14:30 - Eventos, Café, Balões.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_1500', text: '15:00 - Verificar Remanejo/Transferências.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_1515', text: '15:15 - Conferência Fundo de Caixa.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_1545', text: '15:45 - Notas Fiscais Pendentes.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_app_tarde', text: 'Acompanhamento de vendas no App e Canais Digitais (Entrada/Saída).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_1615', text: '16:15 - Reenvio Conteúdos Promocionais.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_1630', text: '16:30 - Limpeza e Organização Setores.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'crono_1700', text: '17:00 - Controle de Validade.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      }
    ]
  },
  {
    id: 'prevencidos',
    title: 'Gestão de Pré-Vencidos e Baixa Rotatividade',
    description: 'Manual de Boas Práticas da Área 2 e Processos de Giro.',
    sections: [
      INFO_BASICA_SECTION,
      {
        id: 'baixa_rotatividade',
        title: 'Baixa Rotatividade',
        items: [
          { id: 'br_verificacao', text: '1. Verificação realizada (sem giro na filial).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'br_contato', text: '2. Contato com PVs para transferência realizado.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'br_prazo', text: '3. Transferência feita com >30 dias de validade.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      },
      {
        id: 'processo_vencimento',
        title: 'Produtos Próximos ao Vencimento',
        items: [
          { id: 'pv_segregacao', text: 'Segregação realizada até dia 20.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pv_exposicao', text: 'Produtos expostos em local visível (Foco).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pv_mips', text: 'Prioridade MIPs: Contato com clientes realizado.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pv_calculo', text: 'Cálculo mensal realizado (Meta < 0.20%).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pv_nota', text: 'Solicitação Nota de Baixa (Vencidos/Avarias).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'pv_desconto', text: 'Desconto Progressivo Aplicado (0.85% custo).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      },
      {
        id: 'etapas_boas_praticas',
        title: 'Etapas Boas Práticas (Área 2)',
        items: [
          { id: 'etapa_notas_pendentes', text: 'Revisão de Notas Fiscais pendentes de entrada (últimos 30 dias).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'etapa_1', text: 'Etapa 1: Planilha enviada até dia 16.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'etapa_2', text: 'Etapa 2: Exposições montadas (Medicamentos/Perfumaria) com preços promocionais visíveis.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'etapa_3', text: 'Etapa 3: Remanejo no sistema (Módulo 223).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'etapa_4', text: 'Etapa 4: Gravação de Preços (até 90 dias).', type: InputType.BOOLEAN_PASS_FAIL, required: true },
          { id: 'etapa_5', text: 'Etapa 5: Treinamento equipe para venda.', type: InputType.BOOLEAN_PASS_FAIL, required: true },
        ]
      }
    ]
  }
];

// --- UI THEMES ---
export const THEMES: Record<ThemeColor, {
  bg: string,
  bgGradient: string,
  border: string,
  text: string,
  ring: string,
  lightBg: string,
  button: string,
  accent: string
}> = {
  red: {
    bg: 'bg-red-600',
    bgGradient: 'bg-gradient-to-br from-red-600 to-red-800',
    border: 'border-red-600',
    text: 'text-red-700',
    ring: 'focus:ring-red-500',
    lightBg: 'bg-red-50',
    button: 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg shadow-red-200',
    accent: 'border-red-500'
  },
  green: {
    bg: 'bg-emerald-600',
    bgGradient: 'bg-gradient-to-br from-emerald-600 to-emerald-800',
    border: 'border-emerald-600',
    text: 'text-emerald-700',
    ring: 'focus:ring-emerald-500',
    lightBg: 'bg-emerald-50',
    button: 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg shadow-emerald-200',
    accent: 'border-emerald-500'
  },
  blue: {
    bg: 'bg-blue-600',
    bgGradient: 'bg-gradient-to-br from-blue-600 to-blue-800',
    border: 'border-blue-600',
    text: 'text-blue-700',
    ring: 'focus:ring-blue-500',
    lightBg: 'bg-blue-50',
    button: 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-200',
    accent: 'border-blue-500'
  },
  yellow: {
    bg: 'bg-amber-500',
    bgGradient: 'bg-gradient-to-br from-amber-500 to-amber-700',
    border: 'border-amber-500',
    text: 'text-amber-700',
    ring: 'focus:ring-amber-500',
    lightBg: 'bg-amber-50',
    button: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-lg shadow-amber-200',
    accent: 'border-amber-500'
  },
};

// --- ACCESS CONTROL ---
export const ACCESS_MODULES: AccessModule[] = [
  {
    id: 'userApproval',
    label: 'Aprovar ou recusar usuários',
    note: 'Painel de pendências e ações rápidas do master que liberam novos cadastros.'
  },
  {
    id: 'userManagement',
    label: 'Criar e suspender usuários',
    note: 'Formulário de criação e lista com bloqueios e destruição de acessos internos.'
  },
  {
    id: 'companyEditing',
    label: 'Editar empresas e áreas',
    note: 'Seleciona empresa, atualiza dados e salva áreas/filiais diretamente pelas configurações.'
  },
  {
    id: 'checklistControl',
    label: 'Preencher, verificar e finalizar checklists',
    note: 'Botões de Recomeçar, Verificar, Assinaturas e uploads que só o master manipula.'
  },
  {
    id: 'supportTickets',
    label: 'Responder tickets e alterar status',
    note: 'Seção de suporte onde o master responde, conclui, arquiva ou reabre chamados.'
  },
  {
    id: 'historyModeration',
    label: 'Filtrar e excluir relatórios',
    note: 'Filtros adicionais na visão de histórico e o botão de excluir relatórios.'
  }
];

export const ACCESS_LEVELS: AccessLevelMeta[] = [
  {
    id: 'MASTER',
    title: 'Master',
    description: 'Acesso total ao sistema e controle completo das permissões.',
    badgeLabel: 'MASTER',
    badgeClasses: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold'
  },
  {
    id: 'ADMINISTRATIVO',
    title: 'Administrativo',
    description: 'Gere relatórios, acesse dados estratégicos e execute tarefas gerenciais.',
    badgeLabel: 'ADMINISTRATIVO',
    badgeClasses: 'bg-orange-500 text-white font-semibold'
  },
  {
    id: 'USER',
    title: 'Usuário Comum',
    description: 'Executa checklists com nível básico conforme o master define.',
    badgeLabel: 'USUÁRIO',
    badgeClasses: 'bg-slate-500 text-white font-semibold'
  }
];

export const INPUT_TYPE_LABELS: Record<InputType, string> = {
  [InputType.TEXT]: 'Texto curto',
  [InputType.TEXTAREA]: 'Texto longo',
  [InputType.DATE]: 'Data',
  [InputType.BOOLEAN_PASS_FAIL]: 'Sim / Não',
  [InputType.RATING_10]: 'Nota 0-10',
  [InputType.HEADER]: 'Cabeçalho',
  [InputType.INFO]: 'Informação'
};

export const generateId = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
