(() => {
  "use strict";

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const fmt = n => "$" + Math.round(n).toLocaleString("es-AR");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const titulo = s => s.split(" ").map(w => (w === "&" ? w : w[0] + w.slice(1).toLowerCase())).join(" ");

  let productos = [];
  const seleccion = new Set();

  // ---------- API ----------
  async function api(ruta, opts = {}) {
    const r = await fetch(`/panel/api/${ruta}`, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json", "X-Benza": "1" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && ruta !== "login") { mostrarLogin(); throw new Error(data.error || "Sesión vencida."); }
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    return data;
  }

  // ---------- Ingreso ----------
  function mostrarLogin() { $("#app").hidden = true; $("#login").hidden = false; $("#password").focus(); }
  async function mostrarApp() { $("#login").hidden = true; $("#app").hidden = false; await cargar(); }

  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("#loginError").textContent = "";
    try {
      await api("login", { method: "POST", body: { password: $("#password").value } });
      $("#password").value = "";
      mostrarApp();
    } catch (err) { $("#loginError").textContent = err.message; }
  });
  $("#btnSalir").addEventListener("click", async () => { await api("logout", { method: "POST" }).catch(() => {}); mostrarLogin(); });

  // ---------- Listado ----------
  async function cargar() {
    productos = await api("productos");
    for (const id of [...seleccion]) if (!productos.some(p => p.id === id)) seleccion.delete(id);
    const marcas = [...new Set(productos.map(p => p.marca))].sort();
    const fm = $("#fMarca").value;
    $("#fMarca").innerHTML = `<option value="">Todas las marcas</option>` + marcas.map(m => `<option value="${esc(m)}">${esc(titulo(m))}</option>`).join("");
    $("#fMarca").value = marcas.includes(fm) ? fm : "";
    const am = $("#aMarca").value;
    $("#aMarca").innerHTML = marcas.map(m => `<option value="${esc(m)}">${esc(titulo(m))}</option>`).join("");
    if (marcas.includes(am)) $("#aMarca").value = am;
    $("#marcas").innerHTML = marcas.map(m => `<option value="${esc(m)}">`).join("");
    render();
  }

  function visibles() {
    const q = $("#buscar").value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const m = $("#fMarca").value, g = $("#fGenero").value, o = $("#orden").value, l = $("#fLinea").value;
    const lista = productos.filter(p =>
      (!m || p.marca === m) && (!g || (g === "-" ? !p.genero : p.genero === g)) && (!l || (p.linea || "disenador") === l) &&
      (!q || `${p.marca} ${p.nombre}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)));
    if (o === "precio-asc") lista.sort((a, b) => a.precio - b.precio);
    else if (o === "precio-desc") lista.sort((a, b) => b.precio - a.precio);
    else if (o === "nuevos") lista.sort((a, b) => b.id - a.id);
    else lista.sort((a, b) => a.marca.localeCompare(b.marca) || a.nombre.localeCompare(b.nombre) || (a.ml || 0) - (b.ml || 0));
    return lista;
  }

  function render() {
    const lista = visibles();
    const marcas = new Set(productos.map(p => p.marca)).size;
    $("#resumen").textContent = `${productos.length} perfumes · ${marcas} marcas` + (lista.length !== productos.length ? ` · mostrando ${lista.length}` : "");
    $("#filas").innerHTML = lista.length ? lista.map(p => `
      <tr data-id="${p.id}" class="${seleccion.has(p.id) ? "sel" : ""}">
        <td class="c-check"><input type="checkbox" class="chk" ${seleccion.has(p.id) ? "checked" : ""} aria-label="Seleccionar ${esc(p.nombre)}"></td>
        <td class="c-foto">${p.foto ? `<img src="/${esc(p.foto)}" alt="" loading="lazy" width="44" height="44">` : `<span class="nofoto">—</span>`}</td>
        <td><span class="marca">${esc(titulo(p.marca))}</span><b class="nombre">${esc(p.nombre)}</b></td>
        <td class="c-gen">${p.genero ? `<span class="tag ${p.genero}">${p.genero}</span>` : `<span class="tag-na">Sin especificar</span>`}${p.linea === "arabe" ? `<span class="tag-linea">Árabe</span>` : ""}</td>
        <td class="c-ml">${p.ml ? p.ml + " ml" : "—"}</td>
        <td class="c-precio"><span class="peso">$</span><input class="precio${p.precio ? "" : " vacio"}" type="text" inputmode="numeric" placeholder="Sin stock" value="${p.precio ? p.precio.toLocaleString("es-AR") : ""}" aria-label="Precio de ${esc(p.nombre)} (vacío = sin stock)"></td>
        <td class="c-acc">
          <button class="icon" data-acc="editar" title="Editar" aria-label="Editar ${esc(p.nombre)}">✎</button>
          <button class="icon danger" data-acc="eliminar" title="Eliminar" aria-label="Eliminar ${esc(p.nombre)}">🗑</button>
        </td>
      </tr>`).join("") : `<tr><td colspan="7" class="vacio">No hay perfumes que coincidan.</td></tr>`;
    $("#checkTodos").checked = lista.length > 0 && lista.every(p => seleccion.has(p.id));
    renderSeleccion();
  }

  function renderSeleccion() {
    const n = seleccion.size;
    $("#selbar").hidden = !n;
    $("#selCount").textContent = `${n} seleccionado${n === 1 ? "" : "s"}`;
  }

  ["#buscar", "#fMarca", "#fGenero", "#fLinea", "#orden"].forEach(s => $(s).addEventListener("input", render));

  $("#checkTodos").addEventListener("change", e => {
    for (const p of visibles()) e.target.checked ? seleccion.add(p.id) : seleccion.delete(p.id);
    render();
  });
  $("#selLimpiar").addEventListener("click", () => { seleccion.clear(); render(); });

  $("#filas").addEventListener("change", async e => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const id = +tr.dataset.id;
    if (e.target.classList.contains("chk")) {
      e.target.checked ? seleccion.add(id) : seleccion.delete(id);
      tr.classList.toggle("sel", e.target.checked);
      $("#checkTodos").checked = visibles().every(p => seleccion.has(p.id));
      return renderSeleccion();
    }
    if (e.target.classList.contains("precio")) {
      const p = productos.find(x => x.id === id);
      const mostrar = n => (e.target.value = n ? n.toLocaleString("es-AR") : "");
      const nuevo = +e.target.value.replace(/[^\d]/g, "") || null;   // acepta "200.000", "$200000"; vacío = sin stock
      mostrar(nuevo);
      if (nuevo === (p.precio || null)) return;
      try {
        await api(`productos/${id}`, { method: "PUT", body: { precio: nuevo } });
        e.target.classList.add("ok"); setTimeout(() => e.target.classList.remove("ok"), 1200);
        const txt = v => (v ? fmt(v) : "sin stock");
        toast(`${p.nombre}: ${txt(p.precio)} → ${txt(nuevo)}`, true);
        p.precio = nuevo;
        e.target.classList.toggle("vacio", !nuevo);
      } catch (err) { mostrar(p.precio); toast(err.message); }
    }
  });
  $("#filas").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.classList.contains("precio")) e.target.blur(); });

  $("#filas").addEventListener("click", async e => {
    const b = e.target.closest("button[data-acc]");
    if (!b) return;
    const p = productos.find(x => x.id === +b.closest("tr").dataset.id);
    if (b.dataset.acc === "editar") return abrirProducto(p);
    if (b.dataset.acc === "eliminar") {
      if (!confirm(`¿Eliminar "${titulo(p.marca)} ${p.nombre}${p.ml ? " " + p.ml + " ml" : ""}"?\nDespués lo podés recuperar con "Deshacer".`)) return;
      try { await api(`productos/${p.id}`, { method: "DELETE" }); seleccion.delete(p.id); await cargar(); toast(`Eliminado: ${p.nombre}`, true); }
      catch (err) { toast(err.message); }
    }
  });

  $("#selEliminar").addEventListener("click", async () => {
    const n = seleccion.size;
    if (!confirm(`¿Eliminar ${n} perfume${n === 1 ? "" : "s"}?\nDespués lo podés recuperar con "Deshacer".`)) return;
    try { await api("eliminar", { method: "POST", body: { ids: [...seleccion] } }); seleccion.clear(); await cargar(); toast(`Eliminados ${n} perfumes`, true); }
    catch (err) { toast(err.message); }
  });

  // ---------- Alta / edición ----------
  const dlgP = $("#dlgProducto");
  let editando = null;   // producto en edición o null
  // Fotos del perfume en edición: [{ valor: "assets/..." (existente) o "data:..." (nueva) }]. La primera es la principal.
  let fotos = [], fotosCambiadas = false;
  const MAX_FOTOS = 8;

  // Al editar se abre el perfume completo: todos sus tamaños (misma marca, nombre y género).
  const grupoDe = p => productos.filter(x => x.marca === p.marca && x.nombre === p.nombre && x.genero === p.genero)
    .sort((a, b) => (a.ml || 0) - (b.ml || 0));

  function filaTamano(t = {}) {
    const div = document.createElement("div");
    div.className = "tam-row";
    if (t.id != null) div.dataset.id = t.id;
    div.innerHTML = `
      <input class="t-ml" type="number" min="1" max="4999" step="1" placeholder="100" value="${t.ml ?? ""}" aria-label="Tamaño en ml">
      <input class="t-precio" type="text" inputmode="numeric" placeholder="Sin stock" value="${t.precio ? t.precio.toLocaleString("es-AR") : ""}" aria-label="Precio (vacío = sin stock)">
      <button type="button" class="icon t-quitar" title="Quitar tamaño" aria-label="Quitar tamaño">✕</button>`;
    $("#tamLista").appendChild(div);
    actualizarQuitar();
    return div;
  }
  const actualizarQuitar = () => {
    const filas = $$("#tamLista .tam-row");
    filas.forEach(f => (f.querySelector(".t-quitar").disabled = filas.length === 1));
  };
  $("#tamAgregar").addEventListener("click", () => filaTamano().querySelector(".t-ml").focus());
  $("#tamLista").addEventListener("click", e => {
    const b = e.target.closest(".t-quitar");
    if (!b || b.disabled) return;
    b.closest(".tam-row").remove();
    actualizarQuitar();
  });
  $("#tamLista").addEventListener("change", e => {
    if (!e.target.classList.contains("t-precio")) return;
    const n = +e.target.value.replace(/[^\d]/g, "");
    if (n) e.target.value = n.toLocaleString("es-AR");
  });

  function abrirProducto(p) {
    const grupo = p ? grupoDe(p) : [];
    editando = p ? grupo : null;
    $("#dlgProductoTitulo").textContent = p ? "Editar perfume" : "Nuevo perfume";
    $("#pMarca").value = p ? p.marca : ($("#fMarca").value || "");
    $("#pNombre").value = p ? p.nombre : "";
    $("#pGenero").value = p ? (p.genero || "") : ($("#fGenero").value === "-" ? "" : $("#fGenero").value);
    $("#pLinea").value = p ? (p.linea || "disenador") : ($("#fLinea").value || "disenador");
    $("#tamLista").innerHTML = "";
    (grupo.length ? grupo : [{}]).forEach(t => filaTamano(t));
    $("#fotoInput").value = "";
    const conFoto = grupo.find(x => (x.fotos && x.fotos.length) || x.foto);
    fotos = (conFoto ? (conFoto.fotos && conFoto.fotos.length ? conFoto.fotos : [conFoto.foto]) : []).map(valor => ({ valor }));
    fotosCambiadas = false;
    pintarFotos();
    $("#productoError").textContent = "";
    dlgP.showModal();
    if (p) { const fila = $(`#tamLista .tam-row[data-id="${p.id}"] .t-precio`); (fila || $("#pMarca")).focus(); }
    else $("#pMarca").focus();
  }
  $("#btnNuevo").addEventListener("click", () => abrirProducto(null));

  function pintarFotos() {
    const src = v => (v.startsWith("data:") ? v : "/" + v);
    $("#fotosGrid").innerHTML = fotos.length ? fotos.map((f, i) => `
      <figure class="foto-item${i === 0 ? " principal" : ""}" data-i="${i}">
        <img src="${esc(src(f.valor))}" alt="Foto ${i + 1}">
        ${i === 0 ? `<span class="foto-badge">★ Principal</span>` : `<button type="button" class="foto-btn" data-acc="principal" title="Usar como principal" aria-label="Usar como foto principal">★</button>`}
        <div class="foto-acc">
          <button type="button" class="foto-btn" data-acc="izq" title="Mover a la izquierda" aria-label="Mover a la izquierda" ${i === 0 ? "disabled" : ""}>←</button>
          <button type="button" class="foto-btn" data-acc="der" title="Mover a la derecha" aria-label="Mover a la derecha" ${i === fotos.length - 1 ? "disabled" : ""}>→</button>
          <button type="button" class="foto-btn danger" data-acc="quitar" title="Quitar foto" aria-label="Quitar foto">✕</button>
        </div>
      </figure>`).join("") : `<div class="foto-vacia">Sin fotos</div>`;
    $("#fotoInput").closest("label").classList.toggle("disabled", fotos.length >= MAX_FOTOS);
  }

  $("#fotosGrid").addEventListener("click", e => {
    const b = e.target.closest(".foto-btn");
    if (!b || b.disabled) return;
    const i = +b.closest(".foto-item").dataset.i;
    const mover = (a, c) => { [fotos[a], fotos[c]] = [fotos[c], fotos[a]]; };
    if (b.dataset.acc === "principal") fotos.unshift(fotos.splice(i, 1)[0]);
    if (b.dataset.acc === "izq" && i > 0) mover(i, i - 1);
    if (b.dataset.acc === "der" && i < fotos.length - 1) mover(i, i + 1);
    if (b.dataset.acc === "quitar") fotos.splice(i, 1);
    fotosCambiadas = true;
    pintarFotos();
  });

  // Achica la foto a 600×600 (fondo blanco, JPEG) antes de subirla.
  function prepararFoto(file) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const S = 600, c = document.createElement("canvas");
        c.width = c.height = S;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, S, S);
        const k = Math.min(S / img.width, S / img.height, 1) * 0.94;
        const w = img.width * k, h = img.height * k;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        URL.revokeObjectURL(url);
        ok(c.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo leer la imagen.")); };
      img.src = url;
    });
  }

  $("#fotoInput").addEventListener("change", async e => {
    const files = [...e.target.files];
    e.target.value = "";
    $("#productoError").textContent = "";
    for (const f of files) {
      if (fotos.length >= MAX_FOTOS) { $("#productoError").textContent = `Máximo ${MAX_FOTOS} fotos por perfume.`; break; }
      try { fotos.push({ valor: await prepararFoto(f) }); fotosCambiadas = true; }
      catch (err) { $("#productoError").textContent = `${f.name}: ${err.message}`; }
    }
    pintarFotos();
  });

  $("#formProducto").addEventListener("submit", async e => {
    if (e.submitter && e.submitter.value === "cancel") return;
    e.preventDefault();
    const tamanos = $$("#tamLista .tam-row").map(f => ({
      id: f.dataset.id ?? null,
      ml: f.querySelector(".t-ml").value,
      precio: +f.querySelector(".t-precio").value.replace(/[^\d]/g, "") || null,
    }));
    const body = {
      ids: editando ? editando.map(p => p.id) : [],
      marca: $("#pMarca").value, nombre: $("#pNombre").value, genero: $("#pGenero").value || null, linea: $("#pLinea").value, tamanos,
    };
    if (fotosCambiadas || !editando) body.fotos = fotos.map(f => f.valor);
    const quitados = editando ? editando.filter(p => !tamanos.some(t => t.id == p.id)) : [];
    if (quitados.length && !confirm(`Vas a quitar ${quitados.map(p => (p.ml ? p.ml + " ml" : "sin tamaño")).join(", ")} de "${body.nombre}". ¿Seguir?`)) return;
    $("#btnGuardar").disabled = true;
    try {
      const r = await api("grupo", { method: "POST", body });
      dlgP.close();
      await cargar();
      const n = r.productos.length > 1 ? ` (${r.productos.length} tamaños)` : "";
      toast(`${editando ? "Guardado" : "Agregado"}: ${body.nombre}${n}`, true);
    } catch (err) { $("#productoError").textContent = err.message; }
    finally { $("#btnGuardar").disabled = false; }
  });

  // ---------- Ajuste masivo ----------
  const dlgA = $("#dlgAumento");
  let previewTimer, previewOk = false;

  function alcance() {
    const tipo = $$('input[name="alcance"]').find(r => r.checked).value;
    return tipo === "todos" ? { tipo } :
      tipo === "marca" ? { tipo, valor: $("#aMarca").value } :
      tipo === "genero" ? { tipo, valor: $("#aGenero").value } :
      { tipo, valor: [...seleccion] };
  }

  function abrirAumento(desdeSeleccion) {
    const n = seleccion.size;
    $("#radioSel").hidden = !n;
    $("#aSelTxt").textContent = `Seleccionados (${n})`;
    const tipo = desdeSeleccion && n ? "ids" : $("#fMarca").value ? "marca" : "todos";
    if ($("#fMarca").value) $("#aMarca").value = $("#fMarca").value;
    $$('input[name="alcance"]').forEach(r => (r.checked = r.value === tipo));
    $("#aumentoError").textContent = "";
    dlgA.showModal();
    vistaPrevia();
  }
  $("#btnAumento").addEventListener("click", () => abrirAumento(false));
  $("#selAumento").addEventListener("click", () => abrirAumento(true));

  $("#formAumento").addEventListener("input", () => { clearTimeout(previewTimer); previewTimer = setTimeout(vistaPrevia, 250); });
  $("#aMarca").addEventListener("focus", () => ($$('input[name="alcance"]').find(r => r.value === "marca").checked = true));
  $("#aGenero").addEventListener("focus", () => ($$('input[name="alcance"]').find(r => r.value === "genero").checked = true));

  async function vistaPrevia() {
    previewOk = false;
    $("#btnAplicar").disabled = true;
    $("#aumentoError").textContent = "";
    const pct = +$("#aPct").value;
    if (!pct) { $("#aPreview").innerHTML = `<p class="hint">Ingresá un porcentaje distinto de 0.</p>`; return; }
    try {
      const { cambios } = await api("precios", { method: "POST", body: { alcance: alcance(), porcentaje: pct, redondeo: +$("#aRedondeo").value, vistaPrevia: true } });
      const antes = cambios.reduce((s, c) => s + c.antes, 0), despues = cambios.reduce((s, c) => s + c.despues, 0);
      $("#aPreview").innerHTML = `
        <p class="prev-res"><b>${cambios.length}</b> perfume${cambios.length === 1 ? "" : "s"} · ${pct > 0 ? "suben" : "bajan"} ${Math.abs(pct)}% · suma de precios ${fmt(antes)} → <b>${fmt(despues)}</b></p>
        <div class="prev-tabla"><table>
          <thead><tr><th>Perfume</th><th>Antes</th><th>Después</th></tr></thead>
          <tbody>${cambios.slice(0, 60).map(c => `<tr><td>${esc(titulo(c.marca))} · ${esc(c.nombre)}${c.ml ? ` <small>${c.ml} ml</small>` : ""}</td><td>${fmt(c.antes)}</td><td><b>${fmt(c.despues)}</b></td></tr>`).join("")}</tbody>
        </table>${cambios.length > 60 ? `<p class="hint">…y ${cambios.length - 60} más.</p>` : ""}</div>`;
      $("#btnAplicar").textContent = `Aplicar a ${cambios.length} perfume${cambios.length === 1 ? "" : "s"}`;
      $("#btnAplicar").disabled = false;
      previewOk = true;
    } catch (err) {
      $("#aPreview").innerHTML = "";
      $("#aumentoError").textContent = err.message;
    }
  }

  $("#formAumento").addEventListener("submit", async e => {
    if (e.submitter && e.submitter.value === "cancel") return;
    e.preventDefault();
    if (!previewOk) return;
    $("#btnAplicar").disabled = true;
    try {
      const pct = +$("#aPct").value;
      const { cambios } = await api("precios", { method: "POST", body: { alcance: alcance(), porcentaje: pct, redondeo: +$("#aRedondeo").value } });
      dlgA.close();
      await cargar();
      toast(`Precios ${pct > 0 ? "+" : ""}${pct}% en ${cambios.length} perfumes`, true);
    } catch (err) { $("#aumentoError").textContent = err.message; $("#btnAplicar").disabled = false; }
  });

  // ---------- Historial / deshacer ----------
  async function deshacer() {
    try {
      const r = await api("deshacer", { method: "POST" });
      await cargar();
      toast(`Deshecho: ${r.deshecho}`);
      return true;
    } catch (err) { toast(err.message); return false; }
  }
  $("#toastDeshacer").addEventListener("click", deshacer);

  $("#btnHistorial").addEventListener("click", async () => {
    const items = await api("historial");
    $("#historial").innerHTML = items.length
      ? items.map(i => `<li><b>${esc(i.motivo)}</b><small>${new Date(i.id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/, "T$1:$2:$3.$4Z")).toLocaleString("es-AR")}</small></li>`).join("")
      : `<li class="hint">Todavía no hay cambios.</li>`;
    $("#btnDeshacerHist").disabled = !items.length;
    $("#dlgHistorial").showModal();
  });
  $("#btnDeshacerHist").addEventListener("click", async () => { if (await deshacer()) $("#dlgHistorial").close(); });

  // ---------- Aviso ----------
  let tt;
  function toast(txt, conDeshacer) {
    $("#toastTxt").textContent = txt;
    $("#toastDeshacer").hidden = !conDeshacer;
    $("#toast").classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => $("#toast").classList.remove("show"), conDeshacer ? 7000 : 3500);
  }

  // ---------- Inicio ----------
  api("me").then(mostrarApp).catch(() => mostrarLogin());
})();
