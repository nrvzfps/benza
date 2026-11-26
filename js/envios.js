// Cálculo de envíos de Benza (aproximado, por zonas). Lo usan:
//  - el servidor (server/server.js) cuando no hay credenciales de Correo Argentino o la API falla,
//  - la página, directamente, cuando el sitio está en un hosting sin servidor (p. ej. GitHub Pages).
// La configuración (zonas, precios, envío gratis) está en js/envios.json.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BenzaEnvios = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // CPA (formato nuevo): letra de provincia + 4 dígitos + 3 letras, ej. B1406ABC. La letra es exacta.
  const LETRA_PROVINCIA = {
    A: "Salta", B: "Buenos Aires", C: "CABA", D: "San Luis", E: "Entre Ríos", F: "La Rioja", G: "Santiago del Estero",
    H: "Chaco", J: "San Juan", K: "Catamarca", L: "La Pampa", M: "Mendoza", N: "Misiones", P: "Formosa", Q: "Neuquén",
    R: "Río Negro", S: "Santa Fe", T: "Tucumán", U: "Chubut", V: "Tierra del Fuego", W: "Corrientes", X: "Córdoba",
    Y: "Jujuy", Z: "Santa Cruz",
  };
  // CP de 4 dígitos: rangos aproximados (en los límites entre provincias puede fallar; se corrige en la config).
  const RANGOS_PROVINCIA = [
    [1000, 1499, "CABA"], [1500, 1999, "Buenos Aires"],
    [2000, 2399, "Santa Fe"], [2400, 2599, "Córdoba"], [2600, 2699, "Santa Fe"], [2700, 2999, "Buenos Aires"],
    [3000, 3099, "Santa Fe"], [3100, 3299, "Entre Ríos"], [3300, 3399, "Misiones"], [3400, 3499, "Corrientes"],
    [3500, 3599, "Chaco"], [3600, 3699, "Formosa"], [3700, 3799, "Chaco"],
    [4000, 4199, "Tucumán"], [4200, 4399, "Santiago del Estero"], [4400, 4599, "Salta"], [4600, 4699, "Jujuy"], [4700, 4799, "Catamarca"],
    [5000, 5299, "Córdoba"], [5300, 5399, "La Rioja"], [5400, 5499, "San Juan"], [5500, 5699, "Mendoza"], [5700, 5799, "San Luis"], [5800, 5999, "Córdoba"],
    [6000, 6299, "Buenos Aires"], [6300, 6399, "La Pampa"], [6400, 7999, "Buenos Aires"],
    [8000, 8199, "Buenos Aires"], [8200, 8299, "La Pampa"], [8300, 8399, "Neuquén"], [8400, 8599, "Río Negro"],
    [9000, 9299, "Chubut"], [9300, 9409, "Santa Cruz"], [9410, 9420, "Tierra del Fuego"],
  ];

  function parseCP(raw) {
    const s = String(raw || "").toUpperCase().replace(/\s+/g, "");
    let m = s.match(/^([A-HJ-NP-Z])(\d{4})[A-Z]{0,3}$/);
    if (m) return { cp: m[2], provincia: LETRA_PROVINCIA[m[1]], exacto: true };
    if (/^\d{4}$/.test(s)) return { cp: s, provincia: null, exacto: false };
    return null;
  }

  function provinciaDe(cp, cfg) {
    const corr = cfg.correccionesProvincia || {};
    if (corr[cp]) return corr[cp];
    const n = +cp;
    const r = RANGOS_PROVINCIA.find(([a, b]) => n >= a && n <= b);
    return r ? r[2] : null;
  }

  const enRangos = (cp, rangos = []) => rangos.some(([a, b]) => +cp >= +a && +cp <= +b);

  function esGratis(cp, subtotal, cfg) {
    const g = cfg.gratis || {};
    if ((g.cps || []).includes(cp) || enRangos(cp, g.rangos)) return "zona";
    if (g.montoMinimo > 0 && subtotal >= g.montoMinimo) return "monto";
    return null;
  }

  function zonaDe(cp, provincia, cfg) {
    return cfg.zonas.find(z => enRangos(cp, z.rangos)) || cfg.zonas.find(z => (z.provincias || []).includes(provincia)) || null;
  }

  function paqueteDe(unidades, cfg) {
    const p = cfg.paquete;
    return {
      weight: p.pesoBaseGr + p.pesoPorUnidadGr * unidades,
      height: p.altoCm,
      width: p.anchoCm,
      length: p.largoBaseCm + p.largoPorUnidadCm * Math.max(0, unidades - 1),
    };
  }

  function opcionesTabla(zona, unidades) {
    const extra = (zona.extraPorUnidad || 0) * Math.max(0, unidades - 1);
    return [
      { tipo: "domicilio", nombre: "A domicilio", precio: zona.precio.domicilio + extra, dias: zona.dias },
      { tipo: "sucursal", nombre: "Retiro en sucursal de Correo", precio: zona.precio.sucursal + extra, dias: zona.dias },
    ];
  }

  // Analiza el pedido: valida el CP, ve si es gratis y busca la zona. No calcula precios de Correo.
  function analizar(cfg, { cp: rawCP, unidades, subtotal }) {
    const parsed = parseCP(rawCP);
    if (!parsed) return { ok: false, error: "Código postal inválido. Usá 4 dígitos (ej. 1406) o el formato nuevo (ej. B1406ABC)." };
    const cp = parsed.cp;
    const provincia = parsed.provincia || provinciaDe(cp, cfg);
    unidades = Math.max(1, Math.min(20, parseInt(unidades, 10) || 1));
    subtotal = Math.max(0, +subtotal || 0);
    const base = { ok: true, cp, provincia, provinciaExacta: parsed.exacto, unidades };
    const gratis = esGratis(cp, subtotal, cfg);
    if (gratis) {
      const motivo = gratis === "monto" ? `por compras desde $${cfg.gratis.montoMinimo.toLocaleString("es-AR")}` : "en tu zona";
      return { ...base, gratis: true, motivo, fuente: "regla", opciones: [{ tipo: "gratis", nombre: `${cfg.gratis.texto || "Envío gratis"} ${motivo}`, precio: 0, dias: "" }] };
    }
    const zona = zonaDe(cp, provincia, cfg);
    return { ...base, gratis: false, zonaObj: zona, zona: zona && zona.nombre };
  }

  // Cotización completa sólo con la tabla de zonas.
  function cotizarTabla(cfg, pedido) {
    const a = analizar(cfg, pedido);
    if (!a.ok || a.gratis) return a;
    const { zonaObj, ...r } = a;
    if (!zonaObj) return { ...r, ok: false, error: "No encontramos la zona de ese código postal. Escribinos y te pasamos el costo." };
    return { ...r, fuente: "tabla", opciones: opcionesTabla(zonaObj, a.unidades) };
  }

  return { parseCP, provinciaDe, analizar, cotizarTabla, opcionesTabla, paqueteDe };
});
