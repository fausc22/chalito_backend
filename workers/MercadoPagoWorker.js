const db = require('../controllers/dbPromise');
const { ejecutarMantenimientoSesionesMercadoPago } = require('../services/CartaPublicaMercadoPagoCheckoutService');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Worker: expiración de sesiones MP, limpieza y reconciliación contra API de pagos.
 */
class MercadoPagoWorker {
    constructor() {
        this.task = null;
        this.isRunning = false;
        this.intervalMs = DEFAULT_INTERVAL_MS;
        this.executionCount = 0;
    }

    start(customIntervalMs = null) {
        if (this.isRunning) {
            console.log('⚠️ [MercadoPagoWorker] Ya está corriendo');
            return;
        }
        if (customIntervalMs && Number(customIntervalMs) > 0) {
            this.intervalMs = Number(customIntervalMs);
        }
        this.isRunning = true;
        console.log(`🚀 [MercadoPagoWorker] Iniciando (intervalo ${this.intervalMs / 1000}s)`);

        void this.execute().catch((e) => {
            console.error('❌ [MercadoPagoWorker] Primera ejecución:', e.message);
        });

        this.task = setInterval(() => {
            void this.execute().catch((e) => {
                console.error('❌ [MercadoPagoWorker] Ejecución periódica:', e.message);
            });
        }, this.intervalMs);
    }

    async execute() {
        this.executionCount += 1;
        const inicio = Date.now();
        const resultado = await ejecutarMantenimientoSesionesMercadoPago(db);
        const ms = Date.now() - inicio;
        console.log(
            `✅ [MercadoPagoWorker] Ciclo #${this.executionCount} (${ms}ms) reconciliadas=${resultado.reconciliadas ?? 0}`
        );
        return resultado;
    }

    stop() {
        if (!this.isRunning) {
            return;
        }
        if (this.task) {
            clearInterval(this.task);
            this.task = null;
        }
        this.isRunning = false;
        console.log('🛑 [MercadoPagoWorker] Detenido');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            intervalMs: this.intervalMs,
            executionCount: this.executionCount
        };
    }
}

module.exports = new MercadoPagoWorker();
