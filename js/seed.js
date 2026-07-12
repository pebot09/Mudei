/* ============================================================
   Mudei — dados iniciais
   Itens importados da planilha "planilha_gastos_mudanca.xlsx"
   + checklist de mudança pré-montado.
   updatedAt = 0 garante que qualquer edição do usuário
   sempre vence na hora de mesclar dados compartilhados.
   ============================================================ */

const SEED_CATS = [
  { id: 'sala',     name: 'Sala',            emoji: '🛋️' },
  { id: 'quarto',   name: 'Quarto',          emoji: '🛏️' },
  { id: 'cozinha',  name: 'Cozinha',         emoji: '🍳' },
  { id: 'banheiro', name: 'Banheiro',        emoji: '🚿' },
  { id: 'servico',  name: 'Área de Serviço', emoji: '🧺' },
  { id: 'limpeza',  name: 'Limpeza',         emoji: '🧴' },
  { id: 'outros',   name: 'Outros',          emoji: '📦' },
];

function seedItem(id, cat, name, prio, extra) {
  return Object.assign({
    id: 'it-' + id,
    cat, name, prio,
    status: 'pendente',        // pendente | pesquisando | comprado | doado
    cond: '',                  // novo | usado | doacao
    specs: '', space: '',
    budget: null, bestPrice: null, paidPrice: null,
    donor: '', assigneeId: '',
    links: [], notes: '',
    createdAt: 0, updatedAt: 0, updatedBy: '',
  }, extra || {});
}

const SEED_ITEMS = [
  // ---------- Sala ----------
  seedItem('sofa', 'sala', 'Sofá', 'media', {
    links: [{ label: 'Opção vista na Amazon', url: 'https://a.co/d/0iuPCosk' }],
  }),
  seedItem('tv', 'sala', 'TV', 'media'),
  seedItem('mesa-cadeiras', 'sala', 'Mesa e cadeiras', 'alta'),

  // ---------- Quarto ----------
  seedItem('guarda-roupa', 'quarto', 'Guarda-roupa ou arara', 'media', {
    links: [{
      label: 'Guarda-roupa Moval Chile 4 portas 2 gavetas — Casas Bahia',
      url: 'https://www.casasbahia.com.br/guarda-roupa-moval-chile-com-4-portas-e-2-gavetas/p/55025911',
    }],
  }),

  // ---------- Cozinha ----------
  seedItem('geladeira', 'cozinha', 'Geladeira', 'alta', {
    cond: 'novo',
    space: '75 cm (73 cm onde encontra o armário) × altura livre × 52,5 cm',
    specs: 'Faixa de orçamento pesquisada: R$ 1.500 a R$ 2.200.',
    budget: 2200,
    bestPrice: 1519,
    links: [
      {
        label: 'Electrolux 240 L cycle defrost, R$ 1.519, altura 1,40 m — Magalu',
        url: 'https://www.magazineluiza.com.br/geladeira-refrigerador-electrolux-degelo-pratico-240-litros-cycle-defrost-branco-re31-110v/p/fak9kf77jg/ed/ref1/?seller_id=dufrio&region_id=123474',
      },
      {
        label: 'Electrolux 260 L duplex, R$ 2.100, altura 1,60 m — Mercado Livre',
        url: 'https://www.mercadolivre.com.br/geladeira-electrolux-cycle-defrost-260l-super-freezer-duplex-branca-dc35a/p/MLB8017585',
      },
    ],
    notes: 'Vão de 75 cm, reduzido a 73 cm na parte superior. Modelos de cerca de 55 cm cabem, mas a porta abrindo para a direita pode bater na parede. Preferir modelo com porta reversível ou confirmar abertura com 10 cm de folga lateral.',
  }),
  seedItem('fogao', 'cozinha', 'Fogão', 'alta', {
    cond: 'novo',
    space: '58 cm × 1,8 m × 52,5 cm',
    specs: 'Faixa de orçamento pesquisada: R$ 950 a R$ 1.120.',
    budget: 1120,
    bestPrice: 948,
    links: [
      {
        label: 'Consul 4 bocas mesa de inox, R$ 948 — Casas Bahia',
        url: 'https://www.casasbahia.com.br/fogao-consul-4-bocas-cfo4nab-com-mesa-de-inox-acendimento-automatico-e-design-frente-unica-bivolt-branco/p/6460226',
      },
      {
        label: 'Brastemp 4 bocas, R$ 1.116, grade mais estável e forno maior — Casas Bahia',
        url: 'https://www.casasbahia.com.br/fogao-brastemp-4-bocas-bfo4nbb-clean-com-mesa-de-inox-2-prateleiras-ajustaveis-e-acendimento-automatico-bivolt-branco/p/55051221',
      },
    ],
    notes: 'Vão disponível: 58 cm. O Consul CFO4NAR tem 51,5 cm de largura e exige 3 cm de folga de cada lado (57,5 cm no total); o Brastemp BFO4NBR tem 51 cm e também exige 3 cm de cada lado (57 cm no total). Ambos cabem, mas com pouca margem. O armário começa a 1,80 m do chão; como a mesa dos fogões fica a aproximadamente 94–95 cm, restam cerca de 85 cm livres acima, superando os 65 cm mínimos exigidos.',
  }),
  seedItem('microondas', 'cozinha', 'Micro-ondas', 'alta'),
  seedItem('panelas', 'cozinha', 'Panelas', 'media'),
  seedItem('talheres', 'cozinha', 'Talheres', 'alta'),
  seedItem('copos', 'cozinha', 'Copos', 'alta'),
  seedItem('pratos', 'cozinha', 'Pratos', 'alta'),
  seedItem('potes', 'cozinha', 'Potes', 'alta'),
  seedItem('facas', 'cozinha', 'Facas de cozinha', 'media'),
  seedItem('tabua', 'cozinha', 'Tábua de corte', 'baixa'),

  // ---------- Banheiro ----------
  seedItem('espelho', 'banheiro', 'Espelho', 'media'),
  seedItem('escova-privada', 'banheiro', 'Escova de privada', 'alta'),

  // ---------- Área de Serviço ----------
  seedItem('maquina-lavar', 'servico', 'Máquina de lavar', 'baixa'),
  seedItem('varal', 'servico', 'Varal', 'baixa'),

  // ---------- Limpeza ----------
  seedItem('desinfetante', 'limpeza', 'Desinfetante', 'alta'),
  seedItem('sabao-po', 'limpeza', 'Sabão em pó', 'baixa'),
  seedItem('alcool', 'limpeza', 'Álcool 70', 'media'),
  seedItem('multiuso', 'limpeza', 'Multiuso', 'media'),
  seedItem('sabao-coco', 'limpeza', 'Sabão de coco', 'baixa'),
  seedItem('detergente', 'limpeza', 'Detergente', 'alta'),
];

function seedTask(id, phase, title, notes) {
  return {
    id: 't-' + id, phase, title, notes: notes || '',
    done: false, assigneeId: '', due: '',
    createdAt: 0, updatedAt: 0, updatedBy: '',
  };
}

const SEED_TASKS = [
  // ---------- Planejamento (antes) ----------
  seedTask('data', 'antes', 'Definir a data da mudança'),
  seedTask('frete', 'antes', 'Cotar frete/carreto (pelo menos 3 orçamentos)'),
  seedTask('medidas', 'antes', 'Medir portas, corredores e vãos do novo lar', 'Anotar as medidas nos itens grandes (geladeira, fogão, sofá, guarda-roupa).'),
  seedTask('caixas', 'antes', 'Juntar caixas de papelão, fita e plástico-bolha', 'Mercados e farmácias costumam doar caixas.'),
  seedTask('internet', 'antes', 'Agendar instalação de internet no novo endereço'),
  seedTask('luz', 'antes', 'Pedir ligação/transferência da conta de luz'),
  seedTask('agua', 'antes', 'Pedir ligação/transferência da conta de água'),
  seedTask('gas', 'antes', 'Providenciar botijão/ligação de gás'),
  seedTask('docs', 'antes', 'Separar documentos importantes numa pasta', 'RG, contratos, comprovantes, carteira de vacinação, etc.'),
  seedTask('desapegar', 'antes', 'Separar o que não vai: doar, vender ou descartar'),

  // ---------- Semana da mudança ----------
  seedTask('encaixotar', 'semana', 'Encaixotar por cômodo e etiquetar as caixas', 'Use a aba Caixas para numerar e listar o conteúdo.'),
  seedTask('mala', 'semana', 'Montar a mala dos primeiros dias', 'Roupas, remédios, higiene, carregadores — como se fosse uma viagem.'),
  seedTask('confirmar-frete', 'semana', 'Confirmar horário e endereço com o frete'),
  seedTask('degelo', 'semana', 'Descongelar e limpar a geladeira 24 h antes'),
  seedTask('limpeza-novo', 'semana', 'Fazer a limpeza pesada do imóvel novo'),
  seedTask('desmontar', 'semana', 'Desmontar móveis e guardar parafusos em saquinhos etiquetados'),

  // ---------- Dia da mudança ----------
  seedTask('kit-dia', 'dia', 'Deixar um kit básico acessível', 'Papel higiênico, copos, água, lanche, carregador, ferramentas.'),
  seedTask('valores', 'dia', 'Levar documentos e objetos de valor com você (não no caminhão)'),
  seedTask('conferir-carga', 'dia', 'Conferir as caixas ao carregar e descarregar', 'Use a lista de caixas para dar baixa.'),
  seedTask('leituras', 'dia', 'Anotar leitura de luz e água nos dois imóveis'),
  seedTask('chaves', 'dia', 'Entregar as chaves do imóvel antigo'),

  // ---------- Primeiros dias (depois) ----------
  seedTask('caixas-prio', 'depois', 'Desfazer primeiro as caixas marcadas "abrir primeiro"'),
  seedTask('montar', 'depois', 'Montar os móveis'),
  seedTask('endereco', 'depois', 'Atualizar endereço: banco, trabalho, planos, e-commerce'),
  seedTask('correios', 'depois', 'Contratar redirecionamento de correspondência nos Correios'),
  seedTask('titulo', 'depois', 'Atualizar título de eleitor e cadastros públicos'),
  seedTask('vizinhanca', 'depois', 'Explorar a vizinhança: mercado, farmácia, padaria, UBS'),
];

/* Kit enxoval: sugestões de itens que todo mundo esquece.
   Adicionados à lista de compras com um toque. */
const KIT_ENXOVAL = [
  // ---------- Cozinha ----------
  { cat: 'cozinha', name: 'Lixeira de pia', prio: 'media' },
  { cat: 'cozinha', name: 'Escorredor de louça', prio: 'media' },
  { cat: 'cozinha', name: 'Frigideira', prio: 'media' },
  { cat: 'cozinha', name: 'Panela de pressão', prio: 'baixa' },
  { cat: 'cozinha', name: 'Chaleira', prio: 'baixa' },
  { cat: 'cozinha', name: 'Assadeiras', prio: 'baixa' },
  { cat: 'cozinha', name: 'Jarra', prio: 'baixa' },
  { cat: 'cozinha', name: 'Concha, escumadeira e colher grande', prio: 'media' },
  { cat: 'cozinha', name: 'Abridor de latas e garrafas', prio: 'media' },
  { cat: 'cozinha', name: 'Panos de prato', prio: 'media' },
  { cat: 'cozinha', name: 'Luva térmica', prio: 'baixa' },
  { cat: 'cozinha', name: 'Papel alumínio e filme plástico', prio: 'baixa' },
  { cat: 'cozinha', name: 'Galão ou filtro de água', prio: 'alta' },
  { cat: 'cozinha', name: 'Fósforos ou acendedor', prio: 'alta' },
  // ---------- Banheiro ----------
  { cat: 'banheiro', name: 'Chuveiro (se o imóvel não tiver)', prio: 'alta' },
  { cat: 'banheiro', name: 'Papel higiênico (estoque)', prio: 'alta' },
  { cat: 'banheiro', name: 'Toalhas de banho e rosto', prio: 'alta' },
  { cat: 'banheiro', name: 'Cortina de box', prio: 'media' },
  { cat: 'banheiro', name: 'Lixeira de banheiro', prio: 'media' },
  { cat: 'banheiro', name: 'Desentupidor', prio: 'media' },
  { cat: 'banheiro', name: 'Tapete de banheiro', prio: 'baixa' },
  { cat: 'banheiro', name: 'Porta-escova de dentes', prio: 'baixa' },
  { cat: 'banheiro', name: 'Saboneteira', prio: 'baixa' },
  // ---------- Quarto ----------
  { cat: 'quarto', name: 'Jogo de cama (2 trocas)', prio: 'alta' },
  { cat: 'quarto', name: 'Travesseiros', prio: 'alta' },
  { cat: 'quarto', name: 'Edredom ou cobertor', prio: 'media' },
  { cat: 'quarto', name: 'Cabides', prio: 'media' },
  { cat: 'quarto', name: 'Cortina ou blackout', prio: 'baixa' },
  { cat: 'quarto', name: 'Abajur ou luminária', prio: 'baixa' },
  { cat: 'quarto', name: 'Espelho de corpo inteiro', prio: 'baixa' },
  // ---------- Sala ----------
  { cat: 'sala', name: 'Extensão / filtro de linha', prio: 'media' },
  { cat: 'sala', name: 'Cortina', prio: 'baixa' },
  { cat: 'sala', name: 'Tapete', prio: 'baixa' },
  { cat: 'sala', name: 'Suporte de TV', prio: 'baixa' },
  // ---------- Área de Serviço ----------
  { cat: 'servico', name: 'Vassoura', prio: 'alta' },
  { cat: 'servico', name: 'Rodo', prio: 'alta' },
  { cat: 'servico', name: 'Pá de lixo', prio: 'media' },
  { cat: 'servico', name: 'Balde', prio: 'media' },
  { cat: 'servico', name: 'Cesto de roupa suja', prio: 'media' },
  { cat: 'servico', name: 'Pregadores de roupa', prio: 'baixa' },
  { cat: 'servico', name: 'Tábua e ferro de passar', prio: 'baixa' },
  // ---------- Limpeza ----------
  { cat: 'limpeza', name: 'Sacos de lixo (vários tamanhos)', prio: 'alta' },
  { cat: 'limpeza', name: 'Esponjas', prio: 'alta' },
  { cat: 'limpeza', name: 'Panos de chão', prio: 'alta' },
  { cat: 'limpeza', name: 'Água sanitária', prio: 'media' },
  { cat: 'limpeza', name: 'Desengordurante', prio: 'media' },
  { cat: 'limpeza', name: 'Limpa-vidros', prio: 'baixa' },
  // ---------- Outros ----------
  { cat: 'outros', name: 'Lâmpadas extras', prio: 'alta' },
  { cat: 'outros', name: 'Kit ferramentas básicas', prio: 'media' },
  { cat: 'outros', name: 'Fita isolante e fita crepe', prio: 'media' },
  { cat: 'outros', name: 'Adaptadores de tomada', prio: 'media' },
  { cat: 'outros', name: 'Kit primeiros socorros', prio: 'media' },
  { cat: 'outros', name: 'Pilhas', prio: 'baixa' },
  { cat: 'outros', name: 'Lanterna', prio: 'baixa' },
  { cat: 'outros', name: 'Capacho', prio: 'baixa' },
  { cat: 'outros', name: 'Guarda-chuva', prio: 'baixa' },
];

const TASK_PHASES = [
  { id: 'antes',  name: 'Planejamento',      emoji: '🗓️', hint: 'Ideal começar 1 mês antes' },
  { id: 'semana', name: 'Semana da mudança', emoji: '📦', hint: 'Últimos 7 dias' },
  { id: 'dia',    name: 'Dia da mudança',    emoji: '🚚', hint: 'O grande dia' },
  { id: 'depois', name: 'Primeiros dias',    emoji: '🏠', hint: 'Já no novo lar' },
];

function makeSeedState() {
  return {
    version: 1,
    meta: {
      title: 'Minha Mudança',
      movingDate: '',
      budgetTotal: null,
      updatedAt: 0,
    },
    people: [],
    items: SEED_ITEMS.map(i => JSON.parse(JSON.stringify(i))),
    tasks: SEED_TASKS.map(t => JSON.parse(JSON.stringify(t))),
    boxes: [],
    cats: SEED_CATS.map(c => JSON.parse(JSON.stringify(Object.assign({ createdAt: 0, updatedAt: 0 }, c)))),
    log: [],
  };
}
