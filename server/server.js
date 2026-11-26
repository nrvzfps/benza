// Servidor del sitio de Benza: tienda + panel de administración (/panel).
// Sin dependencias: sólo Node 18+.
//
//   node server/server.js        -> http://localhost:8080   (panel en /panel)
//
// Datos: data/productos.json es la fuente. Cada cambio del panel:
//   - guarda una copia anterior en data/backups/ (para "Deshacer"),
//   - regenera js/productos.js, que es lo que lee la tienda.
// Contraseña del panel: variable ADMIN_PASSWORD en el archivo .env (raíz del proyecto).

"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data", "productos.json");
const BACKUPS = path.join(ROOT, "data", "backups");
const PUBLIC_JS = path.join(ROOT, "js", "productos.js");
const FOTOS = path.join(ROOT, "assets", "productos");

// ---------- .env ----------
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const PORT = +(process.env.PORT || 8080);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// ---------- Datos ----------
const GENEROS = ["Masculino", "Femenino", "Unisex"];
const leer = () => JSON.parse(fs.readFileSync(DATA, "utf8"));

function guardar(lista, motivo) {
  fs.mkdirSync(BACKUPS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(DATA, path.join(BACKUPS, `${stamp}.json`));
  fs.writeFileSync(path.join(BACKUPS, `${stamp}.txt`), motivo);
  // Conservar los últimos 50 backups
  const viejos = fs.readdirSync(BACKUPS).filter(f => f.endsWith(".json")).sort().slice(0, -50);
  for (const f of viejos) { fs.rmSync(path.join(BACKUPS, f)); fs.rmSync(path.join(BACKUPS, f.replace(".json", ".txt")), { force: true }); }
  escribir(lista);
}

function escribir(lista) {
  const tmp = DATA + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(lista, null, 1));
  fs.renameSync(tmp, DATA);
  fs.writeFileSync(PUBLIC_JS, "// Generado por el panel (/panel) a partir de data/productos.json. No editar a mano.\nwindow.BENZA_PRODUCTOS = " + JSON.stringify(lista, null, 1) + ";\n");
}

function validar(p, parcial) {
  const out = {};
  if (!parcial || "marca" in p) { const v = String(p.marca || "").trim().toUpperCase(); if (!v) throw new Error("Falta la marca."); out.marca = v; }
  if (!parcial || "nombre" in p) { const v = String(p.nombre || "").trim(); if (!v) throw new Error("Falta el nombre."); out.nombre = v; }
  if (!parcial || "genero" in p) { if (!GENEROS.includes(p.genero)) throw new Error("Género inválido."); out.genero = p.genero; }
  if (!parcial || "ml" in p) { const v = p.ml === "" || p.ml == null ? null : Math.round(+p.ml); if (v !== null && !(v > 0 && v < 5000)) throw new Error("Tamaño (ml) inválido."); out.ml = v; }
  if (!parcial || "precio" in p) { const v = Math.round(+p.precio); if (!(v > 0)) throw new Error("Precio inválido."); out.precio = v; }
  return out;
}

// Foto: llega como data URL (el panel ya la achica a 600px en JPEG).
function guardarFoto(id, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) throw new Error("Foto inválida (usá JPG, PNG o WEBP).");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 3 * 1024 * 1024) throw new Error("La foto es demasiado grande.");
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  fs.mkdirSync(FOTOS, { recursive: true });
  // Nombre único: así las fotos anteriores siguen existiendo (sirve para "Deshacer").
  const nombre = `${id}-${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(FOTOS, nombre), buf);
  return `assets/productos/${nombre}`;
}

// Lista ordenada de fotos del panel: cada elemento es una ruta existente (se conserva) o una data URL (se guarda).
const MAX_FOTOS = 8;
function procesarFotos(id, lista) {
  if (!Array.isArray(lista)) throw new Error("Lista de fotos inválida.");
  if (lista.length > MAX_FOTOS) throw new Error(`Máximo ${MAX_FOTOS} fotos por perfume.`);
  return lista.map(f => {
    if (typeof f !== "string") throw new Error("Foto inválida.");
    if (f.startsWith("data:")) return guardarFoto(id, f);
    const ruta = f.replace(/^\//, "");
    if (!/^assets\/productos\/[\w.-]+\.(jpg|png|webp)(\?[\w=.-]*)?$/.test(ruta) || ruta.includes("..")) throw new Error("Ruta de foto inválida.");
    return ruta;
  });
}
const conFotos = (p, fotos) => ({ ...p, fotos, foto: fotos[0] || null });

function redondear(n, paso) {
  return paso > 0 ? Math.round(n / paso) * paso : Math.round(n);
}

// ---------- Sesiones ----------
const sesiones = new Map(); // token -> vence
const intentos = new Map(); // ip -> {n, hasta}
const HORAS = 12;

function sesionValida(req) {
  const m = /(?:^|;\s*)benza_panel=([a-f0-9]{64})/.exec(req.headers.cookie || "");
  const exp = m && sesiones.get(m[1]);
  if (!exp || exp < Date.now()) return false;
  return true;
}

function iguales(a, b) {
  const x = crypto.createHash("sha256").update(a).digest(), y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

// ---------- Utilidades HTTP ----------
function json(res, code, data, extraHeaders = {}) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders });
  res.end(JSON.stringify(data));
}

function cuerpo(req, max = 6 * 1024 * 1024) {
  return new Promise((ok, mal) => {
    let size = 0; const parts = [];
    req.on("data", c => { size += c.length; if (size > max) { mal(new Error("Solicitud demasiado grande.")); req.destroy(); } else parts.push(c); });
    req.on("end", () => { try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString("utf8")) : {}); } catch { mal(new Error("JSON inválido.")); } });
    req.on("error", mal);
  });
}

// ---------- API del panel ----------
async function api(req, res, ruta) {
  const ip = req.socket.remoteAddress;

  if (ruta === "login" && req.method === "POST") {
    if (!ADMIN_PASSWORD) return json(res, 503, { error: "Falta configurar ADMIN_PASSWORD en el archivo .env del servidor." });
    const lim = intentos.get(ip);
    if (lim && lim.n >= 5 && lim.hasta > Date.now()) return json(res, 429, { error: "Demasiados intentos. Probá de nuevo en unos minutos." });
    const { password } = await cuerpo(req, 10_000);
    if (!password || !iguales(String(password), ADMIN_PASSWORD)) {
      const n = (lim && lim.hasta > Date.now() ? lim.n : 0) + 1;
      intentos.set(ip, { n, hasta: Date.now() + 10 * 60_000 });
      return json(res, 401, { error: "Contraseña incorrecta." });
    }
    intentos.delete(ip);
    const token = crypto.randomBytes(32).toString("hex");
    sesiones.set(token, Date.now() + HORAS * 3600_000);
    const seguro = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    return json(res, 200, { ok: true }, { "Set-Cookie": `benza_panel=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${HORAS * 3600}${seguro}` });
  }

  if (ruta === "logout" && req.method === "POST") {
    const m = /(?:^|;\s*)benza_panel=([a-f0-9]{64})/.exec(req.headers.cookie || "");
    if (m) sesiones.delete(m[1]);
    return json(res, 200, { ok: true }, { "Set-Cookie": "benza_panel=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  }

  if (!sesionValida(req)) return json(res, 401, { error: "Sesión vencida. Ingresá de nuevo." });
  // Protección extra contra envíos desde otros sitios
  if (req.method !== "GET" && req.headers["x-benza"] !== "1") return json(res, 403, { error: "Solicitud no permitida." });

  if (ruta === "me") return json(res, 200, { ok: true });

  if (ruta === "productos" && req.method === "GET") return json(res, 200, leer());

  if (ruta === "productos" && req.method === "POST") {
    const b = await cuerpo(req);
    const lista = leer();
    const datos = validar(b, false);
    const id = lista.reduce((m, p) => Math.max(m, p.id), -1) + 1;
    const nuevo = conFotos({ id, ...datos }, Array.isArray(b.fotos) ? procesarFotos(id, b.fotos) : b.foto ? [guardarFoto(id, b.foto)] : []);
    lista.push(nuevo);
    guardar(lista, `Alta: ${nuevo.marca} ${nuevo.nombre}`);
    return json(res, 201, nuevo);
  }

  // Perfume con uno o varios tamaños (alta o edición en un solo paso).
  // {ids: [ids actuales del grupo, vacío si es nuevo], marca, nombre, genero, foto?, tamanos: [{id?, ml, precio}]}
  if (ruta === "grupo" && req.method === "POST") {
    const b = await cuerpo(req);
    const base = validar({ marca: b.marca, nombre: b.nombre, genero: b.genero }, true);
    if (!base.marca || !base.nombre || !base.genero) throw new Error("Completá marca, nombre y género.");
    const tamanos = (b.tamanos || []).map(t => ({ id: t.id == null || t.id === "" ? null : +t.id, ...validar({ ml: t.ml, precio: t.precio }, true) }));
    if (!tamanos.length) throw new Error("Agregá al menos un tamaño.");
    const mls = tamanos.map(t => t.ml ?? "sin");
    if (new Set(mls).size !== mls.length) throw new Error("Hay dos tamaños con los mismos ml.");

    const lista = leer();
    const originales = new Set((b.ids || []).map(Number));
    for (const id of originales) if (!lista.some(p => p.id === id)) throw new Error("Uno de los tamaños ya no existe. Recargá el panel.");
    for (const t of tamanos) if (t.id != null && !originales.has(t.id)) throw new Error("Tamaño inválido.");
    // Que no choque con otro perfume ya cargado con la misma marca, nombre y género
    const choca = lista.some(p => !originales.has(p.id) && p.marca === base.marca && p.nombre.toLowerCase() === base.nombre.toLowerCase() && p.genero === base.genero);
    if (choca) throw new Error("Ya existe un perfume con esa marca, nombre y género. Editalo desde la lista para sumarle tamaños.");

    let sigId = lista.reduce((m, p) => Math.max(m, p.id), -1) + 1;
    const conFoto = lista.find(p => originales.has(p.id) && (p.fotos?.length || p.foto));
    const fotosActuales = conFoto ? (conFoto.fotos?.length ? conFoto.fotos : [conFoto.foto]) : [];
    let quedan = tamanos.map(t => {
      const prev = t.id != null ? lista.find(p => p.id === t.id) : null;
      const fotos = prev ? (prev.fotos?.length ? prev.fotos : prev.foto ? [prev.foto] : []) : fotosActuales;
      return conFotos({ id: prev ? prev.id : sigId++, ...base, ml: t.ml ?? null, precio: t.precio }, fotos);
    });
    // Las fotos se comparten entre todos los tamaños del perfume
    if ("fotos" in b) {
      const fotos = procesarFotos(quedan[0].id, b.fotos);
      quedan = quedan.map(p => conFotos(p, fotos));
    } else if ("foto" in b) {
      const fotos = b.foto ? [guardarFoto(quedan[0].id, b.foto)] : [];
      quedan = quedan.map(p => conFotos(p, fotos));
    }
    const ids = new Set(quedan.map(p => p.id));
    const nueva = lista.filter(p => !originales.has(p.id) || ids.has(p.id)).map(p => quedan.find(q => q.id === p.id) || p);
    for (const p of quedan) if (!lista.some(x => x.id === p.id)) nueva.push(p);
    const n = quedan.length === 1 ? "" : ` (${quedan.length} tamaños)`;
    guardar(nueva, `${originales.size ? "Edición" : "Alta"}: ${base.marca} ${base.nombre}${n}`);
    return json(res, 200, { ok: true, productos: quedan });
  }

  let m = /^productos\/(\d+)$/.exec(ruta);
  if (m && req.method === "PUT") {
    const b = await cuerpo(req);
    const lista = leer();
    const i = lista.findIndex(p => p.id === +m[1]);
    if (i < 0) return json(res, 404, { error: "No existe ese producto." });
    const cambios = validar(b, true);
    lista[i] = { ...lista[i], ...cambios };
    if (Array.isArray(b.fotos)) lista[i] = conFotos(lista[i], procesarFotos(lista[i].id, b.fotos));
    else if ("foto" in b) lista[i] = conFotos(lista[i], b.foto ? [guardarFoto(lista[i].id, b.foto)] : []);
    guardar(lista, `Edición: ${lista[i].marca} ${lista[i].nombre}`);
    return json(res, 200, lista[i]);
  }
  if (m && req.method === "DELETE") {
    const lista = leer();
    const p = lista.find(x => x.id === +m[1]);
    if (!p) return json(res, 404, { error: "No existe ese producto." });
    guardar(lista.filter(x => x !== p), `Baja: ${p.marca} ${p.nombre}`);
    return json(res, 200, { ok: true });
  }

  if (ruta === "eliminar" && req.method === "POST") {
    const { ids } = await cuerpo(req, 100_000);
    const set = new Set((ids || []).map(Number));
    const lista = leer();
    const quedan = lista.filter(p => !set.has(p.id));
    if (quedan.length === lista.length) return json(res, 400, { error: "No se eligió ningún producto." });
    guardar(quedan, `Baja de ${lista.length - quedan.length} productos`);
    return json(res, 200, { ok: true, eliminados: lista.length - quedan.length });
  }

  // Ajuste masivo de precios: {alcance:{tipo:"todos"|"marca"|"genero"|"ids", valor}, porcentaje, redondeo, vistaPrevia}
  if (ruta === "precios" && req.method === "POST") {
    const b = await cuerpo(req, 100_000);
    const pct = +b.porcentaje;
    if (!isFinite(pct) || pct === 0 || pct < -90 || pct > 500) return json(res, 400, { error: "Porcentaje inválido (entre -90 y 500, distinto de 0)." });
    const paso = [0, 100, 500, 1000, 5000].includes(+b.redondeo) ? +b.redondeo : 0;
    const a = b.alcance || {};
    const lista = leer();
    const dentro = p =>
      a.tipo === "todos" ? true :
      a.tipo === "marca" ? (Array.isArray(a.valor) ? a.valor : [a.valor]).includes(p.marca) :
      a.tipo === "genero" ? p.genero === a.valor :
      a.tipo === "ids" ? (a.valor || []).map(Number).includes(p.id) : false;
    const afectados = lista.filter(dentro);
    if (!afectados.length) return json(res, 400, { error: "Ningún producto coincide con esa selección." });
    const cambios = afectados.map(p => ({ id: p.id, marca: p.marca, nombre: p.nombre, ml: p.ml, antes: p.precio, despues: Math.max(1, redondear(p.precio * (1 + pct / 100), paso)) }));
    if (b.vistaPrevia) return json(res, 200, { cambios });
    const porId = new Map(cambios.map(c => [c.id, c.despues]));
    const nueva = lista.map(p => (porId.has(p.id) ? { ...p, precio: porId.get(p.id) } : p));
    const desc = a.tipo === "todos" ? "todos" : a.tipo === "ids" ? `${afectados.length} productos` : `${a.tipo} ${[].concat(a.valor).join(", ")}`;
    guardar(nueva, `Precios ${pct > 0 ? "+" : ""}${pct}% (${desc})`);
    return json(res, 200, { ok: true, cambios });
  }

  if (ruta === "historial" && req.method === "GET") {
    if (!fs.existsSync(BACKUPS)) return json(res, 200, []);
    const items = fs.readdirSync(BACKUPS).filter(f => f.endsWith(".txt")).sort().reverse().slice(0, 15)
      .map(f => ({ id: f.replace(".txt", ""), motivo: fs.readFileSync(path.join(BACKUPS, f), "utf8") }));
    return json(res, 200, items);
  }

  if (ruta === "deshacer" && req.method === "POST") {
    if (!fs.existsSync(BACKUPS)) return json(res, 400, { error: "No hay cambios para deshacer." });
    const ultimo = fs.readdirSync(BACKUPS).filter(f => f.endsWith(".json")).sort().pop();
    if (!ultimo) return json(res, 400, { error: "No hay cambios para deshacer." });
    const motivo = fs.readFileSync(path.join(BACKUPS, ultimo.replace(".json", ".txt")), "utf8");
    escribir(JSON.parse(fs.readFileSync(path.join(BACKUPS, ultimo), "utf8")));
    fs.rmSync(path.join(BACKUPS, ultimo));
    fs.rmSync(path.join(BACKUPS, ultimo.replace(".json", ".txt")), { force: true });
    return json(res, 200, { ok: true, deshecho: motivo });
  }

  return json(res, 404, { error: "Ruta inexistente." });
}

// ---------- Archivos estáticos ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
// Sólo se sirven estas carpetas/archivos: nunca data/, server/, .env, .git, etc.
const PERMITIDOS = [/^\/(index|catalogo|producto)\.html$/, /^\/(css|js|assets)\//, /^\/panel\/(index\.html|panel\.(js|css))$/];

function estatico(req, res, p) {
  if (p === "/") p = "/index.html";
  if (p === "/panel" || p === "/panel/") p = "/panel/index.html";
  if (!PERMITIDOS.some(r => r.test(p)) || p.includes("..")) { res.writeHead(404); return res.end("No encontrado"); }
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("No encontrado"); }
    const headers = { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" };
    if (p.startsWith("/panel/") || p === "/js/productos.js") headers["Cache-Control"] = "no-store";
    res.writeHead(200, headers);
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);
  try {
    if (p.startsWith("/panel/api/")) return await api(req, res, p.slice("/panel/api/".length));
    estatico(req, res, p);
  } catch (e) {
    json(res, 400, { error: e.message || "Error." });
  }
}).listen(PORT, () => {
  console.log(`Benza en http://localhost:${PORT}  ·  panel en http://localhost:${PORT}/panel`);
  if (!ADMIN_PASSWORD) console.log("ATENCIÓN: falta ADMIN_PASSWORD en .env; el panel no va a dejar ingresar.");
});
