# Certificados AFIP

Esta carpeta debe contener los certificados digitales para autenticarse con AFIP.

## Archivos necesarios

```
certs/
├── certificado.crt    # Certificado digital AFIP (.crt o .pem)
└── clave_privada.key  # Clave privada (.key)
```

## ¿Cómo obtener los certificados?

### 1. Generar Certificado desde AFIP Clave Fiscal

1. Ingresar a [AFIP Clave Fiscal](https://auth.afip.gob.ar/)
2. Ir a **Administrador de Relaciones de Clave Fiscal**
3. Seleccionar **Certificados Digitales**
4. Click en **Nuevo Certificado**
5. Seleccionar el servicio **"wsfe"** (Facturación Electrónica)
6. Generar el certificado
7. Descargar:
   - El certificado (.crt)
   - La clave privada (.key)

### 2. Colocar certificados en esta carpeta

```bash
# Desde la raíz del proyecto
cp /ruta/del/certificado.crt backend/arca-manual/certs/certificado.crt
cp /ruta/de/la/clave.key backend/arca-manual/certs/clave_privada.key
```

### 3. Configurar rutas en .env

```env
AFIP_CERT_PATH=./certs/certificado.crt
AFIP_KEY_PATH=./certs/clave_privada.key
```

## Seguridad

⚠️ **IMPORTANTE:**

- **NO commitear** estos archivos al repositorio
- Agregar `*.crt` y `*.key` al `.gitignore`
- Mantener las claves privadas seguras
- Renovar certificados antes de su vencimiento

## Formatos aceptados

- **.crt** - Certificado en formato PEM
- **.pem** - Certificado en formato PEM
- **.key** - Clave privada en formato PEM

## Validar certificados

Para verificar que los certificados son correctos:

```bash
# Ver información del certificado
openssl x509 -in certificado.crt -text -noout

# Verificar que la clave corresponde al certificado
openssl x509 -noout -modulus -in certificado.crt | openssl md5
openssl rsa -noout -modulus -in clave_privada.key | openssl md5
# Los hash MD5 deben ser idénticos
```

## Ambiente de homologación

Para testing, AFIP proporciona certificados de prueba o permite usar el CUIT de prueba:

- CUIT de prueba: `20409378472`
- No requiere certificados reales en homologación

## Renovación

Los certificados tienen una fecha de vencimiento. Antes de que expiren:

1. Generar un nuevo certificado desde AFIP
2. Reemplazar los archivos en esta carpeta
3. Reiniciar el microservicio

El microservicio detectará automáticamente los nuevos certificados.
