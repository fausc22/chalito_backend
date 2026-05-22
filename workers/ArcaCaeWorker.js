const db = require('../controllers/dbPromise');
const { solicitarCaeParaVenta } = require('../services/ArcaFacturacionService');

const MAX_REINTENTOS = parseInt(process.env.ARCA_CAE_MAX_REINTENTOS, 10) || 5;
const INTERVAL_MS = parseInt(process.env.ARCA_CAE_WORKER_INTERVAL_MS, 10) || 60_000;
const BATCH_SIZE = 10;

class ArcaCaeWorker {
  constructor() {
    this.intervalId = null;
    this.running = false;
    this.executionCount = 0;
  }

  start() {
    if (this.intervalId) return;
    console.log(`🚀 [ArcaCaeWorker] Iniciando (intervalo ${INTERVAL_MS / 1000}s)`);
    this.intervalId = setInterval(() => this.tick().catch((e) => {
      console.error('❌ [ArcaCaeWorker]:', e.message);
    }), INTERVAL_MS);
    setImmediate(() => this.tick().catch(() => {}));
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('🛑 [ArcaCaeWorker] Detenido');
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    this.executionCount += 1;
    const start = Date.now();

    try {
      // LIMIT no admite placeholder en prepared statements de MySQL (mysqld_stmt_execute).
      const limit = Math.max(1, Math.min(50, Number(BATCH_SIZE) || 10));
      const [pendientes] = await db.query(
        `SELECT v.id
         FROM ventas v
         WHERE v.cae_estado IN ('PENDIENTE', 'ERROR')
           AND v.tipo_factura = 'B'
           AND v.estado = 'FACTURADA'
         ORDER BY v.id ASC
         LIMIT ${limit}`
      );

      for (const row of pendientes) {
        const ventaId = row.id;
        const [errCount] = await db.query(
          `SELECT COUNT(*) AS c FROM arca_solicitudes_log WHERE venta_id = ? AND estado = 'ERROR'`,
          [ventaId]
        );
        if ((errCount[0]?.c || 0) >= MAX_REINTENTOS) {
          await db.query(
            `UPDATE ventas SET cae_estado = 'ERROR_PERMANENTE' WHERE id = ? AND cae_estado = 'ERROR'`,
            [ventaId]
          );
          continue;
        }
        await solicitarCaeParaVenta(ventaId);
        await new Promise((r) => setTimeout(r, 500));
      }

      if (pendientes.length > 0) {
        console.log(
          `✅ [ArcaCaeWorker] Ciclo #${this.executionCount} (${Date.now() - start}ms) procesadas=${pendientes.length}`
        );
      }
    } finally {
      this.running = false;
    }
  }
}

module.exports = new ArcaCaeWorker();
