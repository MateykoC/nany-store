# 🏪 NANY Store — Guía de Deploy en Render

---

## ¿Qué es esto?

Una aplicación web completa para el almacén NANY con:
- Tienda pública para clientes (productos, carrito, WhatsApp)
- Panel de administración protegido con contraseña
- Base de datos PostgreSQL (los datos persisten aunque el servidor se reinicie)
- Tiempo real con Socket.io

---

## PASO 1 — Crear repositorio en GitHub

1. Andá a [github.com](https://github.com) e iniciá sesión (o creá una cuenta gratis).
2. Hacé clic en el botón verde **"New"** (arriba a la izquierda).
3. En **Repository name** escribí: `nany-store`
4. Dejalo en **Public** (necesario para el plan gratuito de Render).
5. ⚠️ **NO marques** "Add a README file".
6. Hacé clic en **"Create repository"**.

---

## PASO 2 — Subir el proyecto a GitHub

Abrí una terminal en la carpeta del proyecto y ejecutá estos comandos uno por uno:

```bash
# Inicializar git (si no está inicializado)
git init

# Agregar todos los archivos
git add .

# Primer commit
git commit -m "Initial commit - NANY Store"

# Conectar con tu repositorio de GitHub
# (reemplazá TU_USUARIO con tu usuario de GitHub)
git remote add origin https://github.com/TU_USUARIO/nany-store.git

# Subir el código
git branch -M main
git push -u origin main
```

✅ Ahora tu código está en GitHub.

---

## PASO 3 — Crear base de datos PostgreSQL en Render

1. Andá a [render.com](https://render.com) e iniciá sesión (o creá cuenta gratis con GitHub).
2. En el dashboard hacé clic en **"New +"** → **"PostgreSQL"**.
3. Completá:
   - **Name:** `nany-db`
   - **Region:** Oregon (US West) — la más cercana al plan gratuito
   - **PostgreSQL Version:** 16
   - **Plan:** **Free**
4. Hacé clic en **"Create Database"**.
5. Esperá unos segundos a que se cree (aparece en verde cuando está lista).

---

## PASO 4 — Obtener el connection string

1. Hacé clic en tu base de datos `nany-db` en el dashboard de Render.
2. Bajá hasta la sección **"Connections"**.
3. Copiá el valor de **"Internal Database URL"** — se ve así:
   ```
   postgresql://nany_db_user:XXXXXXXX@dpg-XXXXX-a/nany_db
   ```
   ⚠️ Guardalo, lo vas a necesitar en el siguiente paso.

> **Nota:** Usamos la URL "Internal" porque el backend y la DB están en la misma red de Render (más rápido y gratis).

---

## PASO 5 — Configurar variables de entorno

Las variables de entorno son configuraciones secretas que no se suben a GitHub.

Las vas a configurar en el servicio web de Render (próximo paso), pero tené listas estas variables:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `DATABASE_URL` | (la URL del paso 4) | Conexión a PostgreSQL |
| `ADMIN_PASSWORD` | `1234` o lo que quieras | Contraseña del admin |
| `WHATSAPP_NUMBER` | `5491112345678` | Tu número de WhatsApp |
| `NODE_ENV` | `production` | Modo producción |

---

## PASO 6 — Deployar el backend en Render

1. En el dashboard de Render hacé clic en **"New +"** → **"Web Service"**.
2. Seleccioná **"Build and deploy from a Git repository"**.
3. Conectá tu cuenta de GitHub si no lo hiciste.
4. Buscá y seleccioná tu repositorio `nany-store`.
5. Completá la configuración:
   - **Name:** `nany-store`
   - **Region:** Oregon (US West) — igual que la DB
   - **Branch:** `main`
   - **Root Directory:** *(dejarlo vacío)*
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** **Free**

6. Bajá a la sección **"Environment Variables"** y agregá las 4 variables:

   Hacé clic en **"Add Environment Variable"** para cada una:

   ```
   DATABASE_URL    = (pegá la Internal Database URL)
   ADMIN_PASSWORD  = 1234
   WHATSAPP_NUMBER = 5491112345678
   NODE_ENV        = production
   ```

7. Hacé clic en **"Create Web Service"**.

8. Render va a construir y deployar la app automáticamente. Esperá 2-3 minutos.

---

## PASO 7 — Verificar funcionamiento

1. Una vez que el deploy termine, Render te muestra una URL así:
   ```
   https://nany-store.onrender.com
   ```
2. Abrí esa URL en el navegador → deberías ver la tienda pública de NANY.
3. Para acceder al panel admin:
   ```
   https://nany-store.onrender.com/admin.html
   ```
4. Ingresá con la contraseña que configuraste (por defecto: `1234`).

✅ Si ves la tienda y podés entrar al admin, ¡todo funciona!

---

## ⚠️ Importante sobre el plan gratuito de Render

El plan gratuito de Render "duerme" el servidor cuando no hay tráfico por 15 minutos. La primera visita después de ese período puede tardar 30-60 segundos en cargar mientras el servidor "despierta". Esto es normal y no afecta los datos (que están en PostgreSQL).

---

## PASO 8 — Cómo cambiar la contraseña

### Opción A — Desde Render (recomendado)

1. Andá al dashboard de Render.
2. Hacé clic en tu servicio `nany-store`.
3. Andá a **"Environment"** en el menú lateral.
4. Buscá `ADMIN_PASSWORD` y cambiá el valor.
5. Hacé clic en **"Save Changes"** → el servicio se reinicia automáticamente.

### Opción B — En el código

Abrí `backend/server.js` y cambiá la línea:
```javascript
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234";
```
Cambiá `"1234"` por tu nueva contraseña, luego hacé commit y push.

---

## PASO 9 — Cómo cambiar el número de WhatsApp

### Opción A — Desde Render (recomendado)

1. Andá a **"Environment"** en tu servicio de Render.
2. Cambiá el valor de `WHATSAPP_NUMBER`.
3. El formato debe ser internacional sin `+` ni espacios.

**Ejemplos:**
```
Argentina:  5491112345678
México:     5215512345678
España:     34612345678
Uruguay:    59899123456
```

### Opción B — En el código

Abrí `backend/server.js` y cambiá:
```javascript
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "5491100000000";
```

---

## Estructura del proyecto

```
nany-store/
├── backend/
│   └── server.js          ← Servidor Node.js + Express + Socket.io
├── frontend/
│   ├── index.html         ← Tienda pública
│   ├── admin.html         ← Panel de administración
│   ├── css/
│   │   ├── style.css      ← Estilos tienda
│   │   └── admin.css      ← Estilos admin
│   └── js/
│       ├── app.js         ← Lógica tienda (carrito, productos, WA)
│       └── admin.js       ← Lógica admin (CRUD)
├── package.json
├── .env.example           ← Plantilla de variables de entorno
└── .gitignore
```

---

## URLs de la aplicación

| URL | Descripción |
|-----|-------------|
| `https://tu-app.onrender.com/` | Tienda pública |
| `https://tu-app.onrender.com/admin.html` | Panel admin |

---

## API — Endpoints disponibles

| Método | URL | Descripción | Auth |
|--------|-----|-------------|------|
| GET | `/api/productos` | Listar productos | No |
| POST | `/api/productos` | Crear producto | Sí |
| PUT | `/api/productos/:id` | Editar producto | Sí |
| DELETE | `/api/productos/:id` | Eliminar producto | Sí |
| GET | `/api/categorias` | Listar categorías | No |
| POST | `/api/categorias` | Crear categoría | Sí |
| DELETE | `/api/categorias/:id` | Eliminar categoría | Sí |
| GET | `/api/config` | Leer configuración | No |
| PUT | `/api/config` | Guardar configuración | Sí |
| POST | `/api/admin/login` | Login admin | No |

---

## Actualizar la app

Cada vez que hagas cambios en el código:

```bash
git add .
git commit -m "descripción del cambio"
git push
```

Render detecta el push automáticamente y redeploya la app en 1-2 minutos.

---

## Preguntas frecuentes

**¿Los datos se pierden si el servidor se reinicia?**
No. Los datos están en PostgreSQL (Render), que es independiente del servidor web.

**¿Puedo agregar más de 2MB de imagen?**
No, el límite es 2MB por razones de rendimiento. Comprimí la imagen antes de subirla (podés usar [squoosh.app](https://squoosh.app)).

**¿Cómo hago para que el carrito no muestre productos que se eliminaron?**
Si un admin elimina un producto, Socket.io lo remueve del carrito de los clientes activos automáticamente.

**¿Se puede tener varios administradores?**
Con la configuración actual no, hay una sola contraseña. Para múltiples admins habría que agregar un sistema de usuarios.

---

*Almacén NANY — Hecho con ❤️*
