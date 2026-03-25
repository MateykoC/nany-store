require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { Pool } = require("pg");

// ─── CONFIG ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234"; // ← Cambiar aquí o en variable de entorno
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "5491100000000"; // ← Número en formato internacional sin +

// ─── DB ────────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ─── APP ───────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

// ─── DB INIT ───────────────────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        precio NUMERIC(10,2) NOT NULL,
        descripcion TEXT,
        categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
        imagen_base64 TEXT,
        habilitado_carrito BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS config (
        clave VARCHAR(100) PRIMARY KEY,
        valor TEXT
      );

      INSERT INTO config (clave, valor)
      VALUES ('sobre_nosotros', 'Bienvenidos a NANY, tu almacén de confianza. Ofrecemos productos frescos y de calidad para toda la familia.')
      ON CONFLICT (clave) DO NOTHING;
    `);
    console.log("✅ Base de datos inicializada");
  } finally {
    client.release();
  }
}

// ─── MIDDLEWARE AUTH ────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const pwd = req.headers["x-admin-password"];
  if (pwd !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "No autorizado" });
  }
  next();
}

// ─── API: CONFIG ───────────────────────────────────────────────────────────
app.get("/api/config", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT clave, valor FROM config");
    const obj = {};
    rows.forEach((r) => (obj[r.clave] = r.valor));
    res.json(obj);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/whatsapp-number", (req, res) => {
  res.json({ number: WHATSAPP_NUMBER });
});

app.put("/api/config", requireAdmin, async (req, res) => {
  try {
    const { clave, valor } = req.body;
    await pool.query(
      "INSERT INTO config (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = $2",
      [clave, valor]
    );
    io.emit("config_updated", { clave, valor });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: AUTH ─────────────────────────────────────────────────────────────
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Contraseña incorrecta" });
  }
});

// ─── API: CATEGORÍAS ───────────────────────────────────────────────────────
app.get("/api/categorias", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM categorias ORDER BY nombre");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/categorias", requireAdmin, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: "Nombre requerido" });
    const { rows } = await pool.query(
      "INSERT INTO categorias (nombre) VALUES ($1) RETURNING *",
      [nombre.trim()]
    );
    io.emit("categoria_created", rows[0]);
    res.json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(400).json({ error: "Categoría ya existe" });
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/categorias/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM categorias WHERE id = $1", [id]);
    io.emit("categoria_deleted", { id: parseInt(id) });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: PRODUCTOS ────────────────────────────────────────────────────────
app.get("/api/productos", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      ORDER BY p.nombre
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/productos/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "No encontrado" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/productos", requireAdmin, async (req, res) => {
  try {
    const { nombre, precio, descripcion, categoria_id, imagen_base64, habilitado_carrito } = req.body;
    if (!nombre || precio == null) return res.status(400).json({ error: "Nombre y precio requeridos" });

    // Validate image size (~2MB in base64 ≈ 2.7MB string)
    if (imagen_base64 && imagen_base64.length > 2800000) {
      return res.status(400).json({ error: "Imagen supera el límite de 2MB" });
    }

    const { rows } = await pool.query(
      `INSERT INTO productos (nombre, precio, descripcion, categoria_id, imagen_base64, habilitado_carrito)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [nombre, precio, descripcion, categoria_id || null, imagen_base64 || null, habilitado_carrito !== false]
    );

    const { rows: full } = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.id = $1
    `, [rows[0].id]);

    io.emit("producto_created", full[0]);
    res.json(full[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/productos/:id", requireAdmin, async (req, res) => {
  try {
    const { nombre, precio, descripcion, categoria_id, imagen_base64, habilitado_carrito } = req.body;

    if (imagen_base64 && imagen_base64.length > 2800000) {
      return res.status(400).json({ error: "Imagen supera el límite de 2MB" });
    }

    // If imagen_base64 is explicitly null, keep existing; if provided (even empty string to clear), update
    let imageQuery;
    let params;

    if (imagen_base64 === undefined) {
      // Don't update image
      imageQuery = `UPDATE productos SET nombre=$1, precio=$2, descripcion=$3, categoria_id=$4, habilitado_carrito=$5 WHERE id=$6`;
      params = [nombre, precio, descripcion, categoria_id || null, habilitado_carrito !== false, req.params.id];
    } else {
      imageQuery = `UPDATE productos SET nombre=$1, precio=$2, descripcion=$3, categoria_id=$4, imagen_base64=$5, habilitado_carrito=$6 WHERE id=$7`;
      params = [nombre, precio, descripcion, categoria_id || null, imagen_base64 || null, habilitado_carrito !== false, req.params.id];
    }

    await pool.query(imageQuery, params);

    const { rows } = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.id = $1
    `, [req.params.id]);

    io.emit("producto_updated", rows[0]);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/productos/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM productos WHERE id = $1", [req.params.id]);
    io.emit("producto_deleted", { id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SOCKET.IO ─────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("🔌 Cliente conectado:", socket.id);
  socket.on("disconnect", () => {
    console.log("🔌 Cliente desconectado:", socket.id);
  });
});

// ─── CATCH-ALL ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ─── START ─────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🚀 NANY Store corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Error iniciando DB:", err);
    process.exit(1);
  });
