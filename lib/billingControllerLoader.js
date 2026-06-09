/**
 * Carga resiliente del controlador del microservicio ARCA (singleton + retry).
 */

const MODULE_PATH = '../arca-microservice/controllers/billing.controller.js';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

let billingController = null;
let loadPromise = null;
let lastError = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadBillingController(force = false) {
  if (billingController && !force) {
    return billingController;
  }

  if (loadPromise && !force) {
    return loadPromise;
  }

  loadPromise = (async () => {
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      attempt += 1;
      try {
        const module = await import(MODULE_PATH);
        billingController = module.default || module;
        lastError = null;
        return billingController;
      } catch (error) {
        lastError = error;
        console.error(
          `❌ Error cargando billing ARCA (intento ${attempt}/${MAX_RETRIES}):`,
          error.message
        );
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }
    billingController = null;
    throw lastError || new Error('No se pudo cargar el controlador ARCA');
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

async function getBillingController() {
  if (billingController) {
    return billingController;
  }
  try {
    return await loadBillingController();
  } catch {
    return null;
  }
}

function isBillingControllerLoaded() {
  return Boolean(billingController);
}

function getBillingControllerLoadError() {
  return lastError?.message || null;
}

/** Precarga en background al arrancar el proceso */
function preloadBillingController() {
  loadBillingController().catch((error) => {
    console.error('❌ Precarga billing ARCA fallida:', error.message);
  });
}

module.exports = {
  getBillingController,
  loadBillingController,
  isBillingControllerLoaded,
  getBillingControllerLoadError,
  preloadBillingController
};
