(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StudiesCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CATEGORY_LABELS = [
    'Marca & Campaña',
    'Competencia & Mercado',
    'Consumidor & Audiencias',
    'Digital & Social'
  ];

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

  function hasDetail(study) {
    return Boolean(
      String(study.intro || '').trim() ||
      (study.secciones || []).some(function (section) {
        return String(section.titulo || '').trim() || String(section.parrafo || '').trim() || (section.lista || []).length;
      }) ||
      (study.cronograma || []).length ||
      (study.datos || []).length
    );
  }

  function buildTags(study) {
    var tags = [];
    (study.tiempos || []).forEach(function (item) {
      tags.push('<span class="tag time">' + esc(item) + '</span>');
    });
    (study.etiquetas || []).forEach(function (item) {
      tags.push('<span class="tag">' + esc(item) + '</span>');
    });
    return tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '';
  }

  function buildDetail(study) {
    var html = '<template class="detail">';
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
    return html + '</template>';
  }

  function buildAdmin(study, scope) {
    return '<div class="study-admin" aria-label="Acciones de edición">' +
      '<button type="button" data-edit="' + esc(study.id) + '" data-scope="' + scope + '">Editar</button>' +
      '<button type="button" data-move="-1" data-id="' + esc(study.id) + '" data-scope="' + scope + '" aria-label="Mover hacia arriba">↑</button>' +
      '<button type="button" data-move="1" data-id="' + esc(study.id) + '" data-scope="' + scope + '" aria-label="Mover hacia abajo">↓</button>' +
      '<button type="button" class="danger" data-delete="' + esc(study.id) + '" data-scope="' + scope + '">Eliminar</button>' +
      '</div>';
  }

  function buildStudy(study, editing) {
    var detailed = hasDetail(study);
    var html = '<details class="study" name="c' + (Number(study.categoria) + 1) + '" id="estudio-' + esc(study.id) + '" data-detail-study data-detail-label="' + esc(CATEGORY_LABELS[study.categoria] || '') + '" data-has-detail="' + detailed + '">';
    html += '<summary><h4>' + esc(study.nombre) + '</h4><p class="tagline">' + esc(study.frase) + '</p></summary>';
    html += '<div class="body">';
    if (study.imagen) {
      html += '<figure class="thumb' + (study.imagen.ajuste === 'fit' ? ' fit' : '') + '"><img src="' + esc(study.imagen.ruta) + '" alt="' + esc(study.imagen.alt) + '"></figure>';
    }
    (study.puntos || []).forEach(function (point) {
      html += '<p>' + richText(point) + '</p>';
    });
    html += buildTags(study);
    if (detailed) html += '<button class="btn" type="button" data-open>Ver detalle completo</button>';
    if (editing) html += buildAdmin(study, 'studies');
    html += '</div>' + buildDetail(study) + '</details>';
    return html;
  }

  function buildColombiaStudy(study, index, editing) {
    var detailed = hasDetail(study);
    var html = '<article class="colombia-card" id="colombia-estudio-' + esc(study.id) + '" data-detail-study data-detail-label="Mercado de Colombia" data-has-detail="' + detailed + '">';
    if (study.imagen) {
      html += '<figure class="colombia-image' + (study.imagen.ajuste === 'fit' ? ' fit' : '') + '"><img src="' + esc(study.imagen.ruta) + '" alt="' + esc(study.imagen.alt) + '"></figure>';
    } else {
      html += '<div class="colombia-image art" aria-hidden="true"><span>' + esc(study.nombre) + '</span></div>';
    }
    html += '<div class="colombia-card-body"><span class="colombia-number">' + String(index + 1).padStart(2, '0') + '</span>';
    html += '<h3>' + esc(study.nombre) + '</h3><p class="tagline">' + esc(study.frase) + '</p>';
    html += buildTags(study);
    if (detailed) html += '<button class="btn" type="button" data-open>Ver detalle completo</button>';
    if (editing) html += buildAdmin(study, 'colombia');
    html += '</div>' + buildDetail(study) + '</article>';
    return html;
  }

  function visibleCategoryIndexes(studies, editing) {
    if (editing) return [0, 1, 2, 3];
    return [0, 1, 2, 3].filter(function (category) {
      return studies.some(function (study) { return study.categoria === category; });
    });
  }

  function shouldShowColombia(studies, editing) {
    return Boolean(editing || (studies && studies.length));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function insertForCategory(studies, study) {
    var next = clone(studies);
    if (!Number.isInteger(study.categoria)) {
      next.push(clone(study));
      return next;
    }
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
    hasDetail: hasDetail,
    buildStudy: buildStudy,
    buildColombiaStudy: buildColombiaStudy,
    visibleCategoryIndexes: visibleCategoryIndexes,
    shouldShowColombia: shouldShowColombia,
    createStudy: createStudy,
    updateStudy: updateStudy,
    moveStudy: moveStudy,
    deleteStudy: deleteStudy
  };
});
