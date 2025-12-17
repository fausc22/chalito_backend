# 🚀 Guía Paso a Paso: Deploy del Backend en Render

Esta guía te ayudará a desplegar tu backend de El Chalito en Render con una base de datos MySQL.

---

## 📋 Prerrequisitos

1. ✅ Cuenta en [Render](https://render.com) (crear con GitHub o email)
2. ✅ Backend en un repositorio Git (GitHub, GitLab o Bitbucket)
3. ✅ Node.js instalado localmente (para pruebas)

---

## 🗄️ Paso 1: Crear Base de Datos MySQL en Render

### 1.1 Crear nueva base de datos

1. Ve a [Render Dashboard](https://dashboard.render.com/)
2. Haz clic en **"New +"** → **"MySQL"**
3. Configura:
   - **Name**: `chalito-db` (o el nombre que prefieras)
   - **Database**: `chalito` (nombre de tu base de datos)
   - **User**: `chalito_user` (se crea automáticamente)
   - **Region**: Elige la más cercana a Argentina (ej: `Ohio (US East)`)
   - **MySQL Version**: 8.0
   - **Instance Type**: 
     - 🆓 **Free** (para pruebas, con limitaciones)
     - 💵 **Starter** ($7/mes, recomendado para producción)

4. Haz clic en **"Create Database"**

### 1.2 Obtener credenciales de conexión

Una vez creada, verás en el dashboard:
- **Hostname**: `xxx.oregon-postgres.render.com`
- **Port**: `3306`
- **Database**: `chalito`
- **Username**: `chalito_user`
- **Password**: `[contraseña generada]`
- **Internal Database URL**: `mysql://chalito_user:password@xxx:3306/chalito`

> ⚠️ **IMPORTANTE**: Guarda estas credenciales, las necesitarás después.

### 1.3 Conectar y crear las tablas

#### Opción A: Usando MySQL Workbench (Recomendado)

1. Abre MySQL Workbench
2. Crea una nueva conexión:
   - **Hostname**: (el que te dio Render)
   - **Port**: 3306
   - **Username**: (el que te dio Render)
   - **Password**: (la que te dio Render)
3. Conéctate y ejecuta el script `Estructura-BD.sql` que está en tu backend

#### Opción B: Usando Render Shell (Alternativa)

1. En el dashboard de la base de datos, haz clic en **"Connect"** → **"External Connection"**
2. Copia el comando de conexión
3. Desde tu terminal local:
   ```bash
   mysql -h [hostname] -u [username] -p[password] -P 3306 chalito
   ```
4. Ejecuta el contenido de `Estructura-BD.sql`

---

## 🚀 Paso 2: Desplegar el Backend

### 2.1 Preparar el repositorio

1. Asegúrate de que tu backend esté en un repositorio Git
2. Si no está, crea uno:
   ```bash
   cd C:\Users\facu_\elchalito\chalito-backend
   git init
   git add .
   git commit -m "Initial commit"
   ```
3. Sube a GitHub:
   ```bash
   # Crea un repositorio en GitHub primero
   git remote add origin https://github.com/tu-usuario/chalito-backend.git
   git branch -M main
   git push -u origin main
   ```

### 2.2 Crear Web Service en Render

1. Ve a [Render Dashboard](https://dashboard.render.com/)
2. Haz clic en **"New +"** → **"Web Service"**
3. Conecta tu repositorio:
   - Si es la primera vez, autoriza a Render para acceder a GitHub
   - Selecciona el repositorio `chalito-backend`

### 2.3 Configurar el Web Service

#### Build & Deploy Settings:

- **Name**: `chalito-backend` (o el nombre que prefieras)
- **Region**: La misma que elegiste para la base de datos
- **Branch**: `main` (o la rama que uses)
- **Root Directory**: (dejar vacío si el backend está en la raíz)
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

#### Instance Type:
- 🆓 **Free** (para pruebas, con limitaciones: duerme después de 15 min sin uso)
- 💵 **Starter** ($7/mes, recomendado para producción)

### 2.4 Configurar Variables de Entorno

En la sección **"Environment Variables"**, agrega las siguientes variables:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Entorno de ejecución |
| `PORT` | `3001` | Puerto del servidor (Render usa 10000 por defecto, pero puedes usar 3001) |
| `DB_HOST` | `[hostname de tu BD]` | Del paso 1.2 |
| `DB_PORT` | `3306` | Puerto MySQL |
| `DB_USER` | `[username de tu BD]` | Del paso 1.2 |
| `DB_PASSWORD` | `[password de tu BD]` | Del paso 1.2 |
| `DB_DATABASE` | `chalito` | Nombre de tu base de datos |
| `JWT_SECRET` | `[genera una clave segura]` | Clave secreta para JWT (genera una aleatoria) |
| `JWT_EXPIRES_IN` | `24h` | Duración del token |
| `REFRESH_TOKEN_SECRET` | `[genera otra clave]` | Clave para refresh tokens |
| `REFRESH_TOKEN_EXPIRES_IN` | `7d` | Duración del refresh token |

> 💡 **Generar claves seguras**: Usa este comando en tu terminal:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 2.5 Deploy

1. Haz clic en **"Create Web Service"**
2. Render comenzará a construir y desplegar tu backend (tarda 3-5 minutos)
3. Verás los logs en tiempo real
4. Cuando termine, verás: **"Your service is live 🎉"**

---

## 🔗 Paso 3: Obtener la URL del Backend

Una vez desplegado, tu backend estará disponible en:

```
https://chalito-backend.onrender.com
```

(Reemplaza `chalito-backend` con el nombre que elegiste)

### Probar el backend

Abre en tu navegador:
```
https://chalito-backend.onrender.com/health
```

Deberías ver algo como:
```json
{
  "status": "ok",
  "timestamp": "2025-12-17...",
  "database": {
    "connected": true,
    "responseTime": "25ms"
  }
}
```

---

## 🔗 Paso 4: Configurar el Frontend (Vercel)

Ahora que tienes el backend desplegado, vuelve a Vercel:

1. Ve a tu proyecto en Vercel
2. **Settings** → **Environment Variables**
3. Agrega o edita:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_API_URL` | `https://chalito-backend.onrender.com` |

4. Guarda los cambios
5. Ve a **Deployments** → Clic en los tres puntos del último deployment → **Redeploy**

> ⚠️ **IMPORTANTE**: Después de cambiar variables de entorno en Vercel, SIEMPRE debes hacer un redeploy.

---

## 📝 Paso 5: Actualizar CORS en el Backend

Para que el frontend en Vercel pueda comunicarse con el backend, debes agregar la URL de Vercel a la lista de orígenes permitidos.

1. Edita el archivo `server.js` en tu backend:

```javascript
const allowedOrigins = [
    'http://localhost:3000', 
    'https://chalitonextjs.vercel.app',  // ← Tu URL de Vercel
    'https://tu-proyecto.vercel.app'     // ← Si tienes otra URL personalizada
];
```

2. Commit y push:
```bash
git add server.js
git commit -m "Agregar URL de Vercel a CORS"
git push origin main
```

3. Render detectará el cambio y redesplegará automáticamente

---

## 🎉 ¡Listo!

Tu aplicación está completamente desplegada:

- 🌐 **Frontend**: `https://chalitonextjs.vercel.app`
- 🔌 **Backend**: `https://chalito-backend.onrender.com`
- 🗄️ **Base de Datos**: MySQL en Render

---

## 🐛 Solución de Problemas Comunes

### ❌ Error: "Cannot connect to database"

**Solución**:
1. Verifica que las credenciales de la base de datos sean correctas
2. Asegúrate de que la base de datos esté activa (puede tardar hasta 1 minuto en iniciar)
3. Revisa los logs en Render: **Dashboard** → **tu-web-service** → **Logs**

### ❌ Error: "CORS blocked"

**Solución**:
1. Asegúrate de agregar la URL de Vercel a `allowedOrigins` en `server.js`
2. Haz commit y push para que se redespliegue
3. Espera 2-3 minutos a que se complete el deploy

### ❌ Backend "duerme" (plan Free)

**Síntoma**: La primera petición tarda mucho (30+ segundos)

**Causa**: En el plan Free de Render, el servicio se duerme después de 15 minutos de inactividad

**Soluciones**:
- **Opción 1**: Upgrade a plan Starter ($7/mes)
- **Opción 2**: Implementar un "keep-alive" que haga ping al backend cada 10 minutos
- **Opción 3**: Usar otro servicio como Railway (también tiene limitaciones en plan gratuito)

### ❌ Error: "Build failed"

**Solución**:
1. Verifica que `package.json` tenga el script `"start": "node server.js"`
2. Asegúrate de que todas las dependencias estén en `dependencies` (no en `devDependencies`)
3. Revisa los logs del build en Render

---

## 📊 Monitoreo

### Ver logs en tiempo real:
1. Ve a tu Web Service en Render
2. Click en **"Logs"**
3. Verás los logs en tiempo real

### Ver métricas:
1. Ve a tu Web Service en Render
2. Click en **"Metrics"**
3. Verás CPU, memoria, requests, etc.

---

## 💰 Costos Estimados

### Plan Free (para pruebas):
- Base de datos MySQL: 🆓 Gratis (1GB, con limitaciones)
- Web Service: 🆓 Gratis (duerme después de 15 min sin uso)
- **Total**: $0/mes

### Plan Starter (recomendado para producción):
- Base de datos MySQL Starter: $7/mes (10GB)
- Web Service Starter: $7/mes (512MB RAM, siempre activo)
- **Total**: ~$14/mes

### Comparación con Railway:
- Railway: $5/mes de crédito gratuito, luego ~$5-10/mes según uso
- Render: Plan más predecible y con mejor uptime

---

## 🔄 Actualizaciones Futuras

Cada vez que hagas cambios en el backend:

1. Commit y push a GitHub:
   ```bash
   git add .
   git commit -m "Descripción de los cambios"
   git push origin main
   ```

2. Render detectará el cambio automáticamente y redesplegará

3. Espera 2-3 minutos a que se complete el deploy

4. Verifica que todo funcione: `https://chalito-backend.onrender.com/health`

---

## 📚 Recursos Adicionales

- [Documentación de Render](https://render.com/docs)
- [Render Status](https://status.render.com/)
- [Render Community](https://community.render.com/)

---

## ⚠️ Notas de Seguridad

1. **NUNCA** subas el archivo `.env` a Git
2. Todas las variables de entorno deben configurarse en Render
3. Usa claves JWT seguras (mínimo 32 caracteres aleatorios)
4. Activa HTTPS en producción (Render lo hace automáticamente)
5. Considera implementar rate limiting más estricto en producción

---

¿Problemas? Revisa los logs en Render o consulta la documentación oficial.

