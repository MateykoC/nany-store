/* ══════════════════════════════════════════
   NANY — App.js (Tienda pública)
   ══════════════════════════════════════════ */

// ─── STATE ─────────────────────────────────
let allProducts = [];
let allCategories = [];
let activeCategory = "";
let searchQuery = "";
let whatsappNumber = "5491100000000";

// ─── SOCKET ────────────────────────────────
const socket = io();

socket.on("producto_created", (p) => {
  allProducts.push(p);
  renderProducts();
});
socket.on("producto_updated", (p) => {
  const idx = allProducts.findIndex((x) => x.id === p.id);
  if (idx !== -1) allProducts[idx] = p;
  renderProducts();
});
socket.on("producto_deleted", ({ id }) => {
  allProducts = allProducts.filter((x) => x.id !== id);
  // Remove from cart if deleted
  removeFromCartById(id);
  renderProducts();
});
socket.on("categoria_created", (c) => {
  allCategories.push(c);
  renderCategoryFilter();
});
socket.on("categoria_deleted", ({ id }) => {
  allCategories = allCategories.filter((x) => x.id !== id);
  renderCategoryFilter();
});
socket.on("config_updated", ({ clave, valor }) => {
  if (clave === "sobre_nosotros") {
    document.getElementById("nosotrosText").textContent = valor;
  }
});

// ─── INIT ──────────────────────────────────
async function init() {
  await Promise.all([loadWhatsApp(), loadConfig(), loadCategories(), loadProducts()]);
}

async function loadWhatsApp() {
  try {
    const res = await fetch("/api/whatsapp-number");
    const data = await res.json();
    whatsappNumber = data.number;
    document.getElementById("waFloat").href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hola, quiero consultar por un producto")}`;
  } catch (_) {}
}

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    const data = await res.json();
    if (data.sobre_nosotros) {
      document.getElementById("nosotrosText").textContent = data.sobre_nosotros;
    }
  } catch (_) {}
}

async function loadCategories() {
  try {
    const res = await fetch("/api/categorias");
    allCategories = await res.json();
    renderCategoryFilter();
  } catch (_) {}
}

async function loadProducts() {
  try {
    const res = await fetch("/api/productos");
    allProducts = await res.json();
    renderProducts();
  } catch (_) {
    document.getElementById("productsGrid").innerHTML =
      '<p class="no-products">Error al cargar productos. Recargá la página.</p>';
  }
}

// ─── RENDER PRODUCTS ───────────────────────
function renderProducts() {
  const grid = document.getElementById("productsGrid");
  let filtered = allProducts;

  if (activeCategory) {
    filtered = filtered.filter((p) => p.categoria_id === parseInt(activeCategory));
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (p) => p.nombre.toLowerCase().includes(q) || (p.descripcion || "").toLowerCase().includes(q)
    );
  }

  if (!filtered.length) {
    grid.innerHTML = '<p class="no-products">No se encontraron productos.</p>';
    return;
  }

  grid.innerHTML = filtered
    .map(
      (p, i) => `
    <div class="product-card" data-id="${p.id}" style="animation-delay:${i * 0.05}s">
      <div class="product-img-wrap">
        ${
          p.imagen_base64
            ? `<img src="${p.imagen_base64}" alt="${escapeHtml(p.nombre)}" loading="lazy" />`
            : `<span class="product-placeholder">🛒</span>`
        }
      </div>
      <div class="product-info">
        ${p.categoria_nombre ? `<p class="product-cat">${escapeHtml(p.categoria_nombre)}</p>` : ""}
        <p class="product-name">${escapeHtml(p.nombre)}</p>
        <p class="product-price">$${formatPrice(p.precio)}</p>
      </div>
    </div>
  `
    )
    .join("");

  // Attach click handlers
  grid.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => openProductModal(parseInt(card.dataset.id)));
  });
}

// ─── RENDER CATEGORY FILTER ────────────────
function renderCategoryFilter() {
  const container = document.getElementById("categoryFilter");
  const allBtn = `<button class="cat-btn ${activeCategory === "" ? "active" : ""}" data-cat="">Todos</button>`;
  const cats = allCategories
    .map(
      (c) =>
        `<button class="cat-btn ${activeCategory === String(c.id) ? "active" : ""}" data-cat="${c.id}">${escapeHtml(c.nombre)}</button>`
    )
    .join("");
  container.innerHTML = allBtn + cats;

  container.querySelectorAll(".cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.cat;
      renderCategoryFilter();
      renderProducts();
    });
  });
}

// ─── PRODUCT MODAL ─────────────────────────
function openProductModal(id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;

  const modal = document.getElementById("productModal");
  const body = document.getElementById("modalBody");

  let qty = 1;

  const canCart = p.habilitado_carrito;

  body.innerHTML = `
    ${
      p.imagen_base64
        ? `<img class="modal-product-img" src="${p.imagen_base64}" alt="${escapeHtml(p.nombre)}" />`
        : ""
    }
    ${p.categoria_nombre ? `<p class="modal-product-cat">${escapeHtml(p.categoria_nombre)}</p>` : ""}
    <h2 class="modal-product-name">${escapeHtml(p.nombre)}</h2>
    <p class="modal-product-price">$${formatPrice(p.precio)}</p>
    ${p.descripcion ? `<p class="modal-product-desc">${escapeHtml(p.descripcion)}</p>` : ""}
    <div class="modal-cart-row">
      ${
        canCart
          ? `
        <div class="qty-ctrl">
          <button class="qty-btn" id="qtyMinus">−</button>
          <span class="qty-num" id="qtyNum">1</span>
          <button class="qty-btn" id="qtyPlus">+</button>
        </div>
        <button class="btn-primary" id="addCartBtn">Agregar al carrito</button>
      `
          : `<p style="color:#888;font-size:.9rem;font-style:italic">Este producto no está disponible para pedir online. Consultá por WhatsApp.</p>`
      }
    </div>
  `;

  if (canCart) {
    document.getElementById("qtyMinus").addEventListener("click", () => {
      if (qty > 1) { qty--; document.getElementById("qtyNum").textContent = qty; }
    });
    document.getElementById("qtyPlus").addEventListener("click", () => {
      qty++; document.getElementById("qtyNum").textContent = qty;
    });
    document.getElementById("addCartBtn").addEventListener("click", () => {
      addToCart(p, qty);
      modal.classList.remove("open");
    });
  }

  modal.classList.add("open");
}

// ─── CART ──────────────────────────────────
function getCart() {
  try { return JSON.parse(localStorage.getItem("nany_cart") || "[]"); } catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem("nany_cart", JSON.stringify(cart));
  updateCartCount();
}

function addToCart(product, qty) {
  const cart = getCart();
  const existing = cart.find((x) => x.id === product.id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      id: product.id,
      nombre: product.nombre,
      precio: parseFloat(product.precio),
      imagen_base64: product.imagen_base64,
      qty,
    });
  }
  saveCart(cart);
  showCartDrawer();
}

function removeFromCartById(productId) {
  const cart = getCart().filter((x) => x.id !== productId);
  saveCart(cart);
}

function updateCartCount() {
  const cart = getCart();
  const total = cart.reduce((sum, x) => sum + x.qty, 0);
  document.getElementById("cartCount").textContent = total;
}

function showCartDrawer() {
  document.getElementById("cartDrawer").classList.add("open");
  document.getElementById("drawerOverlay").classList.add("open");
  renderCartDrawer();
}

function hideCartDrawer() {
  document.getElementById("cartDrawer").classList.remove("open");
  document.getElementById("drawerOverlay").classList.remove("open");
}

function renderCartDrawer() {
  const cart = getCart();
  const itemsEl = document.getElementById("cartItems");
  const footerEl = document.getElementById("cartFooter");

  if (!cart.length) {
    itemsEl.innerHTML = '<p class="cart-empty-msg">Tu carrito está vacío.</p>';
    footerEl.innerHTML = "";
    return;
  }

  itemsEl.innerHTML = cart
    .map(
      (item) => `
    <div class="cart-item">
      ${
        item.imagen_base64
          ? `<img class="cart-item-img" src="${item.imagen_base64}" alt="${escapeHtml(item.nombre)}" />`
          : `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem">🛒</div>`
      }
      <div>
        <p class="cart-item-name">${escapeHtml(item.nombre)}</p>
        <p class="cart-item-price">$${formatPrice(item.precio * item.qty)}</p>
      </div>
      <div class="cart-item-controls">
        <div class="qty-ctrl">
          <button class="qty-btn" onclick="changeCartQty(${item.id}, -1)">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" onclick="changeCartQty(${item.id}, 1)">+</button>
        </div>
        <button class="cart-delete-btn" onclick="removeFromCartById(${item.id});renderCartDrawer()">🗑</button>
      </div>
    </div>
  `
    )
    .join("");

  const total = cart.reduce((s, x) => s + x.precio * x.qty, 0);
  footerEl.innerHTML = `
    <div class="cart-total">
      <span>Total</span>
      <span>$${formatPrice(total)}</span>
    </div>
    <button class="btn-primary" style="width:100%" onclick="openOrderModal()">Pedir por WhatsApp</button>
  `;
}

function changeCartQty(id, delta) {
  const cart = getCart();
  const item = cart.find((x) => x.id === id);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart(cart);
  renderCartDrawer();
}

// ─── ORDER MODAL ───────────────────────────
function openOrderModal() {
  hideCartDrawer();
  document.getElementById("orderModal").classList.add("open");
  document.getElementById("customerName").value = "";
}

document.getElementById("sendOrderBtn").addEventListener("click", () => {
  const name = document.getElementById("customerName").value.trim();
  if (!name) {
    document.getElementById("customerName").style.borderColor = "#c0392b";
    document.getElementById("customerName").focus();
    return;
  }
  document.getElementById("customerName").style.borderColor = "";

  const cart = getCart();
  if (!cart.length) return;

  const lines = cart.map((x) => `- ${x.nombre} x${x.qty}`).join("\n");
  const msg = `Hola, soy ${name}.\n\nQuiero pedir:\n${lines}\n\nGracias`;
  const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank");
  document.getElementById("orderModal").classList.remove("open");
});

// ─── SEARCH ────────────────────────────────
document.getElementById("searchInput").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderProducts();
});

// ─── MODAL CLOSE ───────────────────────────
document.getElementById("modalClose").addEventListener("click", () => {
  document.getElementById("productModal").classList.remove("open");
});
document.getElementById("productModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
});

document.getElementById("orderModalClose").addEventListener("click", () => {
  document.getElementById("orderModal").classList.remove("open");
});
document.getElementById("orderModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
});

// ─── CART DRAWER ───────────────────────────
document.getElementById("cartBtn").addEventListener("click", showCartDrawer);
document.getElementById("drawerClose").addEventListener("click", hideCartDrawer);
document.getElementById("drawerOverlay").addEventListener("click", hideCartDrawer);

// ─── HELPERS ───────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPrice(n) {
  return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── START ─────────────────────────────────
init();
updateCartCount();
