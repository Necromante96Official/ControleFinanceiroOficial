/**
 * Constants - Constantes Centralizadas do Sistema
 * Responsabilidade: Manter valores fixos e configurações em um único lugar
 */

// ============================================
// STORAGE KEYS
// ============================================
export const STORAGE_KEYS = {
  CATEGORIES: 'finance-control:categories',
  BENEFITS: 'finance-control:benefits',
  CREDIT_CARDS: 'finance-control:credit-cards',
  DEBIT_CARDS: 'finance-control:debit-cards',
  TRANSACTIONS: 'finance-control:transactions',
  SYNC_QUEUE: 'finance-control:sync-queue',
  SETTINGS: 'finance-control:settings',
  LOCALE: 'finance-control:locale',
  THEME: 'finance-control:theme',
  LAST_SYNC: 'finance-control:last-sync',
  SCROLL_POSITION: 'finance-control:scroll-position',
  APP_STARTUP_TIME: 'finance-control:startup-time'
};

// ============================================
// TIMINGS
// ============================================
export const TIMINGS = {
  APP_INIT_DELAY: 1500,       // Delay após splash para inicializar app (reduzido para APK)
  SCROLL_DEBOUNCE: 100,       // Debounce para persistir scroll
  TOAST_DURATION: 3000,       // Duração padrão de toasts
  ANIMATION_DURATION: 300,    // Duração padrão de animações
  BENEFIT_RELOAD_CHECK: 300000    // Intervalo para verificar recarga de benefícios (5 min - era 1 min)
};

// ============================================
// CONFIGURAÇÕES PADRÃO
// ============================================
export const DEFAULT_SETTINGS = {
  locale: 'pt-BR',
  currency: 'BRL',
  theme: 'dark',
  notifications: true,
  autoSync: true,
  syncInterval: 60000, // 1 minuto
  benefitReloadCheckInterval: 3600000, // 1 hora
  dateFormat: 'DD/MM/YYYY',
  timeFormat: 'HH:mm'
};

// ============================================
// LIMITES E VALIDAÇÕES
// ============================================
export const LIMITS = {
  // Comprimentos de campos
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 50,
  DESCRIPTION_MAX_LENGTH: 200,
  
  // Valores monetários
  MIN_VALUE: 0.01,
  MAX_VALUE: 999999999.99,
  
  // Dias
  MIN_DAY: 1,
  MAX_DAY: 31,
  
  // Quantidades
  MAX_CATEGORIES: 100,
  MAX_BENEFITS: 50,
  MAX_CREDIT_CARDS: 20,
  MAX_DEBIT_CARDS: 20,
  MAX_TRANSACTIONS_DISPLAY: 100,
  
  // Paginação
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100
};

// ============================================
// TIPOS DE TRANSAÇÃO
// ============================================
export const TRANSACTION_TYPES = {
  INCOME: 'entrada',
  EXPENSE: 'saida'
};

// ============================================
// MÉTODOS DE PAGAMENTO
// ============================================
export const PAYMENT_METHODS = {
  DEBIT: 'debito',
  CREDIT: 'credito',
  BENEFIT: 'beneficio',
  CASH: 'dinheiro',
  PIX: 'pix',
  TRANSFER: 'transferencia'
};

// ============================================
// CORES PADRÃO
// ============================================
export const COLORS = {
  PRIMARY: '#1fc2c0',
  PRIMARY_DARK: '#17a2a0',
  SECONDARY: '#0d1117',
  SUCCESS: '#28a745',
  WARNING: '#ffc107',
  DANGER: '#dc3545',
  INFO: '#17a2b8',
  
  // Gradiente principal
  GRADIENT: {
    START: '#0d1117',
    END: '#161b22'
  },
  
  // Cores de texto
  TEXT: {
    PRIMARY: '#c9d1d9',
    SECONDARY: '#8b949e',
    MUTED: '#6c757d'
  },
  
  // Cores de borda
  BORDER: {
    DEFAULT: '#30363d',
    FOCUS: '#1fc2c0'
  }
};

// ============================================
// PALETA DE CORES PARA CATEGORIAS
// ============================================
export const CATEGORY_COLORS = [
  '#1fc2c0', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  '#85C1E9', '#F8B500', '#00CED1', '#FF69B4', '#32CD32',
  '#FFD700', '#9370DB', '#20B2AA', '#FF7F50', '#87CEEB'
];

// ============================================
// ÍCONES PARA CATEGORIAS
// ============================================
export const CATEGORY_ICONS = [
  // Alimentação
  '🍔', '🍕', '🍜', '🥗', '☕', '🍺', '🍷', '🥤',
  // Transporte
  '🚗', '🚌', '✈️', '⛽', '🚇', '🚕', '🛵', '🚲',
  // Casa
  '🏠', '💡', '💧', '📺', '🛋️', '🔧', '🧹', '🏢',
  // Saúde
  '💊', '🏥', '💉', '🩺', '🦷', '👓', '🧘', '💪',
  // Educação
  '📚', '🎓', '✏️', '💻', '🎨', '🎵', '📝', '🔬',
  // Lazer
  '🎮', '🎬', '🎭', '🎪', '⚽', '🎾', '🏊', '🎯',
  // Compras
  '🛒', '👕', '👠', '💄', '⌚', '💎', '🎁', '🛍️',
  // Finanças
  '💰', '💳', '🏦', '📈', '💵', '💸', '🪙', '💹',
  // Pets
  '🐕', '🐈', '🐠', '🐦', '🦮', '🐾',
  // Outros
  '📱', '🖥️', '📷', '🔒', '⭐', '❤️', '🎉', '✨'
];

// ============================================
// MENSAGENS DE ERRO
// ============================================
export const ERROR_MESSAGES = {
  GENERIC: 'Ocorreu um erro. Tente novamente.',
  NETWORK: 'Erro de conexão. Verifique sua internet.',
  STORAGE_FULL: 'Armazenamento cheio. Libere espaço.',
  INVALID_DATA: 'Dados inválidos.',
  NOT_FOUND: 'Item não encontrado.',
  DUPLICATE: 'Este item já existe.',
  PERMISSION_DENIED: 'Permissão negada.',
  
  // Validação
  REQUIRED: 'Este campo é obrigatório.',
  MIN_LENGTH: 'Texto muito curto.',
  MAX_LENGTH: 'Texto muito longo.',
  INVALID_VALUE: 'Valor inválido.',
  INVALID_DATE: 'Data inválida.',
  POSITIVE_VALUE: 'O valor deve ser positivo.'
};

// ============================================
// EVENTOS DO SISTEMA
// ============================================
export const EVENTS = {
  // Dados
  DATA_UPDATED: 'data:updated',
  DATA_SYNCED: 'data:synced',
  DATA_CLEARED: 'data:cleared',
  
  // Navegação
  TAB_CHANGED: 'tab:changed',
  MODAL_OPENED: 'modal:opened',
  MODAL_CLOSED: 'modal:closed',
  
  // Conectividade
  ONLINE: 'connectivity:online',
  OFFLINE: 'connectivity:offline',
  
  // App
  APP_READY: 'app:ready',
  APP_UPDATE: 'app:update',
  
  // Notificações
  NOTIFICATION_RECEIVED: 'notification:received',
  NOTIFICATION_CLICKED: 'notification:clicked'
};

// ============================================
// REGEX PATTERNS
// ============================================
export const PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^(\+55\s?)?(\d{2})?\s?\d{4,5}[-\s]?\d{4}$/,
  CPF: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
  CNPJ: /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/,
  DATE_BR: /^\d{2}\/\d{2}\/\d{4}$/,
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  CURRENCY: /^R?\$?\s?\d{1,3}(\.\d{3})*(,\d{2})?$/,
  SAFE_TEXT: /^[^<>]*$/
};

// ============================================
// TIMEOUTS E INTERVALOS
// ============================================
export const TIMEOUTS = {
  DEBOUNCE: 300,
  TOAST_DURATION: 3000,
  MODAL_ANIMATION: 200,
  SPLASH_SCREEN: 1500,
  AUTO_SAVE: 5000,
  NETWORK_RETRY: 3000,
  SESSION_CHECK: 60000
};

// ============================================
// BREAKPOINTS RESPONSIVOS
// ============================================
export const BREAKPOINTS = {
  XS: 320,
  SM: 480,
  MD: 768,
  LG: 1024,
  XL: 1280
};

// ============================================
// STATUS DE OPERAÇÃO
// ============================================
export const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  SYNCING: 'syncing'
};

// ============================================
// FORMATOS DE DATA/HORA
// ============================================
export const DATE_FORMATS = {
  SHORT: { day: '2-digit', month: '2-digit', year: 'numeric' },
  LONG: { day: '2-digit', month: 'long', year: 'numeric' },
  WITH_TIME: { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  TIME_ONLY: { hour: '2-digit', minute: '2-digit' },
  WEEKDAY: { weekday: 'long', day: '2-digit', month: '2-digit' }
};

// ============================================
// MOEDAS SUPORTADAS
// ============================================
export const CURRENCIES = {
  BRL: { code: 'BRL', symbol: 'R$', name: 'Real Brasileiro' },
  USD: { code: 'USD', symbol: '$', name: 'Dólar Americano' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro' }
};

// ============================================
// EXPORTAÇÃO DE HELPER FUNCTIONS
// ============================================

/**
 * Verifica se um valor está dentro dos limites
 */
export function isWithinLimits(value, min, max) {
  return value >= min && value <= max;
}

/**
 * Retorna cor aleatória da paleta
 */
export function getRandomColor() {
  return CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
}

/**
 * Retorna ícone aleatório
 */
export function getRandomIcon() {
  return CATEGORY_ICONS[Math.floor(Math.random() * CATEGORY_ICONS.length)];
}
