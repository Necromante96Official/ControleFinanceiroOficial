/**
 * Módulo: Gerenciador de Recarga Automática de Benefícios e Ciclos de Fatura
 * Responsabilidade: Coordenar verificações periódicas de recarga de benefícios e reset de ciclos de crédito
 *

 */

export class AutoReloadManager {
  constructor(benefitStore, creditStore = null, intervalMs = 60000) {
    this.benefitStore = benefitStore;
    this.creditStore = creditStore;
    this.intervalMs = intervalMs;
    this.isRunning = false;
  }

  /**
   * Iniciar verificação automática

   */
  start() {
    if (this.isRunning) {
      console.warn("⚠️ Auto reload já está ativo");
      return;
    }

    // Verificar imediatamente ao iniciar
    this.benefitStore.processAutoReloads();
    if (this.creditStore?.processMonthlyReset) {
      this.creditStore.processMonthlyReset();
    }

    // Depois verificar periodicamente
    this.benefitStore.startAutoReloadCheck(this.intervalMs);
    this.isRunning = true;

    console.log(`✅ Auto reload manager iniciado (intervalo: ${this.intervalMs}ms)`);
  }

  /**
   * Parar verificação automática
   */
  stop() {
    this.benefitStore.stopAutoReloadCheck();
    this.isRunning = false;
    console.log("⏹️ Auto reload manager parado");
  }

  /**
   * Forçar verificação imediata

   */
  check() {
    console.log("🔍 Verificando recargas e ciclos agora...");
    this.benefitStore.processAutoReloads();
    if (this.creditStore?.processMonthlyReset) {
      this.creditStore.processMonthlyReset();
    }
  }
}
