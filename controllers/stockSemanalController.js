const stockSemanalService = require('../services/StockSemanalService');
const { auditarOperacion } = require('../middlewares/auditoriaMiddleware');

const responderError = (res, error, fallbackMessage) => {
    const status = error?.status || 500;
    const payload = {
        success: false,
        message: error?.message || fallbackMessage
    };

    if (error?.code) {
        payload.code = error.code;
    }

    if (error?.details) {
        payload.details = error.details;
    }

    if (process.env.NODE_ENV === 'development') {
        payload.error = error?.message;
    }

    return res.status(status).json(payload);
};

const usuarioId = (req) => req.user?.id;

const listarInsumos = async (req, res) => {
    try {
        const q = req.validatedQuery || {};
        const data = await stockSemanalService.listarInsumosSemanales({
            incluirInactivos: q.incluir_inactivos
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('[stockSemanal] listarInsumos', error);
        return responderError(res, error, 'Error al listar insumos semanales');
    }
};

const crearInsumo = async (req, res) => {
    try {
        const body = req.validatedData || req.body;
        const data = await stockSemanalService.crearInsumoSemanal(body);

        await auditarOperacion(req, {
            accion: 'CREATE_STOCK_SEMANAL_INSUMO',
            tabla: 'insumos_semanales',
            registroId: data?.id,
            datosNuevos: { nombre: body.nombre, activo: body.activo },
            detallesAdicionales: `Insumo semanal: ${body.nombre}`
        });

        res.status(201).json({ success: true, message: 'Insumo creado', data });
    } catch (error) {
        console.error('[stockSemanal] crearInsumo', error);
        return responderError(res, error, 'Error al crear insumo');
    }
};

const editarInsumo = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const body = req.validatedData || req.body;
        const anterior = await stockSemanalService.obtenerInsumoPorId(id);
        if (!anterior) {
            return res.status(404).json({ success: false, message: 'Insumo no encontrado' });
        }

        const data = await stockSemanalService.editarInsumoSemanal(id, body);
        await auditarOperacion(req, {
            accion: 'UPDATE_STOCK_SEMANAL_INSUMO',
            tabla: 'insumos_semanales',
            registroId: id,
            datosAnteriores: { nombre: anterior.nombre, descripcion: anterior.descripcion },
            datosNuevos: body,
            detallesAdicionales: `Insumo semanal id ${id}`
        });

        res.json({ success: true, message: 'Insumo actualizado', data });
    } catch (error) {
        console.error('[stockSemanal] editarInsumo', error);
        return responderError(res, error, 'Error al editar insumo');
    }
};

const patchActivoInsumo = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const { activo } = req.validatedData || req.body;
        const data = await stockSemanalService.setActivoInsumoSemanal(id, activo);
        if (!data) {
            return res.status(404).json({ success: false, message: 'Insumo no encontrado' });
        }

        await auditarOperacion(req, {
            accion: 'PATCH_STOCK_SEMANAL_INSUMO_ACTIVO',
            tabla: 'insumos_semanales',
            registroId: id,
            datosNuevos: { activo },
            detallesAdicionales: `Insumo semanal id ${id} activo=${activo}`
        });

        res.json({ success: true, message: 'Estado actualizado', data });
    } catch (error) {
        console.error('[stockSemanal] patchActivoInsumo', error);
        return responderError(res, error, 'Error al actualizar estado del insumo');
    }
};

const eliminarInsumo = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const anterior = await stockSemanalService.obtenerInsumoPorId(id);
        if (!anterior) {
            return res.status(404).json({ success: false, message: 'Insumo no encontrado' });
        }

        await stockSemanalService.eliminarInsumoSemanal(id);

        await auditarOperacion(req, {
            accion: 'DELETE_STOCK_SEMANAL_INSUMO',
            tabla: 'insumos_semanales',
            registroId: id,
            datosAnteriores: { nombre: anterior.nombre, descripcion: anterior.descripcion, activo: anterior.activo },
            detallesAdicionales: `Insumo semanal eliminado id ${id}`
        });

        res.json({ success: true, message: 'Insumo eliminado', data: { id: Number(id) } });
    } catch (error) {
        console.error('[stockSemanal] eliminarInsumo', error);
        return responderError(res, error, 'Error al eliminar insumo');
    }
};

const obtenerSemanaAbierta = async (req, res) => {
    try {
        const data = await stockSemanalService.obtenerSemanaAbierta();
        if (!data) {
            return res.json({
                success: true,
                code: 'SIN_SEMANA_ABIERTA',
                message: 'No hay semana de stock abierta actualmente',
                data: null
            });
        }
        res.json({ success: true, data });
    } catch (error) {
        console.error('[stockSemanal] obtenerSemanaAbierta', error);
        return responderError(res, error, 'Error al obtener semana abierta');
    }
};

const crearSemana = async (req, res) => {
    try {
        const body = req.validatedData || req.body;
        const data = await stockSemanalService.crearSemanaStock(body, usuarioId(req));

        await auditarOperacion(req, {
            accion: 'CREATE_STOCK_SEMANAL_SEMANA',
            tabla: 'semanas_stock',
            registroId: data?.id,
            datosNuevos: {
                fecha_inicio: body.fecha_inicio,
                fecha_fin: body.fecha_fin
            },
            detallesAdicionales: `Semana stock ${body.fecha_inicio} a ${body.fecha_fin}`
        });

        res.status(201).json({ success: true, message: 'Semana creada con detalle', data });
    } catch (error) {
        console.error('[stockSemanal] crearSemana', error);
        return responderError(res, error, 'Error al crear semana de stock');
    }
};

const historicoSemanas = async (req, res) => {
    try {
        const q = req.validatedQuery || req.query || {};
        const data = await stockSemanalService.listarHistoricoSemanas(q);
        res.json({ success: true, data });
    } catch (error) {
        console.error('[stockSemanal] historicoSemanas', error);
        return responderError(res, error, 'Error al obtener historico de semanas');
    }
};

const obtenerSemanaPorId = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const data = await stockSemanalService.obtenerSemanaConDetalle(id);
        if (!data) {
            return res.status(404).json({ success: false, message: 'Semana no encontrada' });
        }
        res.json({ success: true, data });
    } catch (error) {
        console.error('[stockSemanal] obtenerSemanaPorId', error);
        return responderError(res, error, 'Error al obtener semana');
    }
};

const actualizarStockInicial = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const { stock_inicial, observaciones } = req.validatedData || req.body;
        const data = await stockSemanalService.actualizarStockInicialDetalle(id, stock_inicial, observaciones);

        await auditarOperacion(req, {
            accion: 'UPDATE_STOCK_SEMANAL_DETALLE_INICIAL',
            tabla: 'semanas_stock_detalle',
            registroId: id,
            datosNuevos: { stock_inicial, observaciones },
            detallesAdicionales: `Detalle id ${id}`
        });

        res.json({ success: true, message: 'Stock inicial actualizado', data });
    } catch (error) {
        console.error('[stockSemanal] actualizarStockInicial', error);
        return responderError(res, error, 'Error al actualizar stock inicial');
    }
};

const actualizarStockFinal = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const { stock_final, observaciones } = req.validatedData || req.body;
        const data = await stockSemanalService.actualizarStockFinalDetalle(id, stock_final, observaciones);

        await auditarOperacion(req, {
            accion: 'UPDATE_STOCK_SEMANAL_DETALLE_FINAL',
            tabla: 'semanas_stock_detalle',
            registroId: id,
            datosNuevos: { stock_final, observaciones },
            detallesAdicionales: `Detalle id ${id}`
        });

        res.json({ success: true, message: 'Stock final actualizado', data });
    } catch (error) {
        console.error('[stockSemanal] actualizarStockFinal', error);
        return responderError(res, error, 'Error al actualizar stock final');
    }
};

const cerrarSemana = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const data = await stockSemanalService.cerrarSemanaStock(id, usuarioId(req));

        await auditarOperacion(req, {
            accion: 'CERRAR_STOCK_SEMANAL_SEMANA',
            tabla: 'semanas_stock',
            registroId: id,
            datosNuevos: { estado: 'CERRADA' },
            detallesAdicionales: `Cierre semana id ${id}`
        });

        res.json({ success: true, message: 'Semana cerrada', data });
    } catch (error) {
        console.error('[stockSemanal] cerrarSemana', error);
        return responderError(res, error, 'Error al cerrar semana');
    }
};

module.exports = {
    listarInsumos,
    crearInsumo,
    editarInsumo,
    patchActivoInsumo,
    eliminarInsumo,
    obtenerSemanaAbierta,
    crearSemana,
    historicoSemanas,
    obtenerSemanaPorId,
    actualizarStockInicial,
    actualizarStockFinal,
    cerrarSemana
};
