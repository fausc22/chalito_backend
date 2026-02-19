# 🍔 Sistema Chalito - Backend API

Backend del sistema gastronomico **El Chalito**.  
API REST construida con Node.js + Express + MySQL, con soporte de tiempo real via Socket.IO.

---

## 🧾 Descripcion

Esta API centraliza la logica del negocio para gestionar:

- usuarios
- pedidos y comandas
- productos
- categorias
- ventas
- gastos
- cuentas y movimientos de fondos
- autenticacion
- eventos en tiempo real con Socket.IO

El backend esta pensado para integrarse con:

- sistema web interno (Next.js)
- futura carta online

---

## 🛠️ Tecnologias utilizadas

- **Node.js**
- **Express.js**
- **MySQL** (`mysql2`)
- **Socket.IO**
- **JWT** (`jsonwebtoken`)
- **bcryptjs**
- **dotenv**

---

## 📦 Instalacion

```bash
npm install
```

---

## ⚙️ Configuracion

Crear archivo `.env` en la raiz del proyecto:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=xxxx
DB_DATABASE=sistema_chalito
DB_PORT=3306

JWT_SECRET=tu_secret
PORT=3001
```

> Recomendacion: no subir secretos ni credenciales reales al repositorio.

---

## ▶️ Ejecucion

### Desarrollo

```bash
npm run dev
```

### Produccion

```bash
npm start
```

---

## 🧱 Estructura del proyecto

```text
chalito_backend/
├── controllers/    # Logica de negocio por modulo
├── routes/         # Definicion de endpoints
├── middlewares/    # Auth, auditoria, rate limiting, etc.
├── config/         # Configuracion externa (ej: Cloudinary)
├── services/       # Servicios auxiliares y tiempo real
├── validators/     # Validaciones de payload y parametros
├── workers/        # Procesos de fondo (cola de pedidos)
├── migrations/     # Migraciones SQL
├── scripts/        # Scripts operativos (si aplica en entorno)
├── uploads/        # Archivos subidos (opcional segun despliegue)
└── server.js       # Entrada principal (Express + Socket.IO)
```

---

## ✨ Caracteristicas principales

- API REST para operacion y administracion gastronomica
- Autenticacion y proteccion de rutas con JWT
- Gestion de pedidos/comandas y ventas
- Modulo financiero: gastos, cuentas y movimientos de fondos
- Eventos en tiempo real con Socket.IO
- Integracion con multiples frontends

---

## 📜 Scripts disponibles

```bash
npm run dev         # Desarrollo con nodemon
npm run dev:debug   # Desarrollo con inspector de Node (--inspect)
npm start           # Inicio de servidor en modo produccion
npm run migrate     # Ejecuta scripts de migracion
npm run seed        # Ejecuta carga de datos iniciales
npm test            # Placeholder de tests (actualmente no implementados)
```

---

## 🌐 Endpoints principales

Base URL local:

```text
http://localhost:3001
```

> Nota: la mayoria de rutas de negocio requieren token JWT en `Authorization: Bearer <token>`.

### 🔐 Auth (`/auth`)

- `POST /auth/login` - Login de usuario
- `POST /auth/refresh-token` - Renovacion de token
- `POST /auth/logout` - Cierre de sesion
- `GET /auth/profile` - Perfil del usuario autenticado
- `PUT /auth/change-password` - Cambio de contrasena
- `GET /auth/verify` - Verificacion de token/sesion

### 📦 Inventario y productos

**Inventario (`/inventario`)**

- `GET /inventario/articulos`
- `GET /inventario/articulos/:id`
- `POST /inventario/articulos`
- `PUT /inventario/articulos/:id`
- `DELETE /inventario/articulos/:id`
- `GET /inventario/ingredientes`
- `POST /inventario/ingredientes`
- `PUT /inventario/ingredientes/:id`
- `DELETE /inventario/ingredientes/:id`
- `GET /inventario/categorias`
- `POST /inventario/categorias`
- `PUT /inventario/categorias/:id`
- `DELETE /inventario/categorias/:id`
- `GET /inventario/adicionales`
- `POST /inventario/adicionales`
- `PUT /inventario/adicionales/:id`
- `DELETE /inventario/adicionales/:id`

**Articulos (`/articulos`)**

- `POST /articulos/upload-imagen`
- `GET /articulos/categorias`
- `GET /articulos`
- `GET /articulos/:id`
- `POST /articulos`
- `PUT /articulos/:id`
- `DELETE /articulos/:id`

### 🧾 Pedidos y comandas

**Pedidos (`/pedidos`)**

- `POST /pedidos`
- `GET /pedidos`
- `GET /pedidos/:id`
- `PUT /pedidos/:id`
- `PUT /pedidos/:id/estado`
- `POST /pedidos/:id/forzar-estado`
- `POST /pedidos/:id/cobrar`
- `PUT /pedidos/:id/observaciones`
- `DELETE /pedidos/:id`
- `POST /pedidos/:id/articulos`
- `GET /pedidos/:id/comanda-print`
- `GET /pedidos/:id/ticket-print`
- `GET /pedidos/capacidad`

**Comandas (`/comandas`)**

- `POST /comandas`
- `GET /comandas`
- `GET /comandas/:id`
- `PUT /comandas/:id/observaciones`

### 💰 Ventas, gastos y fondos

**Ventas (`/ventas`)**

- `GET /ventas/resumen`
- `GET /ventas/medios-pago`
- `GET /ventas`
- `POST /ventas`
- `GET /ventas/:id`
- `PUT /ventas/:id/anular`

**Gastos (`/gastos`)**

- `GET /gastos/cuentas`
- `GET /gastos/resumen`
- `GET /gastos/categorias`
- `POST /gastos/categorias`
- `PUT /gastos/categorias/:id`
- `DELETE /gastos/categorias/:id`
- `GET /gastos`
- `POST /gastos`
- `GET /gastos/:id`
- `PUT /gastos/:id`
- `DELETE /gastos/:id`

**Fondos (`/fondos`)**

- `GET /fondos/cuentas`
- `POST /fondos/cuentas`
- `GET /fondos/cuentas/:id`
- `PUT /fondos/cuentas/:id`
- `DELETE /fondos/cuentas/:id`
- `POST /fondos/movimientos`
- `GET /fondos/cuentas/:id/movimientos`
- `GET /fondos/cuentas/:id/historial`

### 🩺 Salud, metricas y configuracion

- `GET /health` - Healthcheck general de servidor + DB
- `GET /health/worker` - Estado del worker de pedidos
- `GET /metrics/pedidos-atrasados` - Metricas operativas
- `GET /configuracion-sistema` - Configuraciones
- `GET /configuracion-sistema/:clave` - Configuracion por clave
- `PUT /configuracion-sistema/:clave` - Actualizacion de configuracion

### 🧠 Auditoria (`/auditoria`)

- `GET /auditoria`
- `GET /auditoria/detalle/:id`
- `GET /auditoria/datos-filtros`
- `GET /auditoria/estadisticas`
- `GET /auditoria/test-simple`
- `GET /auditoria/debug`

---

## 🔌 Tiempo real (Socket.IO)

El servidor publica eventos de estado (por ejemplo worker/cola de pedidos) y permite suscripciones desde clientes frontend.

Eventos observados en el servidor:

- `worker_status`
- `worker_heartbeat`
- `worker_status:request`
- `worker:status:request`
- `subscribe:worker-status`
- `subscribe:pedidos`
- `subscribe:capacidad`

---

## 🔗 Integracion con frontend

Este backend es consumido por:

- **Sistema web interno (Next.js)**
- **Futura carta online**

Ambos consumen la misma API para mantener reglas de negocio consistentes.

---

## 👤 Autor

**Sistema Chalito**