const db = require('../controllers/dbPromise');

/**
 * @typedef {Object} HorarioFranjaRow
 * @property {number} id
 * @property {number} dia_semana
 * @property {string} hora_apertura
 * @property {string} hora_cierre
 * @property {number} activo
 * @property {number} orden
 */

const findAll = async () => {
    const [rows] = await db.execute(
        `SELECT id, dia_semana, hora_apertura, hora_cierre, activo, orden
         FROM horarios_tienda
         ORDER BY dia_semana ASC, orden ASC`
    );
    return rows;
};

const replaceDay = async (diaSemana, franjas) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute(
            'DELETE FROM horarios_tienda WHERE dia_semana = ?',
            [diaSemana]
        );

        for (let i = 0; i < franjas.length; i++) {
            const franja = franjas[i];
            if (!franja.activo) continue;
            await connection.execute(
                `INSERT INTO horarios_tienda (dia_semana, hora_apertura, hora_cierre, activo, orden)
                 VALUES (?, ?, ?, 1, ?)`,
                [diaSemana, franja.hora_apertura, franja.hora_cierre, i]
            );
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = {
    findAll,
    replaceDay
};
