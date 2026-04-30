const ClientesService = require('../services/ClientesService');

const listarClientes = async (req, res) => {
  try {
    const { page, limit, q } = req.query;
    const result = await ClientesService.listar({ page, limit, q });
    res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('❌ Error listando clientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar clientes',
    });
  }
};

const sugerenciasClientes = async (req, res) => {
  try {
    const { q = '' } = req.query;
    const data = await ClientesService.buscarSugerencias(q);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('❌ Error obteniendo sugerencias de clientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al buscar clientes',
    });
  }
};

const obtenerClientePorId = async (req, res) => {
  try {
    const { id } = req.params;
    const cliente = await ClientesService.obtenerPorId(id);
    if (!cliente) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado',
      });
    }

    const historial = await ClientesService.obtenerHistorial(id, { limit: 20 });
    return res.json({
      success: true,
      data: {
        cliente,
        ...historial,
      },
    });
  } catch (error) {
    console.error('❌ Error obteniendo cliente por id:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener cliente',
    });
  }
};

const obtenerHistorialCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit } = req.query;
    const cliente = await ClientesService.obtenerPorId(id);
    if (!cliente) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado',
      });
    }
    const historial = await ClientesService.obtenerHistorial(id, { limit });
    return res.json({
      success: true,
      data: historial,
    });
  } catch (error) {
    console.error('❌ Error obteniendo historial de cliente:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener historial del cliente',
    });
  }
};

const actualizarCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email } = req.body || {};
    const cliente = await ClientesService.actualizar(id, { nombre, email });
    if (!cliente) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado',
      });
    }
    return res.json({
      success: true,
      message: 'Cliente actualizado correctamente',
      data: cliente,
    });
  } catch (error) {
    console.error('❌ Error actualizando cliente:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar cliente',
    });
  }
};

const eliminarCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const ok = await ClientesService.eliminar(id);
    if (!ok) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado',
      });
    }
    return res.json({
      success: true,
      message: 'Cliente desactivado correctamente',
    });
  } catch (error) {
    console.error('❌ Error eliminando cliente:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar cliente',
    });
  }
};

module.exports = {
  listarClientes,
  sugerenciasClientes,
  obtenerClientePorId,
  obtenerHistorialCliente,
  actualizarCliente,
  eliminarCliente,
};
