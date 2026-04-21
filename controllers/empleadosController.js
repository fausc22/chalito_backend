const {
    obtenerEmpleados: obtenerEmpleadosService,
    obtenerEmpleadoPorId: obtenerEmpleadoPorIdService,
    crearEmpleado: crearEmpleadoService,
    actualizarEmpleado: actualizarEmpleadoService,
    actualizarActivoEmpleado: actualizarActivoEmpleadoService,
    obtenerAsistencias: obtenerAsistenciasService,
    obtenerAsistenciaPorId: obtenerAsistenciaPorIdService,
    registrarIngresoAsistencia: registrarIngresoAsistenciaService,
    registrarEgresoAsistencia: registrarEgresoAsistenciaService,
    corregirAsistencia: corregirAsistenciaService,
    obtenerMovimientos: obtenerMovimientosService,
    obtenerMovimientoPorId: obtenerMovimientoPorIdService,
    crearMovimiento: crearMovimientoService,
    editarMovimiento: editarMovimientoService,
    eliminarMovimiento: eliminarMovimientoService,
    calcularResumenLiquidacion: calcularResumenLiquidacionService,
    obtenerLiquidaciones: obtenerLiquidacionesService,
    obtenerLiquidacionPorId: obtenerLiquidacionPorIdService,
    crearLiquidacion: crearLiquidacionService
} = require('../services/EmpleadosService');
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

    if (process.env.NODE_ENV === 'development') {
        payload.error = error?.message;
    }

    return res.status(status).json(payload);
};

const obtenerEmpleados = async (req, res) => {
    try {
        const filters = req.validatedQuery || req.query || {};
        const data = await obtenerEmpleadosService(filters);
        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('❌ Error al obtener empleados:', error);
        return responderError(res, error, 'Error al obtener empleados');
    }
};

const obtenerEmpleadoPorId = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const data = await obtenerEmpleadoPorIdService(id);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('❌ Error al obtener empleado por ID:', error);
        return responderError(res, error, 'Error al obtener empleado');
    }
};

const crearEmpleado = async (req, res) => {
    try {
        const payload = req.validatedData || req.body;
        const data = await crearEmpleadoService(payload);

        await auditarOperacion(req, {
            accion: 'CREATE_EMPLEADO',
            tabla: 'empleados',
            registroId: data?.id || null,
            datosNuevos: {
                nombre: payload.nombre,
                apellido: payload.apellido,
                tipo_pago: payload.tipo_pago,
                fecha_ingreso: payload.fecha_ingreso
            },
            detallesAdicionales: `Empleado creado: ${payload.apellido}, ${payload.nombre}`
        });

        res.status(201).json({
            success: true,
            message: 'Empleado creado exitosamente',
            data
        });
    } catch (error) {
        console.error('❌ Error al crear empleado:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Ya existe un empleado con el mismo email o documento'
            });
        }

        return responderError(res, error, 'Error al crear empleado');
    }
};

const editarEmpleado = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const payload = req.validatedData || req.body;

        const empleadoAnterior = await obtenerEmpleadoPorIdService(id);
        if (!empleadoAnterior) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        await actualizarEmpleadoService(id, payload);
        const empleadoActualizado = await obtenerEmpleadoPorIdService(id);

        await auditarOperacion(req, {
            accion: 'UPDATE_EMPLEADO',
            tabla: 'empleados',
            registroId: id,
            datosAnteriores: {
                nombre: empleadoAnterior.nombre,
                apellido: empleadoAnterior.apellido,
                valor_hora: empleadoAnterior.valor_hora,
                activo: empleadoAnterior.activo
            },
            datosNuevos: {
                nombre: empleadoActualizado.nombre,
                apellido: empleadoActualizado.apellido,
                valor_hora: empleadoActualizado.valor_hora,
                activo: empleadoActualizado.activo
            },
            detallesAdicionales: `Empleado actualizado: #${id}`
        });

        res.json({
            success: true,
            message: 'Empleado actualizado exitosamente',
            data: empleadoActualizado
        });
    } catch (error) {
        console.error('❌ Error al editar empleado:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Ya existe un empleado con el mismo email o documento'
            });
        }

        return responderError(res, error, 'Error al editar empleado');
    }
};

const actualizarEstadoEmpleado = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const { activo } = req.validatedData || req.body;

        const empleadoAnterior = await obtenerEmpleadoPorIdService(id);
        if (!empleadoAnterior) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado'
            });
        }

        await actualizarActivoEmpleadoService(id, activo);
        const empleadoActualizado = await obtenerEmpleadoPorIdService(id);

        await auditarOperacion(req, {
            accion: activo ? 'ACTIVAR_EMPLEADO' : 'INACTIVAR_EMPLEADO',
            tabla: 'empleados',
            registroId: id,
            datosAnteriores: { activo: empleadoAnterior.activo },
            datosNuevos: { activo: empleadoActualizado.activo },
            detallesAdicionales: `Empleado #${id} ${activo ? 'activado' : 'inactivado'}`
        });

        res.json({
            success: true,
            message: activo ? 'Empleado activado exitosamente' : 'Empleado inactivado exitosamente',
            data: empleadoActualizado
        });
    } catch (error) {
        console.error('❌ Error al actualizar estado del empleado:', error);
        return responderError(res, error, 'Error al actualizar estado del empleado');
    }
};

const obtenerAsistencias = async (req, res) => {
    try {
        const filters = req.validatedQuery || req.query || {};
        const data = await obtenerAsistenciasService(filters);
        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('❌ Error al obtener asistencias:', error);
        return responderError(res, error, 'Error al obtener asistencias');
    }
};

const obtenerAsistenciaPorId = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const data = await obtenerAsistenciaPorIdService(id);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Asistencia no encontrada'
            });
        }

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('❌ Error al obtener asistencia por ID:', error);
        return responderError(res, error, 'Error al obtener asistencia');
    }
};

const registrarIngresoAsistencia = async (req, res) => {
    try {
        const payload = req.validatedData || req.body;
        const data = await registrarIngresoAsistenciaService(payload, req.user || {});

        await auditarOperacion(req, {
            accion: 'ASISTENCIA_INGRESO',
            tabla: 'empleados_asistencias',
            registroId: data?.id || null,
            datosNuevos: {
                empleado_id: payload.empleado_id,
                fecha: data?.fecha,
                estado: 'ABIERTO'
            },
            detallesAdicionales: `Ingreso registrado para empleado #${payload.empleado_id}`
        });

        res.status(201).json({
            success: true,
            message: 'Ingreso registrado exitosamente',
            data
        });
    } catch (error) {
        console.error('❌ Error al registrar ingreso de asistencia:', error);
        return responderError(res, error, 'Error al registrar ingreso');
    }
};

const registrarEgresoAsistencia = async (req, res) => {
    try {
        const payload = req.validatedData || req.body;
        const data = await registrarEgresoAsistenciaService(payload);

        await auditarOperacion(req, {
            accion: 'ASISTENCIA_EGRESO',
            tabla: 'empleados_asistencias',
            registroId: data?.id || null,
            datosNuevos: {
                empleado_id: payload.empleado_id,
                minutos_trabajados: data?.minutos_trabajados,
                estado: 'CERRADO'
            },
            detallesAdicionales: `Egreso registrado para empleado #${payload.empleado_id}`
        });

        res.json({
            success: true,
            message: 'Egreso registrado exitosamente',
            data
        });
    } catch (error) {
        console.error('❌ Error al registrar egreso de asistencia:', error);
        return responderError(res, error, 'Error al registrar egreso');
    }
};

const corregirAsistencia = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const payload = req.validatedData || req.body;
        const data = await corregirAsistenciaService(id, payload, req.user || {});

        await auditarOperacion(req, {
            accion: 'ASISTENCIA_CORREGIDA',
            tabla: 'empleados_asistencias',
            registroId: id,
            datosNuevos: {
                estado: 'CORREGIDO',
                motivo_correccion: payload.motivo_correccion
            },
            detallesAdicionales: `Asistencia #${id} corregida manualmente`
        });

        res.json({
            success: true,
            message: 'Asistencia corregida exitosamente',
            data
        });
    } catch (error) {
        console.error('❌ Error al corregir asistencia:', error);
        return responderError(res, error, 'Error al corregir asistencia');
    }
};

const obtenerMovimientos = async (req, res) => {
    try {
        const filters = req.validatedQuery || req.query || {};
        const data = await obtenerMovimientosService(filters);
        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('❌ Error al obtener movimientos:', error);
        return responderError(res, error, 'Error al obtener movimientos');
    }
};

const obtenerMovimientoPorId = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const data = await obtenerMovimientoPorIdService(id);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Movimiento no encontrado'
            });
        }

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('❌ Error al obtener movimiento por ID:', error);
        return responderError(res, error, 'Error al obtener movimiento');
    }
};

const crearMovimiento = async (req, res) => {
    try {
        const payload = req.validatedData || req.body;
        const data = await crearMovimientoService(payload, req.user || {});

        await auditarOperacion(req, {
            accion: 'CREATE_EMPLEADO_MOVIMIENTO',
            tabla: 'empleados_movimientos',
            registroId: data?.id || null,
            datosNuevos: {
                empleado_id: payload.empleado_id,
                tipo: payload.tipo,
                monto: payload.monto
            },
            detallesAdicionales: `Movimiento ${payload.tipo} para empleado #${payload.empleado_id}`
        });

        res.status(201).json({
            success: true,
            message: 'Movimiento creado exitosamente',
            data
        });
    } catch (error) {
        console.error('❌ Error al crear movimiento:', error);
        return responderError(res, error, 'Error al crear movimiento');
    }
};

const editarMovimiento = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const payload = req.validatedData || req.body;

        const movimientoAnterior = await obtenerMovimientoPorIdService(id);
        if (!movimientoAnterior) {
            return res.status(404).json({
                success: false,
                message: 'Movimiento no encontrado'
            });
        }

        const data = await editarMovimientoService(id, payload, req.user || {});

        await auditarOperacion(req, {
            accion: 'UPDATE_EMPLEADO_MOVIMIENTO',
            tabla: 'empleados_movimientos',
            registroId: id,
            datosAnteriores: {
                empleado_id: movimientoAnterior.empleado_id,
                tipo: movimientoAnterior.tipo,
                monto: movimientoAnterior.monto,
                fecha: movimientoAnterior.fecha
            },
            datosNuevos: {
                empleado_id: data.empleado_id,
                tipo: data.tipo,
                monto: data.monto,
                fecha: data.fecha
            },
            detallesAdicionales: `Movimiento #${id} actualizado`
        });

        res.json({
            success: true,
            message: 'Movimiento actualizado exitosamente',
            data
        });
    } catch (error) {
        console.error('❌ Error al editar movimiento:', error);
        return responderError(res, error, 'Error al editar movimiento');
    }
};

const eliminarMovimiento = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const movimientoEliminado = await eliminarMovimientoService(id);

        await auditarOperacion(req, {
            accion: 'DELETE_EMPLEADO_MOVIMIENTO',
            tabla: 'empleados_movimientos',
            registroId: id,
            datosAnteriores: {
                empleado_id: movimientoEliminado.empleado_id,
                tipo: movimientoEliminado.tipo,
                monto: movimientoEliminado.monto,
                fecha: movimientoEliminado.fecha,
                descripcion: movimientoEliminado.descripcion
            },
            detallesAdicionales: `Movimiento #${id} eliminado`
        });

        res.json({
            success: true,
            message: 'Movimiento eliminado exitosamente'
        });
    } catch (error) {
        console.error('❌ Error al eliminar movimiento:', error);
        return responderError(res, error, 'Error al eliminar movimiento');
    }
};

const obtenerLiquidaciones = async (req, res) => {
    try {
        const filters = req.validatedQuery || req.query || {};
        const data = await obtenerLiquidacionesService(filters);
        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('❌ Error al obtener liquidaciones:', error);
        return responderError(res, error, 'Error al obtener liquidaciones');
    }
};

const calcularResumenDesdeRequest = async (input) => {
    const { empleado_id, fecha_desde, fecha_hasta, incluir_detalle } = input || {};

    return calcularResumenLiquidacionService({
        empleado_id,
        fecha_desde,
        fecha_hasta,
        incluir_detalle: Boolean(incluir_detalle)
    });
};

const obtenerResumenLiquidacion = async (req, res) => {
    try {
        const data = await calcularResumenDesdeRequest(req.validatedQuery || req.query || {});

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('❌ Error al calcular resumen de liquidacion:', error);
        return responderError(res, error, 'Error al calcular resumen de liquidacion');
    }
};

const calcularResumenLiquidacion = async (req, res) => {
    try {
        const data = await calcularResumenDesdeRequest(req.validatedData || req.body || {});

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('❌ Error al calcular resumen de liquidacion (POST):', error);
        return responderError(res, error, 'Error al calcular resumen de liquidacion');
    }
};

const obtenerLiquidacionPorId = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const data = await obtenerLiquidacionPorIdService(id);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Liquidacion no encontrada'
            });
        }

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('❌ Error al obtener liquidacion por ID:', error);
        return responderError(res, error, 'Error al obtener liquidacion');
    }
};

const crearLiquidacion = async (req, res) => {
    try {
        const payload = req.validatedData || req.body;
        const data = await crearLiquidacionService(payload, req.user || {});

        await auditarOperacion(req, {
            accion: 'CREATE_EMPLEADO_LIQUIDACION',
            tabla: 'empleados_liquidaciones',
            registroId: data?.id || null,
            datosNuevos: {
                empleado_id: payload.empleado_id,
                fecha_desde: payload.fecha_desde,
                fecha_hasta: payload.fecha_hasta,
                total_base: data?.total_base,
                total_bonos: data?.total_bonos,
                total_descuentos: data?.total_descuentos,
                total_adelantos: data?.total_adelantos,
                total_consumos: data?.total_consumos,
                total_final: data?.total_final || 0,
                estado: data?.estado
            },
            detallesAdicionales: `Liquidacion registrada para empleado #${payload.empleado_id}`
        });

        res.status(201).json({
            success: true,
            message: 'Liquidacion creada exitosamente',
            data
        });
    } catch (error) {
        console.error('❌ Error al crear liquidacion:', error);
        return responderError(res, error, 'Error al crear liquidacion');
    }
};

module.exports = {
    obtenerEmpleados,
    obtenerEmpleadoPorId,
    crearEmpleado,
    editarEmpleado,
    actualizarEstadoEmpleado,
    obtenerAsistencias,
    obtenerAsistenciaPorId,
    registrarIngresoAsistencia,
    registrarEgresoAsistencia,
    corregirAsistencia,
    obtenerMovimientos,
    obtenerMovimientoPorId,
    crearMovimiento,
    editarMovimiento,
    eliminarMovimiento,
    obtenerResumenLiquidacion,
    calcularResumenLiquidacion,
    obtenerLiquidaciones,
    obtenerLiquidacionPorId,
    crearLiquidacion
};
