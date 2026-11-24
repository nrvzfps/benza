(() => {
  "use strict";

  const WA_NUMBER = "5491131754109";
  const PAGE = 12;
  const PRODUCTS = (window.BENZA_PRODUCTOS || []).map((p, i) => ({ ...p, id: i, conc: concentration(p.nombre) }));

  // Un mismo perfume en varios tamaños (misma marca + nombre + género) se muestra como una sola tarjeta.
  const GROUPS = [];
  {
    const byKey = new Map();
    for (const p of PRODUCTS) {
      const key = `${p.marca}|${p.nombre}|${p.genero}`;
      if (!byKey.has(key)) { const g = { gid: GROUPS.length, marca: p.marca, nombre: p.nombre, genero: p.genero, conc: p.conc, variants: [] }; byKey.set(key, g); GROUPS.push(g); }
      byKey.get(key).variants.push(p);
    }
    for (const g of GROUPS) {
      g.variants.sort((a, b) => (a.ml || 0) - (b.ml || 0));
      g.foto = (g.variants.find(v => v.foto) || {}).foto || null;
      g.min = Math.min(...g.variants.map(v => v.precio));
      g.variants.forEach(v => (v.gid = g.gid));
    }
  }
  const qtyOf = g => g.variants.reduce((sum, v) => sum + (cart[v.id] || 0), 0);

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fmt = n => "$" + n.toLocaleString("es-AR");
  const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const titleCase = s => s.split(" ").map(w => (w === "&" ? w : w[0] + w.slice(1).toLowerCase())).join(" ");
  const TALL = new Set(["GIORGIO ARMANI", "PACO RABANNE", "VERSACE", "DOLCE & GABBANA", "MONTBLANC"]); // logos con símbolo: un poco más altos
  const logoSrc = b => `assets/marcas/${b.toLowerCase().replace(/&/g, "y").replace(/[^a-z0-9]+/g, "-")}.svg`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function concentration(name) {
    const n = name.toLowerCase();
    if (n.includes("extrait")) return "Extrait";
    if (n.includes("elixir")) return "Elixir";
    if (n.includes("absolu")) return "Absolu";
    if (n.includes("parfum") && !n.includes("edp")) return "Parfum";
    if (n.includes("intense")) return "Intense";
    if (/\bedp\b/.test(n)) return "Eau de Parfum";
    if (/\bedt\b/.test(n)) return "Eau de Toilette";
    return "Fragancia";
  }

  // ---------- Frascos ilustrados (SVG) ----------
  const LIQUID = { Masculino: ["#3f6f87", "#1e3a4a"], Femenino: ["#c77ba0", "#7d3459"], Unisex: ["#b89a6a", "#6b5634"] };
  document.body.insertAdjacentHTML("afterbegin", `
    <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      <linearGradient id="gGold" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#8e6d33"/><stop offset=".4" stop-color="#f1dca8"/><stop offset=".7" stop-color="#b98f48"/><stop offset="1" stop-color="#9c7a3c"/></linearGradient>
      <linearGradient id="gGlass" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="#fff" stop-opacity=".25"/><stop offset=".8" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/></linearGradient>
      ${Object.entries(LIQUID).map(([k, [a, b]]) => `<linearGradient id="gL${k}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join("")}
    </defs></svg>`);

  function bottle(p) {
    const fill = `url(#gL${p.genero || "Unisex"})`;
    const shapes = [
      `<rect x="18" y="30" width="44" height="62" rx="6" fill="${fill}"/><rect x="18" y="30" width="44" height="62" rx="6" fill="url(#gGlass)"/><rect x="31" y="20" width="18" height="11" fill="url(#gGold)"/><rect x="27" y="6" width="26" height="15" rx="3" fill="url(#gGold)"/>`,
      `<ellipse cx="40" cy="62" rx="27" ry="30" fill="${fill}"/><ellipse cx="40" cy="62" rx="27" ry="30" fill="url(#gGlass)"/><rect x="32" y="22" width="16" height="12" fill="url(#gGold)"/><rect x="28" y="6" width="24" height="17" rx="8" fill="url(#gGold)"/>`,
      `<path d="M24 30h32l8 14v42l-8 6H24l-8-6V44z" fill="${fill}"/><path d="M24 30h32l8 14v42l-8 6H24l-8-6V44z" fill="url(#gGlass)"/><rect x="32" y="20" width="16" height="11" fill="url(#gGold)"/><path d="M26 6h28l-4 15H30z" fill="url(#gGold)"/>`,
    ];
    let h = 0;
    for (const c of p.nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return `<svg viewBox="0 0 80 96" aria-hidden="true">${shapes[h % shapes.length]}
      <rect x="28" y="56" width="24" height="14" rx="1.5" fill="#fffaf0" opacity=".85"/>
      <text x="40" y="66" text-anchor="middle" font-family="Cormorant Garamond, serif" font-size="8" font-weight="600" fill="#2a241e">B</text></svg>`;
  }

  // ---------- Pedido (persistente) ----------
  let cart = (() => { try { return JSON.parse(localStorage.getItem("benza-cart")) || {}; } catch { return {}; } })();
  const save = () => { try { localStorage.setItem("benza-cart", JSON.stringify(cart)); } catch { /* sin almacenamiento */ } };

  // ---------- Tarjeta ----------
  function card(g) {
    const q = qtyOf(g);
    const multi = g.variants.length > 1;
    const sizes = g.variants.filter(v => v.ml).map(v => v.ml + " ml");
    const sizeHtml = multi ? `<span class="sizes">${sizes.map(x => `<span>${x}</span>`).join("")}</span>` : (sizes[0] ? " · " + sizes[0] : "");
    const name = esc(titleCase(g.marca) + " " + g.nombre);
    return `<article class="card">
      <div class="card-media${g.foto ? " has-photo" : ""}"><span class="tag ${g.genero}">${g.genero}</span>${g.foto ? `<img src="${g.foto}" alt="${name}" loading="lazy" width="500" height="500">` : bottle(g)}</div>
      <div class="card-body">
        <span class="brand-sm">${titleCase(g.marca)}</span>
        <h4>${esc(g.nombre)}</h4>
        <span class="meta">${g.conc}${sizeHtml}</span>
        <div class="card-foot">
          <span class="price">${multi ? "<small>desde</small>" : ""}${fmt(g.min)}</span>
          <button class="add${q ? " added" : ""}" data-gid="${g.gid}" aria-label="Agregar ${name} al pedido">${q ? "✓" + (q > 1 ? q : "") : "+"}</button>
        </div>
      </div>
    </article>`;
  }

  // ---------- Datos fijos ----------
  const brands = [...new Set(PRODUCTS.map(p => p.marca))];
  const byBrand = b => GROUPS.filter(g => g.marca === b);
  $("#year").textContent = new Date().getFullYear();

  // Íconos (carrusel)
  const ICONOS = [
    ["DIOR", "Sauvage EDT"], ["CHANEL", "Bleu de Chanel EDP"], ["CAROLINA HERRERA", "Good Girl EDP"], ["VERSACE", "Eros EDT"],
    ["YVES SAINT LAURENT", "Libre EDP"], ["PACO RABANNE", "One Million EDT"], ["GIORGIO ARMANI", "Acqua Di Gio EDT"],
    ["JEAN PAUL GAULTIER", "La Belle EDP"], ["VALENTINO", "Donna Born In Roma EDP"], ["CHANEL", "Chanel Coco Mademoiselle EDP"],
  ].map(([m, n]) => GROUPS.find(g => g.marca === m && g.nombre === n)).filter(Boolean);
  const renderIconos = () => { if ($("#iconos")) $("#iconos").innerHTML = ICONOS.map(card).join(""); };
  $$("[data-scroll]").forEach(b => b.addEventListener("click", () => {
    const c = $("#iconos");
    c.scrollBy({ left: +b.dataset.scroll * c.clientWidth * 0.75, behavior: "smooth" });
  }));

  // Pared de marcas (inicio)
  if ($("#brandWall")) $("#brandWall").innerHTML = brands.slice().sort().map(b =>
    `<a class="brand-tile" href="catalogo.html?marca=${encodeURIComponent(b)}" aria-label="${titleCase(b)}"><img src="${logoSrc(b)}"${TALL.has(b) ? ' class="tall"' : ""} alt="" loading="lazy" onerror="this.parentNode.classList.add('no-logo')"><span>${b}</span></a>`).join("");

  const isShop = !!$("#results");
  if (isShop) $("#brandChecks").innerHTML = brands.slice().sort().map(b =>
    `<label><input type="checkbox" value="${b}"> ${titleCase(b)} <small>${byBrand(b).length}</small></label>`).join("");

  // ---------- Paneles laterales ----------
  const filters = $("#filters"), scrim = $("#scrim"), drawer = $("#drawer");
  const closeAll = () => {
    filters?.classList.remove("open");
    drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true");
    scrim.hidden = true;
  };

  // ---------- Estado de la tienda ----------
  const params = new URLSearchParams(location.search);
  const gParam = params.get("genero") || "";
  const state = {
    q: params.get("q") || "",
    gender: ["Femenino", "Masculino", "Unisex"].find(g => g.toLowerCase() === gParam.toLowerCase()) || "",
    price: params.get("precio") || "",
    brands: new Set((params.get("marca") || "").split(",").filter(b => brands.includes(b))),
    sort: params.get("orden") || "rel",
    shown: PAGE,
  };

  function syncUrl() {
    const u = new URLSearchParams();
    if (state.q) u.set("q", state.q);
    if (state.gender) u.set("genero", state.gender);
    if (state.brands.size) u.set("marca", [...state.brands].join(","));
    if (state.price) u.set("precio", state.price);
    if (state.sort !== "rel") u.set("orden", state.sort);
    const qs = u.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  function filtered() {
    const terms = norm(state.q).split(/\s+/).filter(Boolean);
    const [min, max] = state.price ? state.price.split("-").map(Number) : [0, Infinity];
    const list = GROUPS.filter(g =>
      (!state.gender || g.genero === state.gender) &&
      (!state.brands.size || state.brands.has(g.marca)) &&
      g.variants.some(v => v.precio >= min && v.precio <= max) &&
      terms.every(t => norm(`${g.marca} ${g.nombre} ${g.conc}`).includes(t))
    );
    if (state.sort === "asc") list.sort((a, b) => a.min - b.min);
    if (state.sort === "desc") list.sort((a, b) => b.min - a.min);
    if (state.sort === "az") list.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return list;
  }

  const PRICE_LABEL = { "0-150000": "Hasta $150.000", "150000-200000": "$150.000 a $200.000", "200000-300000": "$200.000 a $300.000", "300000-9999999": "Más de $300.000" };
  const GENDER_LABEL = { Femenino: "Femeninos", Masculino: "Masculinos", Unisex: "Unisex" };

  function render() {
    const list = filtered();
    const shown = list.slice(0, state.shown);
    $("#results").innerHTML = shown.length ? shown.map(card).join("")
      : `<div class="empty"><b>No encontramos esa fragancia</b>Probá con otros filtros o escribinos: quizás podemos conseguirla.</div>`;
    $("#resultCount").textContent = `${list.length} ${list.length === 1 ? "perfume" : "perfumes"}`;

    const more = $(".more");
    more.hidden = !list.length;
    $("#progressText").textContent = `Mostrando ${shown.length} de ${list.length}`;
    $("#progressBar").style.width = list.length ? (shown.length / list.length) * 100 + "%" : "0";
    $("#loadMore").hidden = shown.length >= list.length;

    // título
    const title = state.brands.size === 1 ? titleCase([...state.brands][0])
      : state.gender ? `Perfumes ${GENDER_LABEL[state.gender].toLowerCase()}` : "Todos los perfumes";
    const t = title === "Todos los perfumes" ? "Catálogo" : title;
    const h1 = $("#shopTitle");
    if (state.brands.size === 1) {
      // Una sola marca: mostrar su logo (si no carga, queda el nombre)
      const b = [...state.brands][0];
      if (h1.dataset.brand !== b) {
        h1.dataset.brand = b;
        h1.innerHTML = `<img class="page-logo" src="${logoSrc(b)}" alt="${esc(t)}">`;
        h1.querySelector("img").addEventListener("error", () => { h1.textContent = t; }, { once: true });
      }
    } else {
      delete h1.dataset.brand;
      h1.textContent = t;
    }
    $("#crumbTail").innerHTML = t === "Catálogo" ? "" : `<span>/</span><span>${esc(t)}</span>`;
    document.title = `${t} · Benza Importaciones`;
    $("#sortSel").value = state.sort;
    syncUrl();

    // etiquetas activas
    const tags = [];
    if (state.q) tags.push(["q", `“${esc(state.q)}”`]);
    if (state.gender) tags.push(["gender", GENDER_LABEL[state.gender]]);
    if (state.price) tags.push(["price", PRICE_LABEL[state.price]]);
    state.brands.forEach(b => tags.push(["brand:" + b, titleCase(b)]));
    $("#activeTags").innerHTML = tags.map(([k, t]) => `<button class="tag-x" data-k="${esc(k)}">${t}<span aria-hidden="true">✕</span></button>`).join("");
    $("#activeCount").textContent = tags.length || "";

    // sincronizar controles
    $$('input[name="g"]').forEach(i => (i.checked = i.value === state.gender));
    $$('input[name="p"]').forEach(i => (i.checked = i.value === state.price));
    $$("#brandChecks input").forEach(i => (i.checked = state.brands.has(i.value)));
    if ($("#q").value !== state.q) $("#q").value = state.q;
  }

  function update(changes) {
    Object.assign(state, changes);
    state.shown = PAGE;
    render();
  }

  const goShop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  // Controles
  if (isShop) {
  $("#filters").addEventListener("change", e => {
    const t = e.target;
    if (t.name === "g") update({ gender: t.value });
    else if (t.name === "p") update({ price: t.value });
    else if (t.type === "checkbox") {
      t.checked ? state.brands.add(t.value) : state.brands.delete(t.value);
      update({});
    }
  });
  $("#sortSel").addEventListener("change", e => update({ sort: e.target.value }));
  $("#loadMore").addEventListener("click", () => { state.shown += PAGE; render(); });
  $("#resetFilters").addEventListener("click", () => { state.brands.clear(); update({ q: "", gender: "", price: "" }); });
  $("#activeTags").addEventListener("click", e => {
    const k = e.target.closest(".tag-x")?.dataset.k;
    if (!k) return;
    if (k === "q") update({ q: "" });
    else if (k === "gender") update({ gender: "" });
    else if (k === "price") update({ price: "" });
    else { state.brands.delete(k.slice(6)); update({}); }
  });

  // Búsqueda del encabezado: en el catálogo filtra en vivo; en el inicio envía al catálogo
  $("#q").value = state.q;
  const searchFresh = q => { state.brands.clear(); update({ q, gender: "", price: "" }); };
  $(".top-search").addEventListener("submit", e => { if (isShop) { e.preventDefault(); searchFresh($("#q").value.trim()); } });
  let searchTimer;
  $("#q").addEventListener("input", e => {
    if (!isShop) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchFresh(e.target.value.trim()), 220);
  });

  // Filtros en celular
  const openFilters = () => { filters.classList.add("open"); scrim.hidden = false; };
  $("#filtersOpen").addEventListener("click", openFilters);
  $("#filtersClose").addEventListener("click", closeAll);
  $("#filtersApply").addEventListener("click", () => { closeAll(); goShop(); });
  }

  // ---------- Agregar al pedido ----------
  function addToCart(id) {
    cart[id] = (cart[id] || 0) + 1;
    save();
    refreshCards();
    updateCart(true);
    const p = PRODUCTS[id];
    toast(`${p.nombre}${p.ml ? " " + p.ml + " ml" : ""} agregado a tu pedido`);
  }

  // Selector de tamaño
  document.body.insertAdjacentHTML("beforeend", `
    <dialog class="size-dialog" id="sizeDialog" aria-labelledby="sizeTitle">
      <form method="dialog" class="size-inner">
        <button class="icon-btn size-close" value="cancel" aria-label="Cerrar">✕</button>
        <div class="size-media" id="sizeMedia"></div>
        <div class="size-info">
          <span class="brand-sm" id="sizeBrand"></span>
          <h3 id="sizeTitle"></h3>
          <p class="size-ask">¿Qué tamaño necesitás?</p>
          <div class="size-options" id="sizeOptions"></div>
        </div>
      </form>
    </dialog>`);
  const dlg = $("#sizeDialog");
  function askSize(g) {
    $("#sizeMedia").innerHTML = g.foto ? `<img src="${g.foto}" alt="">` : bottle(g);
    $("#sizeBrand").textContent = titleCase(g.marca);
    $("#sizeTitle").textContent = g.nombre;
    $("#sizeOptions").innerHTML = g.variants.map(v => {
      const q = cart[v.id] || 0;
      return `<button type="button" class="size-opt" data-id="${v.id}"><b>${v.ml ? v.ml + " ml" : "Único"}</b><span>${fmt(v.precio)}</span>${q ? `<em>${q} en tu pedido</em>` : ""}</button>`;
    }).join("");
    dlg.showModal();
  }
  $("#sizeOptions").addEventListener("click", e => {
    const b = e.target.closest(".size-opt");
    if (!b) return;
    addToCart(+b.dataset.id);
    dlg.close();
  });
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

  document.addEventListener("click", e => {
    const b = e.target.closest(".add[data-gid]");
    if (!b) return;
    const g = GROUPS[+b.dataset.gid];
    if (g.variants.length === 1) addToCart(g.variants[0].id);
    else askSize(g);
  });

  function refreshCards() {
    $$(".add[data-gid]").forEach(b => {
      const q = qtyOf(GROUPS[+b.dataset.gid]);
      b.classList.toggle("added", !!q);
      b.textContent = q ? "✓" + (q > 1 ? q : "") : "+";
    });
  }

  // ---------- Drawer del pedido ----------
  $("#cartOpen").addEventListener("click", () => { drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); scrim.hidden = false; $("#cartClose").focus(); });
  $("#cartClose").addEventListener("click", closeAll);
  scrim.addEventListener("click", closeAll);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });

  const lines = () => Object.entries(cart).filter(([id, q]) => PRODUCTS[id] && q > 0).map(([id, q]) => ({ p: PRODUCTS[id], q }));

  function updateCart(bump) {
    const ls = lines();
    const count = ls.reduce((s, l) => s + l.q, 0);
    const total = ls.reduce((s, l) => s + l.q * l.p.precio, 0);
    $("#cartCount").textContent = count;
    $("#cartTotal").textContent = fmt(total);
    $("#sendOrder").disabled = !count;
    if (bump) { const btn = $("#cartOpen"); btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump"); }
    $("#cartItems").innerHTML = ls.length ? ls.map(({ p, q }) => `
      <div class="line">
        <div><h5>${esc(p.nombre)}</h5><span class="meta">${titleCase(p.marca)}${p.ml ? " · " + p.ml + " ml" : ""}</span></div>
        <span class="lp">${fmt(p.precio * q)}</span>
        <div class="qty"><button data-id="${p.id}" data-d="-1" aria-label="Quitar uno">−</button><span>${q}</span><button data-id="${p.id}" data-d="1" aria-label="Agregar uno">+</button></div>
      </div>`).join("")
      : `<div class="cart-empty"><b>Tu pedido está vacío</b>Agregá fragancias desde la tienda.</div>`;
  }

  $("#cartItems").addEventListener("click", e => {
    const b = e.target.closest("button[data-d]");
    if (!b) return;
    const id = b.dataset.id;
    cart[id] = (cart[id] || 0) + +b.dataset.d;
    if (cart[id] <= 0) delete cart[id];
    save(); updateCart(); refreshCards();
  });
  $("#clearCart").addEventListener("click", () => { cart = {}; save(); updateCart(); refreshCards(); });

  $("#sendOrder").addEventListener("click", () => {
    const ls = lines();
    if (!ls.length) return;
    const total = ls.reduce((s, l) => s + l.q * l.p.precio, 0);
    const msg = [
      "¡Hola Benza! Quiero hacer este pedido:", "",
      ...ls.map(({ p, q }) => `• ${q} x ${titleCase(p.marca)} ${p.nombre}${p.ml ? " " + p.ml + "ml" : ""} — ${fmt(p.precio * q)}`),
      "", `Total estimado: ${fmt(total)}`, "¿Tienen stock? ¡Gracias!",
    ].join("\n");
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  });

  let tt;
  function toast(t) {
    const el = $("#toast");
    el.textContent = t;
    el.classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => el.classList.remove("show"), 2200);
  }

  renderIconos();
  if (isShop) render();
  updateCart();
})();
