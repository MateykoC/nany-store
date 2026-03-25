/* ══════════════════════════════════════════
   NANY — Admin.js
   ══════════════════════════════════════════ */

// ─── AUTH ──────────────────────────────────
let adminPassword = "";

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "x-admin-password": adminPassword,
  };
}

document.getElementById("loginBtn").addEventListener("click", doLogin);
document.getElementById("loginPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doLogin();
});

async function doLogin() {
  const pwd = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";

  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: pwd }),
  });

  if (res.ok) {
    adminPassword = pwd;
    sessionStorage.setItem("nany_admin", pwd);
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("adminPanel").style.display = "grid";
    initAdmin();
  } else {
    errEl.textContent = "Contraseña incorrecta";
    document.getElementById("loginPassword").value = "";
  }
}

// Auto-login from session
(function () {
  const saved = sessionStorage.getItem("nany_admin");
  if (saved) {
    adminPassword = saved;
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: saved }),
    }).then((r) => {
      if (r.ok) {
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("adminPanel").style.display = "grid";
        initAdmin();
      } else {
        sessionStorage.removeItem("nany_admin");
      }
    });
  }
})();

document.getElementById("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("nany_admin");
  adminPassword = "";
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("adminPanel").style.display = "none";
});

// ─── TAB NAVIGATION ────────────────────────
document.querySelectorAll(".snav-btn[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".snav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ─── INIT ADMIN ────────────────────────────
let allCats = [];
let allProds = [];
let editingImageBase64 = undefined; // undefined = no change, null = clear, string = new image

const socket = io();

socket.on("producto_created", (p) => { allProds.push(p); renderProductsTable(); });
socket.on("producto_updated", (p) => {
  const i = allProds.findIndex((x) => x.id === p.id);
  if (i !== -1) allProds[i] = p;
  renderProductsTable();
});
socket.on("producto_deleted", ({ id }) => {
  allProds = allProds.filter((x) => x.id !== id);
  renderProductsTable();
});
socket.on("categoria_created", (c) => { allCats.push(c); renderCategoriesList(); renderCatSelect(); });
socket.on("categoria_deleted", ({ id }) => {
  allCats = allCats.filter((x) => x.id !== id);
  renderCategoriesList();
  renderCatSelect();
});

async function initAdmin() {
  await Promise.all([loadCategories(), loadProducts(), loadNosotros()]);
}

// ─── CATEGORIES ────────────────────────────
async function loadCategories() {
  const res = await fetch("/api/categorias");
  allCats = await res.json();
  renderCategoriesList();
  renderCatSelect();
}

function renderCategoriesList() {
  const list = document.getElementById("catList");
  if (!allCats.length) {
    list.innerHTML = '<li style="color:#888;font-size:.85rem;padding:.5rem 0">No hay categorías aún.</li>';
    return;
  }
  list.innerHTML = allCats
    .map(
      (c) => `
    <li class="cat-item">
      <span>${escapeHtml(c.nombre)}</span>
      <button class="btn-icon danger" onclick="deleteCat(${c.id})">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </li>
  `
    )
    .join("");
}

function renderCatSelect() {
  const sel = document.getElementById("pCategoria");
  const current = sel.value;
  sel.innerHTML =
    '<option value="">Sin categoría</option>' +
    allCats.map((c) => `<option value="${c.id}" ${String(c.id) === String(current) ? "selected" : ""}>${escapeHtml(c.nombre)}</option>`).join("");
}

document.getElementById("addCatBtn").addEventListener("click", async () => {
  const input = document.getElementById("newCatName");
  const errEl = document.getElementById("catError");
  const name = input.value.trim();
  errEl.textContent = "";
  if (!name) return;

  const res = await fetch("/api/categorias", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ nombre: name }),
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || "Error"; return; }
  input.value = "";
});

async function deleteCat(id) {
  if (!confirm("¿Eliminar esta categoría?")) return;
  await fetch(`/api/categorias/${id}`, { method: "DELETE", headers: getHeaders() });
}

// ─── PRODUCTS ──────────────────────────────
async function loadProducts() {
  const res = await fetch("/api/productos");
  allProds = await res.json();
  renderProductsTable();
}

function renderProductsTable() {
  const tbody = document.getElementById("productsTableBody");
  if (!allProds.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No hay productos aún. Creá el primero.</td></tr>';
    return;
  }
  tbody.innerHTML = allProds
    .map(
      (p) => `
    <tr>
      <td>
        ${
          p.imagen_base64
            ? `<img class="table-img" src="${p.imagen_base64}" alt="${escapeHtml(p.nombre)}" />`
            : `<div class="table-img-placeholder">🛒</div>`
        }
      </td>
      <td><strong>${escapeHtml(p.nombre)}</strong></td>
      <td>$${formatPrice(p.precio)}</td>
      <td>${escapeHtml(p.categoria_nombre || "—")}</td>
      <td>
        <span class="badge ${p.habilitado_carrito ? "badge--green" : "badge--red"}">
          ${p.habilitado_carrito ? "Sí" : "No"}
        </span>
      </td>
      <td>
        <button class="btn-icon" onclick="editProduct(${p.id})" title="Editar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon danger" onclick="deleteProduct(${p.id})" title="Eliminar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </td>
    </tr>
  `
    )
    .join("");
}

// ─── PRODUCT FORM ──────────────────────────
document.getElementById("newProductBtn").addEventListener("click", () => openProductForm());
document.getElementById("cancelProductBtn").addEventListener("click", closeProductForm);

function openProductForm(product = null) {
  editingImageBase64 = undefined;
  const formCard = document.getElementById("productFormCard");
  const title = document.getElementById("productFormTitle");

  if (product) {
    title.textContent = "Editar producto";
    document.getElementById("productId").value = product.id;
    document.getElementById("pNombre").value = product.nombre;
    document.getElementById("pPrecio").value = product.precio;
    document.getElementById("pDescripcion").value = product.descripcion || "";
    document.getElementById("pCategoria").value = product.categoria_id || "";
    document.getElementById("pHabilitadoCarrito").checked = product.habilitado_carrito;

    if (product.imagen_base64) {
      document.getElementById("previewImg").src = product.imagen_base64;
      document.getElementById("imagePreview").style.display = "block";
      document.getElementById("imageHint").textContent = "Imagen actual. Seleccioná una nueva para reemplazar.";
    } else {
      document.getElementById("imagePreview").style.display = "none";
      document.getElementById("imageHint").textContent = "";
    }
  } else {
    title.textContent = "Nuevo producto";
    document.getElementById("productForm").reset();
    document.getElementById("productId").value = "";
    document.getElementById("imagePreview").style.display = "none";
    document.getElementById("imageHint").textContent = "";
  }

  document.getElementById("productError").textContent = "";
  document.getElementById("pImagen").value = "";
  formCard.style.display = "block";
  formCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeProductForm() {
  document.getElementById("productFormCard").style.display = "none";
  document.getElementById("productForm").reset();
  editingImageBase64 = undefined;
}

// Image preview
document.getElementById("pImagen").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    document.getElementById("productError").textContent = "La imagen supera el límite de 2MB.";
    e.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    const b64 = ev.target.result;
    editingImageBase64 = b64;
    document.getElementById("previewImg").src = b64;
    document.getElementById("imagePreview").style.display = "block";
    document.getElementById("imageHint").textContent = file.name;
    document.getElementById("productError").textContent = "";
  };
  reader.readAsDataURL(file);
});

document.getElementById("removeImgBtn").addEventListener("click", () => {
  editingImageBase64 = null; // explicitly clear
  document.getElementById("imagePreview").style.display = "none";
  document.getElementById("pImagen").value = "";
  document.getElementById("imageHint").textContent = "Imagen eliminada.";
});

document.getElementById("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("productError");
  errEl.textContent = "";

  const id = document.getElementById("productId").value;
  const nombre = document.getElementById("pNombre").value.trim();
  const precio = parseFloat(document.getElementById("pPrecio").value);
  const descripcion = document.getElementById("pDescripcion").value.trim();
  const categoria_id = document.getElementById("pCategoria").value || null;
  const habilitado_carrito = document.getElementById("pHabilitadoCarrito").checked;

  const body = { nombre, precio, descripcion, categoria_id, habilitado_carrito };

  // Handle image:
  // - undefined: editing existing, no new file, no removal → don't send imagen_base64
  // - null: removal requested
  // - string: new image
  if (editingImageBase64 === undefined && !id) {
    // new product with no image
    body.imagen_base64 = null;
  } else if (editingImageBase64 !== undefined) {
    body.imagen_base64 = editingImageBase64;
  }

  const url = id ? `/api/productos/${id}` : "/api/productos";
  const method = id ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (!res.ok) {
    errEl.textContent = data.error || "Error al guardar";
    return;
  }

  closeProductForm();
});

function editProduct(id) {
  const p = allProds.find((x) => x.id === id);
  if (p) openProductForm(p);
}

async function deleteProduct(id) {
  if (!confirm("¿Eliminar este producto?")) return;
  await fetch(`/api/productos/${id}`, { method: "DELETE", headers: getHeaders() });
}

// ─── NOSOTROS ──────────────────────────────
async function loadNosotros() {
  const res = await fetch("/api/config");
  const data = await res.json();
  if (data.sobre_nosotros) {
    document.getElementById("nosotrosInput").value = data.sobre_nosotros;
  }
}

document.getElementById("saveNosotrosBtn").addEventListener("click", async () => {
  const valor = document.getElementById("nosotrosInput").value.trim();
  const successEl = document.getElementById("nosotrosSuccess");
  successEl.textContent = "";

  const res = await fetch("/api/config", {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ clave: "sobre_nosotros", valor }),
  });
  if (res.ok) {
    successEl.textContent = "✓ Guardado correctamente";
    setTimeout(() => (successEl.textContent = ""), 3000);
  }
});

// ─── HELPERS ───────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPrice(n) {
  return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
