/**
 * Módulo: Verificação de Compatibilidade
 * Responsabilidade: Validar suporte a APIs necessárias
 */

export class BrowserCompat {
  /**
   * Verificar compatibilidade do navegador
   */
  static checkCompatibility() {
    const checks = {
      modules: this.checkModules(),
      localStorage: this.checkLocalStorage(),
      fetch: this.checkFetch(),
    };

    const allOk = Object.values(checks).every((v) => v === true);

    if (!allOk) {
      console.warn("⚠️ Compatibilidade limitada:", checks);
    } else {
      console.log("✅ Navegador totalmente compatível");
    }

    return allOk;
  }

  /**
   * Verificar suporte a ES6 Modules
   */
  static checkModules() {
    const supported = "noModule" in document.createElement("script");
    if (!supported) {
      console.error("❌ Navegador não suporta ES6 Modules");
    }
    return supported;
  }

  /**
   * Verificar suporte a localStorage
   */
  static checkLocalStorage() {
    try {
      const test = "__storage_test__";
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      console.warn("⚠️ localStorage não disponível (modo privado?)");
      return false;
    }
  }

  /**
   * Verificar suporte a Fetch API
   */
  static checkFetch() {
    return typeof fetch === "function";
  }
}
