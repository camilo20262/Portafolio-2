(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StudiesCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LEGACY_BOLD_PREFIXES = [
    'Medir de forma continua',
    'Entender',
    'Actuar',
    'Metodología “Trend Scout and Hacker”'
  ];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function richText(value) {
    var text = String(value == null ? '' : value).trim();
    var colon = text.indexOf(':');
    if (colon > 0 && colon < 80) {
      return '<b>' + esc(text.slice(0, colon + 1)) + '</b>' + esc(text.slice(colon + 1));
    }
    for (var i = 0; i < LEGACY_BOLD_PREFIXES.length; i++) {
      var prefix = LEGACY_BOLD_PREFIXES[i];
      if (text.indexOf(prefix + ' ') === 0) {
        return '<b>' + esc(prefix) + '</b>' + esc(text.slice(prefix.length));
      }
    }
    return esc(text);
  }

  function buildStudy(study, editing) {
    var html = '<details class="study" name="c' + (Number(study.categoria) + 1) + '" id="estudio-' + esc(study.id) + '">';
    html += '<summary><h4>' + esc(study.nombre) + '</h4><p class="tagline">' + esc(study.frase) + '</p></summary>';
    html += '<div class="body">';
    if (study.imagen) {
      html += '<figure class="thumb' + (study.imagen.ajuste === 'fit' ? ' fit' : '') + '"><img src="' + esc(study.imagen.ruta) + '" alt="' + esc(study.imagen.alt) + '"></figure>';
    }
    (study.puntos || []).forEach(function (point) {
      html += '<p>' + richText(point) + '</p>';
    });
    var tags = [];
    (study.tiempos || []).forEach(function (item) {
      tags.push('<span class="tag time">' + esc(item) + '</span>');
    });
    (study.etiquetas || []).forEach(function (item) {
      tags.push('<span class="tag">' + esc(item) + '</span>');
    });
    if (tags.length) html += '<div class="tags">' + tags.join('') + '</div>';
    html += '<button class="btn" type="button" data-open>Ver detalle completo</button>';
    if (editing) {
      html += '<div class="study-admin" aria-label="Acciones de edición">';
      html += '<button type="button" data-edit="' + esc(study.id) + '">Editar</button>';
      html += '<button type="button" data-move="-1" data-id="' + esc(study.id) + '" aria-label="Mover hacia arriba">↑</button>';
      html += '<button type="button" data-move="1" data-id="' + esc(study.id) + '" aria-label="Mover hacia abajo">↓</button>';
      html += '<button type="button" class="danger" data-delete="' + esc(study.id) + '">Eliminar</button>';
      html += '</div>';
    }
    html += '</div><template class="detail">';
    if (study.intro) html += '<p>' + esc(study.intro) + '</p>';
    (study.secciones || []).forEach(function (section) {
      if (section.titulo) html += '<h5>' + esc(section.titulo) + '</h5>';
      if (section.parrafo) html += '<p>' + esc(section.parrafo) + '</p>';
      if (section.lista && section.lista.length) {
        var ordered = section.tipoLista === 'steps';
        html += '<' + (ordered ? 'ol' : 'ul') + ' class="' + (ordered ? 'steps' : 'ticks') + '">';
        section.lista.forEach(function (item) { html += '<li>' + richText(item) + '</li>'; });
        html += '</' + (ordered ? 'ol' : 'ul') + '>';
      }
    });
    if (study.cronograma && study.cronograma.length) {
      html += '<ol class="timeline">';
      study.cronograma.forEach(function (item) {
        html += '<li><b>' + esc(item.duracion) + '</b><span>' + esc(item.actividad) + '</span></li>';
      });
      html += '</ol>';
    }
    if (study.datos && study.datos.length) {
      html += '<div class="facts-row">';
      study.datos.forEach(function (item) {
        html += '<div><span>' + esc(item.nombre) + '</span><b>' + esc(item.valor) + '</b></div>';
      });
      html += '</div>';
    }
    html += '</template></details>';
    return html;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function insertForCategory(studies, study) {
    var next = clone(studies);
    var last = -1;
    for (var i = 0; i < next.length; i++) if (next[i].categoria === study.categoria) last = i;
    next.splice(last + 1, 0, clone(study));
    return next;
  }

  function createStudy(studies, study) {
    if (studies.some(function (item) { return item.id === study.id; })) throw new Error('El ID ya existe.');
    return insertForCategory(studies, study);
  }

  function updateStudy(studies, originalId, updated) {
    var current = studies.find(function (item) { return item.id === originalId; });
    if (!current) throw new Error('No se encontró el estudio.');
    if (updated.id !== originalId && studies.some(function (item) { return item.id === updated.id; })) throw new Error('El ID ya existe.');
    var next = studies.filter(function (item) { return item.id !== originalId; });
    if (current.categoria !== updated.categoria) return insertForCategory(next, updated);
    var originalIndex = studies.findIndex(function (item) { return item.id === originalId; });
    var before = studies.slice(0, originalIndex).filter(function (item) { return item.id !== originalId; }).length;
    next.splice(before, 0, clone(updated));
    return next;
  }

  function moveStudy(studies, id, direction) {
    var next = clone(studies);
    var index = next.findIndex(function (item) { return item.id === id; });
    if (index < 0) return next;
    var category = next[index].categoria;
    var siblings = next.map(function (item, pos) { return { item: item, pos: pos }; })
      .filter(function (entry) { return entry.item.categoria === category; });
    var siblingIndex = siblings.findIndex(function (entry) { return entry.pos === index; });
    var target = siblings[siblingIndex + direction];
    if (!target) return next;
    var tmp = next[index]; next[index] = next[target.pos]; next[target.pos] = tmp;
    return next;
  }

  function deleteStudy(studies, id) {
    return clone(studies).filter(function (item) { return item.id !== id; });
  }

  return {
    esc: esc,
    richText: richText,
    buildStudy: buildStudy,
    createStudy: createStudy,
    updateStudy: updateStudy,
    moveStudy: moveStudy,
    deleteStudy: deleteStudy
  };
});
