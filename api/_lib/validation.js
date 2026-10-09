'use strict';

var MAX_IMAGE = 1572864;

function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }

function text(value, label, max, required) {
  if (typeof value !== 'string') invalid(label + ' debe ser texto.');
  if (required && !value.trim()) invalid(label + ' es obligatorio.');
  if (value.length > max) invalid(label + ' supera el máximo de ' + max + ' caracteres.');
  return value;
}

function array(value, label, max) {
  if (!Array.isArray(value)) invalid(label + ' debe ser una lista.');
  if (value.length > max) invalid(label + ' tiene demasiados elementos.');
  return value;
}

function textArray(value, label, count, length) {
  return array(value, label, count).map(function (item, index) { return text(item, label + ' ' + (index + 1), length, true); });
}

function validateCollection(input, options) {
  var ids = new Set();
  var label = options.label;
  var routePattern = new RegExp('^/assets/' + options.imageDirectory + '/[a-z0-9-]+\\.(webp|png|jpe?g)$');
  return array(input, label, 100).map(function (study, index) {
    if (!study || typeof study !== 'object' || Array.isArray(study)) invalid('El estudio ' + (index + 1) + ' no es válido.');
    var id = text(study.id, 'ID', 80, true);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) invalid('El ID ' + id + ' no es válido.');
    if (ids.has(id)) invalid('El ID ' + id + ' está repetido.');
    ids.add(id);
    if (options.hasCategory) {
      if (!Number.isInteger(study.categoria) || study.categoria < 0 || study.categoria > 3) invalid('La categoría de ' + id + ' no es válida.');
    } else if (Object.prototype.hasOwnProperty.call(study, 'categoria')) {
      invalid('El estudio de Colombia ' + id + ' no debe incluir categoría.');
    }
    var image = null;
    if (study.imagen !== null) {
      if (!study.imagen || typeof study.imagen !== 'object' || Array.isArray(study.imagen)) invalid('La imagen de ' + id + ' no es válida.');
      var route = text(study.imagen.ruta, 'Ruta de imagen', 240, true);
      if (!routePattern.test(route)) invalid('La ruta de imagen de ' + id + ' no es válida.');
      if (study.imagen.ajuste !== 'fit' && study.imagen.ajuste !== 'cover') invalid('El ajuste de imagen de ' + id + ' no es válido.');
      image = { ruta: route, alt: text(study.imagen.alt, 'Texto alternativo', 250, true), ajuste: study.imagen.ajuste };
    }
    var sections = array(study.secciones, 'secciones', 30).map(function (section, sectionIndex) {
      if (!section || typeof section !== 'object') invalid('La sección ' + (sectionIndex + 1) + ' de ' + id + ' no es válida.');
      if (section.tipoLista !== 'ticks' && section.tipoLista !== 'steps') invalid('El tipo de lista de ' + id + ' no es válido.');
      return {
        titulo: text(section.titulo, 'Título de sección', 120, false),
        parrafo: text(section.parrafo, 'Párrafo de sección', 3000, false),
        lista: textArray(section.lista, 'Elemento de lista', 30, 1000),
        tipoLista: section.tipoLista
      };
    });
    var timeline = array(study.cronograma, 'cronograma', 30).map(function (item) {
      return { duracion: text(item.duracion, 'Duración', 100, true), actividad: text(item.actividad, 'Actividad', 500, true) };
    });
    var facts = array(study.datos, 'datos', 20).map(function (item) {
      return { nombre: text(item.nombre, 'Nombre de dato', 100, true), valor: text(item.valor, 'Valor de dato', 200, true) };
    });
    var normalized = { id: id };
    if (options.hasCategory) normalized.categoria = study.categoria;
    normalized.nombre = text(study.nombre, 'Nombre', 120, true);
    normalized.frase = text(study.frase, 'Frase', 300, true);
    normalized.puntos = textArray(study.puntos, 'Punto', 2, 500);
    normalized.tiempos = textArray(study.tiempos, 'Tiempo', 20, 120);
    normalized.etiquetas = textArray(study.etiquetas, 'Etiqueta', 20, 120);
    normalized.imagen = image;
    normalized.intro = text(study.intro, 'Introducción', 2000, false);
    normalized.secciones = sections;
    normalized.cronograma = timeline;
    normalized.datos = facts;
    return normalized;
  });
}

function validateStudies(input) {
  return validateCollection(input, { label: 'estudios', imageDirectory: 'estudios', hasCategory: true });
}

function validateColombia(input) {
  return validateCollection(input, { label: 'estudios de Colombia', imageDirectory: 'colombia', hasCategory: false });
}

function validateImageBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) invalid('La imagen está vacía.');
  if (buffer.length > MAX_IMAGE) throw Object.assign(new Error('La imagen supera el máximo de 1,5 MB.'), { status: 413 });
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  invalid('El archivo no es una imagen WebP, PNG o JPEG real.');
}

module.exports = {
  MAX_IMAGE: MAX_IMAGE,
  validateStudies: validateStudies,
  validateColombia: validateColombia,
  validateImageBytes: validateImageBytes
};
