(() => {
  "use strict";

  const WA_NUMBER = "5491131754109";
  const PAGE = 12;
  const PRODUCTS = (window.BENZA_PRODUCTOS || []).map((p, i) => ({ ...p, id: p.id ?? i, conc: concentration(p.nombre), linea: p.linea || "disenador" }));
  // Regla: un perfume sin precio cargado está sin stock (se muestra, pero no se puede pedir).
  const enStock = v => v.precio > 0;
  const LINEAS = { disenador: "Diseñador", arabe: "Árabes" };
  // ID fijo de cada producto (no la posición): así agregar o borrar perfumes no mezcla los pedidos guardados.
  const BY_ID = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

  // Un mismo perfume en varios tamaños (misma marca + nombre + género) se muestra como una sola tarjeta.
  const GROUPS = [];
  {
    const byKey = new Map();
    for (const p of PRODUCTS) {
      const key = `${p.marca}|${p.nombre}|${p.genero}`;
      if (!byKey.has(key)) { const g = { gid: GROUPS.length, marca: p.marca, nombre: p.nombre, genero: p.genero || null, conc: p.conc, linea: p.linea, variants: [] }; byKey.set(key, g); GROUPS.push(g); }
      byKey.get(key).variants.push(p);
    }
    for (const g of GROUPS) {
      g.variants.sort((a, b) => (a.ml || 0) - (b.ml || 0));
      // Todas las fotos del perfume (de todos sus tamaños, sin repetir); la primera es la principal.
      g.fotos = [...new Set(g.variants.flatMap(v => (v.fotos && v.fotos.length ? v.fotos : v.foto ? [v.foto] : [])))];
      g.foto = g.fotos[0] || null;
      const conPrecio = g.variants.filter(enStock);
      g.stock = conPrecio.length > 0;
      g.min = g.stock ? Math.min(...conPrecio.map(v => v.precio)) : null;
      g.variants.forEach(v => (v.gid = g.gid));
    }
  }
  const qtyOf = g => g.variants.reduce((sum, v) => sum + (cart[v.id] || 0), 0);

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fmt = n => "$" + n.toLocaleString("es-AR");
  const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const titleCase = s => s.split(" ").map(w => (w === "&" ? w : w[0] + w.slice(1).toLowerCase())).join(" ");
  const TALL = new Set(["GIORGIO ARMANI", "PACO RABANNE", "VERSACE", "DOLCE & GABBANA", "MONTBLANC", "AL HARAMAIN"]); // logos con símbolo: un poco más altos
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
  let renderPdpCart = () => {}; // la página de producto la reemplaza para mostrar lo que ya está en el pedido

  // ---------- Envío: código postal del cliente y configuración ----------
  const getCP = () => { try { return localStorage.getItem("benza-cp") || ""; } catch { return ""; } };
  const setCP = cp => { try { cp ? localStorage.setItem("benza-cp", cp) : localStorage.removeItem("benza-cp"); } catch { /* sin almacenamiento */ } };
  let envioCfgP = null;
  // cache "no-cache": el navegador siempre verifica la versión vigente (así un cambio de modo o de precios se ve enseguida)
  const envioConfig = () => (envioCfgP = envioCfgP || fetch("js/envios.json", { cache: "no-cache" }).then(r => r.json()).catch(() => null));
  // "calcular" = muestra el costo; "consultar" = sólo pide el CP y el costo se pasa por WhatsApp
  const modoEnvio = async () => ((await envioConfig()) || {}).modo === "consultar" ? "consultar" : "calcular";
  const describirCP = (cp, cfg) => {
    const p = window.BenzaEnvios && window.BenzaEnvios.parseCP(cp);
    if (!p) return null;
    return { cp: p.cp, provincia: p.provincia || (cfg ? window.BenzaEnvios.provinciaDe(p.cp, cfg) : null) };
  };

  // ---------- Tarjeta ----------
  function card(g) {
    const q = qtyOf(g);
    const multi = g.variants.length > 1;
    const sizes = g.variants.filter(v => v.ml).map(v => v.ml + " ml");
    const sizeHtml = multi ? `<span class="sizes">${sizes.map(x => `<span>${x}</span>`).join("")}</span>` : (sizes[0] ? " · " + sizes[0] : "");
    const name = esc(titleCase(g.marca) + " " + g.nombre);
    const href = productUrl(g);
    return `<article class="card${g.stock ? "" : " sin-stock"}">
      <a class="card-media${g.foto ? " has-photo" : ""}" href="${href}" tabindex="-1" aria-hidden="true">${g.genero ? `<span class="tag ${g.genero}">${g.genero}</span>` : ""}${g.stock ? "" : `<span class="tag-stock">Sin stock</span>`}${g.foto ? `<img src="${g.foto}" alt="" loading="lazy" width="500" height="500">${g.fotos[1] ? `<img class="alt" src="${g.fotos[1]}" alt="" loading="lazy" width="500" height="500">` : ""}` : bottle(g)}</a>
      <div class="card-body">
        <span class="brand-sm">${titleCase(g.marca)}</span>
        <h4><a href="${href}">${esc(g.nombre)}</a></h4>
        <span class="meta">${g.conc}${sizeHtml}</span>
        <div class="card-foot">
          ${g.stock ? `<span class="price">${multi && g.variants.filter(enStock).length > 1 ? "<small>desde</small>" : ""}${fmt(g.min)}</span>` : `<span class="price price-na">Sin stock</span>`}
          ${cartCtrl(g, name)}
        </div>
      </div>
    </article>`;
  }

  const productUrl = g => `producto.html?id=${g.variants[0].id}`;

  // Botón de la tarjeta: "+" si no está en el pedido; "− cantidad +" si ya está.
  const waConsulta = g => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`¡Hola Benza! Quería consultar por ${titleCase(g.marca)} ${g.nombre}. ¿Les va a ingresar?`)}`;
  function cartCtrl(g, name = esc(titleCase(g.marca) + " " + g.nombre)) {
    // Sin stock: en lugar de "+", un botón para consultar por WhatsApp
    if (!g.stock) return `<span class="cart-ctrl" data-gid="${g.gid}"><a class="ask" href="${waConsulta(g)}" target="_blank" rel="noopener" aria-label="Consultar por ${name} en WhatsApp">Consultar</a></span>`;
    const q = qtyOf(g);
    if (!q) return `<span class="cart-ctrl" data-gid="${g.gid}"><button class="add" data-gid="${g.gid}" aria-label="Agregar ${name} al pedido">+</button></span>`;
    return `<span class="cart-ctrl in" data-gid="${g.gid}">
      <button class="dec" data-gid="${g.gid}" aria-label="Quitar uno de ${name}">−</button>
      <b aria-label="${q} en tu pedido">${q}</b>
      <button class="add" data-gid="${g.gid}" aria-label="Agregar otro ${name}">+</button>
    </span>`;
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
    const c = b.closest("section").querySelector(".carousel");
    c.scrollBy({ left: +b.dataset.scroll * c.clientWidth * 0.75, behavior: "smooth" });
  }));

  // Pared de marcas (inicio)
  const tile = b => `<a class="brand-tile" href="catalogo.html?marca=${encodeURIComponent(b)}" aria-label="${titleCase(b)}"><img src="${logoSrc(b)}"${TALL.has(b) ? ' class="tall"' : ""} alt="" loading="lazy" onerror="this.parentNode.classList.add('no-logo')"><span>${b}</span></a>`;
  // "Nuestras marcas": todas juntas (diseñador y árabes)
  if ($("#brandWall")) $("#brandWall").innerHTML = brands.slice().sort().map(tile).join("");

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
    linea: { arabes: "arabe", arabe: "arabe", disenador: "disenador" }[(params.get("linea") || "").toLowerCase()] || "",
    brands: new Set((params.get("marca") || "").split(",").filter(b => brands.includes(b))),
    sort: params.get("orden") || "rel",
    shown: PAGE,
  };

  function syncUrl() {
    const u = new URLSearchParams();
    if (state.q) u.set("q", state.q);
    if (state.gender) u.set("genero", state.gender);
    if (state.linea) u.set("linea", state.linea === "arabe" ? "arabes" : state.linea);
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
      (!state.linea || g.linea === state.linea) &&
      (!state.brands.size || state.brands.has(g.marca)) &&
      (!state.price || g.variants.some(v => enStock(v) && v.precio >= min && v.precio <= max)) &&
      terms.every(t => norm(`${g.marca} ${g.nombre} ${g.conc}`).includes(t))
    );
    if (state.sort === "asc") list.sort((a, b) => a.min - b.min);
    if (state.sort === "desc") list.sort((a, b) => b.min - a.min);
    if (state.sort === "az") list.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    // Los que tienen stock van primero (el orden de cada grupo se mantiene)
    return list.filter(g => g.stock).concat(list.filter(g => !g.stock));
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
      : state.linea === "arabe" ? (state.gender ? `Perfumes árabes ${GENDER_LABEL[state.gender].toLowerCase()}` : "Perfumes árabes")
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
    if ($("#shopSub")) $("#shopSub").textContent = state.linea === "arabe"
      ? "Perfumería árabe: Lattafa, Afnan, Armaf, Rasasi, Al Haramain y más."
      : state.linea === "disenador" ? "Perfumes de diseñador de las grandes casas."
      : "Perfumes de diseñador y árabes de las grandes casas.";
    $("#sortSel").value = state.sort;
    syncUrl();

    // etiquetas activas
    const tags = [];
    if (state.q) tags.push(["q", `“${esc(state.q)}”`]);
    if (state.linea) tags.push(["linea", LINEAS[state.linea]]);
    if (state.gender) tags.push(["gender", GENDER_LABEL[state.gender]]);
    if (state.price) tags.push(["price", PRICE_LABEL[state.price]]);
    state.brands.forEach(b => tags.push(["brand:" + b, titleCase(b)]));
    $("#activeTags").innerHTML = tags.map(([k, t]) => `<button class="tag-x" data-k="${esc(k)}">${t}<span aria-hidden="true">✕</span></button>`).join("");
    $("#activeCount").textContent = tags.length || "";

    // sincronizar controles
    $$('input[name="g"]').forEach(i => (i.checked = i.value === state.gender));
    $$('input[name="l"]').forEach(i => (i.checked = i.value === state.linea));
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
    else if (t.name === "l") update({ linea: t.value });
    else if (t.name === "p") update({ price: t.value });
    else if (t.type === "checkbox") {
      t.checked ? state.brands.add(t.value) : state.brands.delete(t.value);
      update({});
    }
  });
  $("#sortSel").addEventListener("change", e => update({ sort: e.target.value }));
  $("#loadMore").addEventListener("click", () => { state.shown += PAGE; render(); });
  $("#resetFilters").addEventListener("click", () => { state.brands.clear(); update({ q: "", gender: "", price: "", linea: "" }); });
  $("#activeTags").addEventListener("click", e => {
    const k = e.target.closest(".tag-x")?.dataset.k;
    if (!k) return;
    if (k === "q") update({ q: "" });
    else if (k === "gender") update({ gender: "" });
    else if (k === "linea") update({ linea: "" });
    else if (k === "price") update({ price: "" });
    else { state.brands.delete(k.slice(6)); update({}); }
  });

  // Búsqueda del encabezado: en el catálogo filtra en vivo; en el inicio envía al catálogo
  $("#q").value = state.q;
  const searchFresh = q => { state.brands.clear(); update({ q, gender: "", price: "", linea: "" }); };
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

  // ---------- Agregar / sacar del pedido ----------
  // Único punto que cambia cantidades: actualiza tarjetas, carrito, selector y página de producto.
  function changeQty(id, d, silent) {
    const p = BY_ID[id];
    if (!p || (d > 0 && !enStock(p))) return;   // no se puede sumar algo sin stock
    cart[id] = (cart[id] || 0) + d;
    if (cart[id] <= 0) delete cart[id];
    save();
    refreshCards();
    updateCart(d > 0);
    if (dlg.open && dlgGroup) renderSizeOptions(dlgGroup);
    renderPdpCart();
    if (!silent) {
      const n = `${p.nombre}${p.ml ? " " + p.ml + " ml" : ""}`;
      toast(d > 0 ? `${d > 1 ? d + " × " : ""}${n} agregado a tu pedido` : `${n}: quitado del pedido`);
    }
  }
  const addToCart = id => changeQty(id, 1);

  // Selector de tamaño: elegir para agregar, o ajustar las cantidades de cada tamaño.
  document.body.insertAdjacentHTML("beforeend", `
    <dialog class="size-dialog" id="sizeDialog" aria-labelledby="sizeTitle">
      <form method="dialog" class="size-inner">
        <button class="icon-btn size-close" value="cancel" aria-label="Cerrar">✕</button>
        <div class="size-media" id="sizeMedia"></div>
        <div class="size-info">
          <span class="brand-sm" id="sizeBrand"></span>
          <h3 id="sizeTitle"></h3>
          <p class="size-ask" id="sizeAsk">¿Qué tamaño necesitás?</p>
          <div class="size-options" id="sizeOptions"></div>
          <button class="btn btn-gold btn-block size-done" value="ok" id="sizeDone" hidden>Listo</button>
          <a class="size-more" id="sizeMore" href="#">Ver detalle del perfume →</a>
        </div>
      </form>
    </dialog>`);
  const dlg = $("#sizeDialog");
  let dlgGroup = null;
  function renderSizeOptions(g) {
    $("#sizeOptions").innerHTML = g.variants.map(v => {
      const q = cart[v.id] || 0;
      if (!enStock(v)) return `<div class="size-opt off" data-id="${v.id}"><b>${v.ml ? v.ml + " ml" : "Único"}</b><span class="price-na">Sin stock</span><span></span></div>`;
      return `<div class="size-opt${q ? " in" : ""}" data-id="${v.id}">
        <b>${v.ml ? v.ml + " ml" : "Único"}</b><span>${fmt(v.precio)}</span>
        ${q ? `<span class="stepper"><button type="button" data-id="${v.id}" data-d="-1" aria-label="Quitar uno">−</button><b>${q}</b><button type="button" data-id="${v.id}" data-d="1" aria-label="Agregar otro">+</button></span>`
            : `<button type="button" class="size-add" data-id="${v.id}">Agregar</button>`}
      </div>`;
    }).join("");
    $("#sizeDone").hidden = !qtyOf(g);
  }
  function askSize(g, manage) {
    dlgGroup = g;
    $("#sizeMedia").innerHTML = g.foto ? `<img src="${g.foto}" alt="">` : bottle(g);
    $("#sizeBrand").textContent = titleCase(g.marca);
    $("#sizeTitle").textContent = g.nombre;
    $("#sizeAsk").textContent = manage ? "Ajustá las cantidades de cada tamaño:" : "¿Qué tamaño necesitás?";
    $("#sizeMore").href = productUrl(g);
    renderSizeOptions(g);
    dlg.showModal();
  }
  $("#sizeOptions").addEventListener("click", e => {
    const step = e.target.closest("button[data-d]");
    if (step) return changeQty(+step.dataset.id, +step.dataset.d);
    const add = e.target.closest(".size-add");
    if (add) { addToCart(+add.dataset.id); dlg.close(); }
  });
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

  document.addEventListener("click", e => {
    const b = e.target.closest(".cart-ctrl button[data-gid]");
    if (!b) return;
    const g = GROUPS[+b.dataset.gid];
    if (b.classList.contains("add")) {
      const disponibles = g.variants.filter(enStock);
      if (disponibles.length === 1 && g.variants.length === 1) addToCart(disponibles[0].id);
      else if (disponibles.length) askSize(g);
    } else {
      // "−": si hay un solo tamaño en el pedido, se saca uno; si hay varios, se elige cuál.
      const enPedido = g.variants.filter(v => cart[v.id]);
      if (enPedido.length === 1) changeQty(enPedido[0].id, -1);
      else if (enPedido.length > 1) askSize(g, true);
    }
  });

  function refreshCards() {
    $$(".cart-ctrl[data-gid]").forEach(el => {
      const had = el.contains(document.activeElement) ? document.activeElement.className : null;
      el.outerHTML = cartCtrl(GROUPS[+el.dataset.gid]);
      if (had) { const again = $(`.cart-ctrl[data-gid="${el.dataset.gid}"] .${had.split(" ")[0]}`); again?.focus(); }
    });
  }

  // ---------- Drawer del pedido ----------
  $("#cartOpen").addEventListener("click", () => { drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); scrim.hidden = false; $("#cartClose").focus(); });
  $("#cartClose").addEventListener("click", closeAll);
  scrim.addEventListener("click", closeAll);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });

  // Si un perfume del pedido se quedó sin stock (sin precio), deja de contar.
  const lines = () => Object.entries(cart).filter(([id, q]) => BY_ID[id] && enStock(BY_ID[id]) && q > 0).map(([id, q]) => ({ p: BY_ID[id], q }));

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
    changeQty(+b.dataset.id, +b.dataset.d, true);
  });
  $("#clearCart").addEventListener("click", () => {
    cart = {}; save(); updateCart(); refreshCards();
    renderPdpCart();
  });

  // Código postal en "Mi pedido": se suma al mensaje de WhatsApp para calcular el envío.
  $("#drawer footer .total").insertAdjacentHTML("beforebegin", `
    <div class="cart-cp">
      <label for="cartCp">Código postal para el envío</label>
      <input id="cartCp" name="postal-code" autocomplete="postal-code" maxlength="8" placeholder="Ej: 1425">
      <p class="cart-cp-note" id="cartCpNote"></p>
    </div>`);
  async function actualizarCpPedido() {
    const cp = getCP(), cfg = await envioConfig();
    if ($("#cartCp") !== document.activeElement) $("#cartCp").value = cp;
    const d = cp ? describirCP(cp, cfg) : null;
    $("#cartCpNote").textContent = !cp ? "Lo usamos para calcular el costo del envío." :
      !d ? "Revisá el código postal (4 dígitos, ej. 1425)." :
      `${d.provincia ? d.provincia + " · " : ""}te pasamos el costo del envío por WhatsApp.`;
  }
  $("#cartCp").addEventListener("change", e => {
    const v = e.target.value.trim().toUpperCase();
    setCP(v);
    if ($("#shipCp") && !$("#shipCp").value) $("#shipCp").value = v;
    actualizarCpPedido();
  });
  actualizarCpPedido();

  $("#sendOrder").addEventListener("click", async () => {
    const ls = lines();
    if (!ls.length) return;
    const total = ls.reduce((s, l) => s + l.q * l.p.precio, 0);
    const cp = getCP(), d = cp ? describirCP(cp, await envioConfig()) : null;
    const envio = !cp ? "Envío: a coordinar (todavía no puse mi código postal)"
      : `Envío a CP ${d ? d.cp : cp}${d && d.provincia ? ` (${d.provincia})` : ""}: a coordinar`;
    const msg = [
      "¡Hola Benza! Quiero hacer este pedido:", "",
      ...ls.map(({ p, q }) => `• ${q} x ${titleCase(p.marca)} ${p.nombre}${p.ml ? " " + p.ml + "ml" : ""} — ${fmt(p.precio * q)}`),
      "", `Total estimado: ${fmt(total)}`, envio, "¿Tienen stock? ¡Gracias!",
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

  // ---------- Página de producto (producto.html?id=N) ----------
  const pdp = $("#pdp");
  if (pdp) {
    const pedido = BY_ID[new URLSearchParams(location.search).get("id")];
    if (!pedido) {
      pdp.innerHTML = `<div class="pdp-404"><h1>No encontramos ese perfume</h1><p>Puede que ya no esté en el catálogo.</p><a class="btn btn-gold" href="catalogo.html">Ver catálogo</a></div>`;
    } else {
      const g = GROUPS[pedido.gid];
      let sel = enStock(pedido) ? pedido : (GROUPS[pedido.gid].variants.find(enStock) || pedido);   // tamaño elegido
      let cant = 1;          // cantidad a agregar
      const multi = g.variants.length > 1;
      const marca = titleCase(g.marca);
      const generoTxt = { Masculino: "Hombre", Femenino: "Mujer", Unisex: "Unisex" }[g.genero] || "";
      const fotos = g.fotos;
      const fotoDe = v => (v.fotos && v.fotos[0]) || v.foto;
      let fi = Math.max(0, fotos.indexOf(fotoDe(pedido)));   // foto que se está viendo
      const waTxt = encodeURIComponent(`¡Hola Benza! Quería consultar por ${marca} ${g.nombre}.`);

      document.title = `${marca} ${g.nombre} · Benza Importaciones`;
      pdp.innerHTML = `
        <nav class="crumbs pdp-crumbs" aria-label="Ruta">
          <a href="index.html">Inicio</a><span>/</span><a href="catalogo.html">Catálogo</a><span>/</span>
          ${g.linea === "arabe" ? `<a href="catalogo.html?linea=arabes">Árabes</a><span>/</span>` : g.genero ? `<a href="catalogo.html?genero=${g.genero}">${generoTxt}</a><span>/</span>` : ""}<span aria-current="page">${esc(g.nombre)}</span>
        </nav>
        <div class="pdp-grid">
          <div class="pdp-gallery">
            <div class="pdp-main${fotos.length ? " has-photo" : ""}" id="pdpMain">
              <span class="tag ${g.genero}">${g.genero}</span>
              ${fotos.length ? `<img src="${fotos[fi]}" alt="${esc(marca + " " + g.nombre)}" width="600" height="600">` : bottle(g)}
              ${fotos.length > 1 ? `
                <button class="pdp-nav prev" data-nav="-1" aria-label="Foto anterior">‹</button>
                <button class="pdp-nav next" data-nav="1" aria-label="Foto siguiente">›</button>
                <span class="pdp-count" id="pdpCount">${fi + 1} / ${fotos.length}</span>` : ""}
            </div>
            ${fotos.length > 1 ? `<div class="pdp-thumbs">${fotos.map((f, i) => `<button class="${i === fi ? "on" : ""}" data-i="${i}" aria-label="Ver foto ${i + 1}"><img src="${f}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
          </div>

          <div class="pdp-info">
            <a class="pdp-brand" href="catalogo.html?marca=${encodeURIComponent(g.marca)}" aria-label="Ver todo ${esc(marca)}">
              <img src="${logoSrc(g.marca)}" alt="${esc(marca)}" onerror="this.replaceWith(document.createTextNode(this.alt))">
            </a>
            <h1>${esc(g.nombre)}</h1>
            <p class="pdp-sub">${[g.conc, generoTxt, g.linea === "arabe" ? "Perfumería árabe" : ""].filter(Boolean).join(" · ")}</p>

            <div class="pdp-price"><span id="pdpPrice"></span><small id="pdpPriceSize"></small></div>

            <div class="pdp-block">
              <span class="pdp-label">Tamaño</span>
              <div class="pdp-sizes" role="radiogroup" aria-label="Tamaño">
                ${g.variants.map(v => `<button class="pdp-size" role="radio" data-id="${v.id}">${v.ml ? v.ml + " ml" : "Único"}${multi ? `<small>${enStock(v) ? fmt(v.precio) : "Sin stock"}</small>` : ""}</button>`).join("")}
              </div>
            </div>

            <div class="pdp-buy">
              <div class="pdp-qty" aria-label="Cantidad">
                <button type="button" data-q="-1" aria-label="Uno menos">−</button>
                <output id="pdpCant">1</output>
                <button type="button" data-q="1" aria-label="Uno más">+</button>
              </div>
              <button class="btn btn-gold pdp-add" id="pdpAdd">Agregar al pedido</button>
              <a class="btn btn-ghost pdp-add pdp-ask" id="pdpAsk" href="${waConsulta(g)}" target="_blank" rel="noopener" hidden>Sin stock · Consultar por WhatsApp</a>
            </div>
            <div class="pdp-incart" id="pdpInCart" aria-live="polite"></div>

            <div class="pdp-ship">
              <span class="pdp-label">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h11v9H2zM13 9h4l3 3v3h-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="6" cy="17" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="17" cy="17" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
                Calcular envío
              </span>
              <form class="pdp-ship-form" id="shipForm" autocomplete="on">
                <input id="shipCp" name="postal-code" autocomplete="postal-code" inputmode="text" maxlength="8" placeholder="Tu código postal" aria-label="Tu código postal">
                <button class="btn btn-ghost" type="submit">Calcular</button>
              </form>
              <a class="pdp-ship-help" href="https://www.correoargentino.com.ar/formularios/cpa" target="_blank" rel="noopener">No sé mi código postal</a>
              <div class="pdp-ship-result" id="shipResult" aria-live="polite"></div>
            </div>

            <ul class="pdp-perks">
              <li>✦ Productos 100% originales</li>
              <li>✦ Envíos a todo el país</li>
              <li>✦ Pedido y pago coordinados por WhatsApp</li>
            </ul>

            <details class="pdp-acc" open>
              <summary>Detalles del perfume</summary>
              <dl>
                <div><dt>Marca</dt><dd><a href="catalogo.html?marca=${encodeURIComponent(g.marca)}">${esc(marca)}</a></dd></div>
                <div><dt>Perfume</dt><dd>${esc(g.nombre)}</dd></div>
                <div><dt>Concentración</dt><dd>${g.conc}</dd></div>
                ${generoTxt ? `<div><dt>Para</dt><dd>${generoTxt}</dd></div>` : ""}
                <div><dt>Tamaños</dt><dd>${g.variants.map(v => (v.ml ? v.ml + " ml" : "Único")).join(" · ")}</dd></div>
              </dl>
            </details>
            <details class="pdp-acc">
              <summary>Envíos y pagos</summary>
              <p>Enviamos a todo el país por Correo Argentino, a domicilio o a sucursal. El costo depende del código postal y te lo confirmamos junto con el pedido. En algunas zonas el envío es gratis.</p>
              <p>Al enviar el pedido por WhatsApp coordinamos stock, forma de pago y entrega.</p>
            </details>
            <a class="pdp-wa" href="https://wa.me/${WA_NUMBER}?text=${waTxt}" target="_blank" rel="noopener">Consultar por este perfume en WhatsApp</a>
          </div>
        </div>`;

      // ---- Calcular envío (Correo Argentino) ----
      // Con servidor: /api/envio (precio real de Correo si hay credenciales). Sin servidor: tabla de zonas en el navegador.
      let envioCp = null, envioTimer = null;
      async function cotizarEnvio(cp) {
        const q = { cp, unidades: cant, subtotal: sel.precio * cant };
        const cfg = await envioConfig();
        // Modo "consultar": no se da precio; sólo se valida el CP y se avisa si tiene envío gratis.
        if (cfg && cfg.modo === "consultar" && window.BenzaEnvios) return { ...window.BenzaEnvios.analizar(cfg, q), consultar: true };
        try {
          const r = await fetch(`/api/envio?${new URLSearchParams(q)}`, { signal: AbortSignal.timeout(8000) });
          if ((r.headers.get("content-type") || "").includes("application/json")) return await r.json();
        } catch { /* sin servidor: se calcula acá */ }
        if (!window.BenzaEnvios || !cfg) return { ok: false, error: "No pudimos calcular el envío. Escribinos y te pasamos el costo." };
        return window.BenzaEnvios.cotizarTabla(cfg, q);
      }
      async function calcularEnvio(cp, silencioso) {
        const out = $("#shipResult");
        if (!silencioso) out.innerHTML = `<p class="ship-loading">Un momento…</p>`;
        const r = await cotizarEnvio(cp);
        if (!r.ok) { out.innerHTML = `<p class="ship-error">${esc(r.error)}</p>`; envioCp = null; return; }
        envioCp = cp;
        setCP(cp);
        actualizarCpPedido();
        const lugar = [r.cp, r.provincia].filter(Boolean).join(" · ");
        const cuanto = cant > 1 ? ` para ${cant} unidades` : "";
        if (r.consultar) {
          out.innerHTML = `
            <p class="ship-dest">Envío a <b>${esc(lugar)}</b></p>
            ${r.gratis ? `<p class="ship-free">${esc(r.opciones[0].nombre)}</p>` : `<p class="ship-consult">Te pasamos el costo del envío por WhatsApp junto con tu pedido.</p>`}
            <p class="ship-note">Enviamos por Correo Argentino, a domicilio o a sucursal.</p>`;
          return;
        }
        out.innerHTML = `
          <p class="ship-dest">Envío a <b>${esc(lugar)}</b>${cuanto}</p>
          ${r.gratis ? `<p class="ship-free">${esc(r.opciones[0].nombre)}</p>` : `
          <ul class="ship-opts">${r.opciones.map(o => `<li><span><b>${esc(o.nombre)}</b>${o.dias ? `<small>${esc(o.dias)}</small>` : ""}</span><em>${fmt(o.precio)}</em></li>`).join("")}</ul>`}
          ${r.aviso ? `<p class="ship-note">${esc(r.aviso)}</p>` : ""}
          <p class="ship-note">${r.fuente === "correo" ? "Tarifa de Correo Argentino." : "Costo aproximado con Correo Argentino."} Se confirma al coordinar el pedido.</p>`;
      }
      $("#shipForm").addEventListener("submit", e => { e.preventDefault(); calcularEnvio($("#shipCp").value.trim()); });
      if (getCP()) $("#shipCp").value = getCP();
      // Textos del recuadro según el modo
      modoEnvio().then(m => {
        if (m !== "consultar") return;
        $(".pdp-ship .pdp-label").lastChild.textContent = " Envío a tu código postal";
        $("#shipForm button").textContent = "Confirmar";
      });
      // Si cambia el tamaño o la cantidad, se recalcula (cambian el peso y el monto para envío gratis).
      const recalcularEnvio = () => { if (!envioCp) return; clearTimeout(envioTimer); envioTimer = setTimeout(() => calcularEnvio(envioCp, true), 250); };

      const pintarSel = () => {
        recalcularEnvio();
        $$(".pdp-size", pdp).forEach(b => { const on = +b.dataset.id === sel.id; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
        const hay = enStock(sel);
        $("#pdpPrice").textContent = hay ? fmt(sel.precio) : "Sin stock";
        $(".pdp-price").classList.toggle("na", !hay);
        $(".pdp-qty").hidden = !hay;
        $("#pdpAdd").hidden = !hay;
        $("#pdpAsk").hidden = hay;
        $("#pdpPriceSize").textContent = sel.ml ? `${sel.ml} ml` : "";
        $("#pdpCant").textContent = cant;
        if (hay) $("#pdpAdd").textContent = cant > 1 ? `Agregar ${cant} al pedido · ${fmt(sel.precio * cant)}` : "Agregar al pedido";
        history.replaceState(null, "", `producto.html?id=${sel.id}`);
      };

      renderPdpCart = () => {
        const en = g.variants.filter(v => cart[v.id]);
        $("#pdpInCart").innerHTML = en.length ? `
          <p class="pdp-incart-title">En tu pedido</p>
          ${en.map(v => `<div class="pdp-line">
            <span>${v.ml ? v.ml + " ml" : g.nombre}</span>
            <span class="stepper"><button data-id="${v.id}" data-d="-1" aria-label="Quitar uno de ${v.ml || ""} ml">−</button><b>${cart[v.id]}</b><button data-id="${v.id}" data-d="1" aria-label="Agregar otro de ${v.ml || ""} ml">+</button></span>
            <span class="pdp-line-total">${fmt(v.precio * cart[v.id])}</span>
          </div>`).join("")}
          <button class="link-btn pdp-ver" id="pdpVer">Ver pedido completo</button>` : "";
      };

      const verFoto = i => {
        if (!fotos.length) return;
        fi = (i + fotos.length) % fotos.length;
        $("#pdpMain img").src = fotos[fi];
        if ($("#pdpCount")) $("#pdpCount").textContent = `${fi + 1} / ${fotos.length}`;
        $$(".pdp-thumbs button", pdp).forEach(b => b.classList.toggle("on", +b.dataset.i === fi));
      };
      // Deslizar con el dedo en el celular
      let x0 = null;
      pdp.addEventListener("touchstart", e => { if (e.target.closest("#pdpMain")) x0 = e.touches[0].clientX; }, { passive: true });
      pdp.addEventListener("touchend", e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 40) verFoto(fi + (dx < 0 ? 1 : -1));
      });

      pdp.addEventListener("click", e => {
        const size = e.target.closest(".pdp-size");
        if (size) {
          sel = BY_ID[size.dataset.id];
          const f = fotos.indexOf(fotoDe(sel));   // si ese tamaño tiene su propia foto, mostrarla
          if (f >= 0 && f !== fi) verFoto(f);
          return pintarSel();
        }
        const nav = e.target.closest("[data-nav]");
        if (nav) return verFoto(fi + +nav.dataset.nav);
        const q = e.target.closest("[data-q]");
        if (q) { cant = Math.max(1, Math.min(20, cant + +q.dataset.q)); return pintarSel(); }
        if (e.target.closest("#pdpAdd")) { if (enStock(sel)) changeQty(sel.id, cant); cant = 1; return pintarSel(); }
        const step = e.target.closest(".pdp-line button[data-d]");
        if (step) return changeQty(+step.dataset.id, +step.dataset.d);
        if (e.target.closest("#pdpVer")) return $("#cartOpen").click();
        const th = e.target.closest(".pdp-thumbs button");
        if (th) verFoto(+th.dataset.i);
      });
      document.addEventListener("keydown", e => {
        if (document.querySelector("dialog[open]") || $("#drawer").classList.contains("open") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
        if (e.key === "ArrowLeft") verFoto(fi - 1);
        if (e.key === "ArrowRight") verFoto(fi + 1);
      });

      pintarSel();
      renderPdpCart();

      // Relacionados: misma marca; si hay pocos, se completa con el mismo género.
      let rel = GROUPS.filter(x => x !== g && x.marca === g.marca);
      if (rel.length < 4) rel = rel.concat(GROUPS.filter(x => x !== g && x.marca !== g.marca && x.genero === g.genero).slice(0, 8 - rel.length));
      if (rel.length) {
        $("#relTitulo").textContent = rel.every(x => x.marca === g.marca) ? `Más de ${marca}` : "También te puede gustar";
        $("#relCarousel").innerHTML = rel.slice(0, 10).map(card).join("");
        $("#relacionados").hidden = false;
      }
    }
  }

  renderIconos();
  if (isShop) render();
  updateCart();
})();
