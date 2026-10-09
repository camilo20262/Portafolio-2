(function () {
  'use strict';

  var core = window.StudiesCore;
  if (!core) return;

  var categoryColumns = Array.prototype.slice.call(document.querySelectorAll('#estudios .col[data-category]'));
  var categoryLists = categoryColumns.map(function (column) { return column.querySelector('.list'); });
  var colombiaColumn = document.getElementById('colombia');
  var colombiaList = colombiaColumn.querySelector('.list');
  var detail = document.getElementById('detail');
  var loginDialog = document.getElementById('login-dialog');
  var studyDialog = document.getElementById('study-dialog');
  var editorBar = document.getElementById('editor-bar');
  var statusEl = document.getElementById('editor-status');
  var state = [];
  var colombiaState = [];
  var baseSha = '';
  var editing = false;
  var dirty = false;
  var publishing = false;
  var activeDetail = 0;
  var lastFocus = null;
  var pendingImages = { studies: Object.create(null), colombia: Object.create(null) };
  var formImage = null;
  var formScope = 'studies';
  var imageProcessing = false;
  var slugTouched = false;

  function request(url, options) {
    return fetch(url, options || {}).then(function (response) {
      return response.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (error) { data = { error: text || 'Respuesta inválida.' }; }
        data.__status = response.status;
        if (!response.ok) {
          var failure = new Error(data.error || 'No se pudo completar la solicitud.');
          failure.status = response.status;
          failure.data = data;
          throw failure;
        }
        return data;
      });
    });
  }

  function jsonOptions(method, value) {
    return {
      method: method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: value == null ? undefined : JSON.stringify(value)
    };
  }

  function setStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.className = 'editor-status ' + (kind || 'clean');
  }

  function setDirty(value) {
    dirty = value;
    if (dirty) setStatus('Cambios sin guardar', 'error');
    else setStatus('Sin cambios pendientes', 'clean');
  }

  function setHash(value) {
    try { history.replaceState(null, '', value); } catch (error) {}
  }

  function applyImageOrientations() {
    Array.prototype.forEach.call(document.querySelectorAll('.thumb img'), function (image) {
      function updateOrientation() {
        var thumb = image.closest('.thumb');
        if (thumb) thumb.classList.toggle('portrait', image.naturalHeight > image.naturalWidth);
      }
      if (image.complete) updateOrientation();
      else image.addEventListener('load', updateOrientation);
    });
  }

  function render() {
    var visibleCategories = core.visibleCategoryIndexes(state, editing);
    categoryLists.forEach(function (list, category) {
      var items = state.filter(function (study) { return study.categoria === category; });
      list.innerHTML = items.map(function (study) { return core.buildStudy(study, editing); }).join('');
      if (editing) list.insertAdjacentHTML('beforeend', '<button class="add-study" type="button" data-add="' + category + '" data-scope="studies">+ Agregar estudio</button>');
      categoryColumns[category].hidden = visibleCategories.indexOf(category) === -1;
    });
    colombiaList.innerHTML = colombiaState.map(function (study, index) {
      return core.buildColombiaStudy(study, index, editing);
    }).join('');
    if (editing) colombiaList.insertAdjacentHTML('beforeend', '<button class="add-study" type="button" data-add="" data-scope="colombia">+ Agregar estudio</button>');
    var showColombia = core.shouldShowColombia(colombiaState, editing);
    colombiaColumn.hidden = !showColombia;
    var count = document.querySelector('#inicio .cover-stats > div:last-child b');
    if (count) count.textContent = String(state.length);
    applyImageOrientations();
  }

  function studiesInDom() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-detail-study][data-has-detail="true"]'));
  }

  function openStudy(index) {
    var studies = studiesInDom();
    if (!detail || !studies.length) return;
    activeDetail = (index + studies.length) % studies.length;
    var study = studies[activeDetail];
    var column = study.closest('.col');
    var head = column && column.querySelector('.colhead');
    var title = study.querySelector('h4, h3').textContent;
    var media = detail.querySelector('.d-media');
    var content = detail.querySelector('.d-content');
    detail.querySelector('.d-cat').textContent = study.getAttribute('data-detail-label') || '';
    detail.querySelector('#d-title').textContent = title;
    detail.querySelector('.d-tag').textContent = study.querySelector('.tagline').textContent;
    media.replaceChildren();
    media.style.backgroundImage = '';
    var source = study.querySelector('.thumb img');
    if (source) {
      media.classList.remove('art');
      var image = document.createElement('img');
      image.src = source.src;
      image.alt = source.alt;
      media.appendChild(image);
    } else {
      media.classList.add('art');
      media.style.backgroundImage = head ? getComputedStyle(head).backgroundImage : 'linear-gradient(to top right,#93DFE3 0%,#83BFF7 50%,#5465FF 100%)';
      var label = document.createElement('span');
      label.textContent = title;
      media.appendChild(label);
    }
    content.replaceChildren();
    var template = study.querySelector('template.detail');
    if (template) content.appendChild(template.content.cloneNode(true));
    detail.querySelector('.d-count').textContent = (activeDetail + 1) + ' de ' + studies.length;
    if (!detail.open) {
      lastFocus = document.activeElement;
      detail.showModal();
    }
    detail.querySelector('.d-body').scrollTop = 0;
    detail.querySelector('.d-wrap').scrollTop = 0;
    detail.dataset.returnHash = study.closest('#colombia') ? '#colombia' : '#estudios';
    setHash('#' + study.id);
  }

  function openHashStudy() {
    var hash = location.hash.slice(1);
    var target = document.getElementById(hash) || document.getElementById('estudio-' + hash) || document.getElementById('colombia-estudio-' + hash);
    if (!target || target.getAttribute('data-has-detail') !== 'true') return;
    var studies = studiesInDom();
    var index = studies.indexOf(target);
    if (index > -1) {
      if (target.tagName === 'DETAILS') target.open = true;
      setTimeout(function () { openStudy(index); }, 150);
    }
  }

  function enterEditor(session) {
    editing = true;
    baseSha = session.sha;
    document.body.classList.add('is-editing');
    editorBar.hidden = false;
    setDirty(false);
    render();
    setHash('#estudios');
    document.getElementById('estudios').scrollIntoView({ block: 'start' });
  }

  function showLogin(message) {
    document.getElementById('login-error').textContent = message || '';
    document.getElementById('login-password').value = '';
    if (!loginDialog.open) loginDialog.showModal();
    setTimeout(function () { document.getElementById('login-password').focus(); }, 50);
  }

  function requestEditor() {
    request('/api/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(enterEditor)
      .catch(function (error) {
        if (error.status === 401) showLogin('');
        else showLogin('No se pudo comprobar la sesión. Intenta de nuevo.');
      });
  }

  function valuesByLine(value) {
    return value.split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function slug(value) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  }

  function makeSectionRow(section) {
    var card = document.createElement('div');
    card.className = 'repeat-card section-row';
    card.innerHTML = '<div class="form-grid"><label class="form-field">Título<input data-field="title" maxlength="120"></label><label class="form-field">Tipo de lista<select data-field="type"><option value="ticks">Viñetas</option><option value="steps">Pasos</option></select></label><label class="form-field wide">Párrafo<textarea data-field="paragraph" maxlength="3000"></textarea></label><label class="form-field wide">Lista (un elemento por línea)<textarea data-field="items"></textarea></label></div><button class="repeat-remove" type="button" data-remove-row>Quitar sección</button>';
    card.querySelector('[data-field="title"]').value = section.titulo || '';
    card.querySelector('[data-field="type"]').value = section.tipoLista || 'ticks';
    card.querySelector('[data-field="paragraph"]').value = section.parrafo || '';
    card.querySelector('[data-field="items"]').value = (section.lista || []).join('\n');
    document.getElementById('sections-list').appendChild(card);
  }

  function makePairRow(containerId, className, firstLabel, secondLabel, value) {
    var row = document.createElement('div');
    row.className = 'repeat-row ' + className;
    row.innerHTML = '<label class="form-field"><span></span><input data-field="first" maxlength="100"></label><label class="form-field"><span></span><input data-field="second" maxlength="500"></label><button class="repeat-remove" type="button" data-remove-row>Quitar</button>';
    row.querySelectorAll('span')[0].textContent = firstLabel;
    row.querySelectorAll('span')[1].textContent = secondLabel;
    row.querySelector('[data-field="first"]').value = value.first || '';
    row.querySelector('[data-field="second"]').value = value.second || '';
    document.getElementById(containerId).appendChild(row);
  }

  function updateImagePreview(src, alt) {
    var preview = document.getElementById('study-image-preview');
    if (!src) {
      preview.hidden = true;
      preview.removeAttribute('src');
      return;
    }
    preview.src = src;
    preview.alt = alt || '';
    preview.hidden = false;
  }

  function emptyStudy(category, scope) {
    var study = {
      id: '', nombre: '', frase: '', puntos: [], tiempos: [], etiquetas: [],
      imagen: null, intro: '', secciones: [], cronograma: [], datos: []
    };
    if (scope !== 'colombia') study.categoria = category;
    return study;
  }

  function openForm(study, isNew, scope) {
    var item = JSON.parse(JSON.stringify(study));
    formScope = scope || 'studies';
    if (formImage) URL.revokeObjectURL(formImage.url);
    document.getElementById('study-form-title').textContent = (isNew ? 'Agregar estudio' : 'Editar estudio') + (formScope === 'colombia' ? ' de Colombia' : '');
    document.getElementById('study-original-id').value = isNew ? '' : item.id;
    document.getElementById('study-id').value = item.id;
    var categoryField = document.getElementById('study-category-field');
    categoryField.hidden = formScope === 'colombia';
    document.getElementById('study-category').required = formScope !== 'colombia';
    if (formScope !== 'colombia') document.getElementById('study-category').value = String(item.categoria);
    document.getElementById('study-name').value = item.nombre;
    document.getElementById('study-tagline').value = item.frase;
    document.getElementById('study-point-1').value = item.puntos[0] || '';
    document.getElementById('study-point-2').value = item.puntos[1] || '';
    document.getElementById('study-times').value = item.tiempos.join('\n');
    document.getElementById('study-tags').value = item.etiquetas.join('\n');
    document.getElementById('study-intro').value = item.intro;
    document.getElementById('study-image-alt').value = item.imagen ? item.imagen.alt : '';
    document.getElementById('study-image-fit').value = item.imagen ? item.imagen.ajuste : 'fit';
    document.getElementById('study-image-remove').checked = false;
    document.getElementById('study-image').value = '';
    document.getElementById('study-form-error').textContent = '';
    document.getElementById('sections-list').replaceChildren();
    document.getElementById('timeline-list').replaceChildren();
    document.getElementById('facts-list').replaceChildren();
    item.secciones.forEach(makeSectionRow);
    item.cronograma.forEach(function (row) { makePairRow('timeline-list', 'timeline-row', 'Duración', 'Actividad', { first: row.duracion, second: row.actividad }); });
    item.datos.forEach(function (row) { makePairRow('facts-list', 'fact-row', 'Nombre', 'Valor', { first: row.nombre, second: row.valor }); });
    formImage = null;
    imageProcessing = false;
    document.querySelector('#study-form [type="submit"]').disabled = false;
    slugTouched = !isNew;
    updateImagePreview(item.imagen && item.imagen.ruta, item.imagen && item.imagen.alt);
    studyDialog.showModal();
  }

  function imageFromFile(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Usa una imagen WebP, PNG o JPEG.'));
      var originalUrl = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        var scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(originalUrl);
        var qualities = [0.84, 0.74, 0.64, 0.54];
        function encode(index) {
          canvas.toBlob(function (blob) {
            if (!blob) return reject(new Error('El navegador no pudo convertir la imagen a WebP.'));
            if (blob.size > 1572864 && index + 1 < qualities.length) return encode(index + 1);
            if (blob.size > 1572864) return reject(new Error('La imagen supera 1,5 MB incluso después de comprimirla.'));
            resolve({ blob: blob, url: URL.createObjectURL(blob) });
          }, 'image/webp', qualities[index]);
        }
        encode(0);
      };
      image.onerror = function () { URL.revokeObjectURL(originalUrl); reject(new Error('No se pudo leer la imagen.')); };
      image.src = originalUrl;
    });
  }

  function readSections() {
    return Array.prototype.map.call(document.querySelectorAll('.section-row'), function (row) {
      return {
        titulo: row.querySelector('[data-field="title"]').value.trim(),
        parrafo: row.querySelector('[data-field="paragraph"]').value.trim(),
        lista: valuesByLine(row.querySelector('[data-field="items"]').value),
        tipoLista: row.querySelector('[data-field="type"]').value
      };
    }).filter(function (section) { return section.titulo || section.parrafo || section.lista.length; });
  }

  function readPairs(selector, firstName, secondName) {
    return Array.prototype.map.call(document.querySelectorAll(selector), function (row) {
      var value = {};
      value[firstName] = row.querySelector('[data-field="first"]').value.trim();
      value[secondName] = row.querySelector('[data-field="second"]').value.trim();
      return value;
    }).filter(function (value) { return value[firstName] || value[secondName]; });
  }

  function collectFormStudy() {
    var originalId = document.getElementById('study-original-id').value;
    var currentState = formScope === 'colombia' ? colombiaState : state;
    var existing = currentState.find(function (item) { return item.id === originalId; });
    var removeImage = document.getElementById('study-image-remove').checked;
    var image = existing && existing.imagen ? JSON.parse(JSON.stringify(existing.imagen)) : null;
    if (removeImage) image = null;
    if (formImage) image = {
      ruta: formImage.url,
      alt: document.getElementById('study-image-alt').value.trim(),
      ajuste: document.getElementById('study-image-fit').value
    };
    if (image && !formImage) {
      image.alt = document.getElementById('study-image-alt').value.trim();
      image.ajuste = document.getElementById('study-image-fit').value;
    }
    var study = {
      id: document.getElementById('study-id').value.trim(),
      nombre: document.getElementById('study-name').value.trim(),
      frase: document.getElementById('study-tagline').value.trim(),
      puntos: [document.getElementById('study-point-1').value.trim(), document.getElementById('study-point-2').value.trim()].filter(Boolean),
      tiempos: valuesByLine(document.getElementById('study-times').value),
      etiquetas: valuesByLine(document.getElementById('study-tags').value),
      imagen: image,
      intro: document.getElementById('study-intro').value.trim(),
      secciones: readSections(),
      cronograma: readPairs('.timeline-row', 'duracion', 'actividad'),
      datos: readPairs('.fact-row', 'nombre', 'valor')
    };
    if (formScope !== 'colombia') study.categoria = Number(document.getElementById('study-category').value);
    return study;
  }

  function validateClientStudy(study) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(study.id)) throw new Error('El ID solo puede tener minúsculas, números y guiones.');
    if (!study.nombre || !study.frase) throw new Error('Nombre y frase son obligatorios.');
    if (study.imagen && !study.imagen.alt) throw new Error('Agrega un texto alternativo para la imagen.');
  }

  function uploadImage(id, pending, scope) {
    return fetch('/api/upload', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'image/webp', 'X-Study-Id': id, 'X-Study-Scope': scope },
      body: pending.blob
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data.error || 'No se pudo subir la imagen.');
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  function publish() {
    if (publishing || !dirty) return;
    publishing = true;
    var button = document.getElementById('editor-publish');
    button.disabled = true;
    button.textContent = 'Guardando…';
    setStatus('Subiendo cambios…', 'clean');
    var payload = JSON.parse(JSON.stringify(state));
    var colombiaPayload = JSON.parse(JSON.stringify(colombiaState));
    var uploads = [];
    var imageQueue = [];
    ['studies', 'colombia'].forEach(function (scope) {
      var collection = scope === 'colombia' ? colombiaPayload : payload;
      Object.keys(pendingImages[scope]).forEach(function (id) {
        if (collection.some(function (study) { return study.id === id && study.imagen; })) imageQueue.push({ id: id, scope: scope });
      });
    });
    imageQueue.reduce(function (chain, item) {
      return chain.then(function () {
        return uploadImage(item.id, pendingImages[item.scope][item.id], item.scope).then(function (uploaded) {
          var collection = item.scope === 'colombia' ? colombiaPayload : payload;
          var study = collection.find(function (entry) { return entry.id === item.id; });
          study.imagen.ruta = uploaded.path;
          uploads.push({ id: item.id, scope: item.scope, token: uploaded.token });
        });
      });
    }, Promise.resolve()).then(function () {
      setStatus('Creando publicación…', 'clean');
      return request('/api/save', jsonOptions('POST', { studies: payload, colombia: colombiaPayload, uploads: uploads, baseSha: baseSha }));
    }).then(function (result) {
      ['studies', 'colombia'].forEach(function (scope) {
        Object.keys(pendingImages[scope]).forEach(function (id) { URL.revokeObjectURL(pendingImages[scope][id].url); });
      });
      pendingImages = { studies: Object.create(null), colombia: Object.create(null) };
      state = payload;
      colombiaState = colombiaPayload;
      baseSha = result.sha;
      dirty = false;
      render();
      setStatus('Guardado. Los cambios aparecerán en el link en 1 a 2 minutos, cuando Vercel termine de publicar.', 'success');
    }).catch(function (error) {
      if (error.status === 409) setStatus('Alguien publicó cambios mientras editabas. Recarga la página para ver la versión nueva.', 'error');
      else if (error.status === 401) setStatus('La sesión venció. Vuelve a ingresar para publicar.', 'error');
      else setStatus(error.message || 'No se pudieron guardar los cambios.', 'error');
    }).finally(function () {
      publishing = false;
      button.disabled = false;
      button.textContent = 'Guardar y publicar';
    });
  }

  document.addEventListener('click', function (event) {
    var open = event.target.closest('[data-open]');
    if (open) {
      event.preventDefault();
      openStudy(studiesInDom().indexOf(open.closest('[data-detail-study]')));
      return;
    }
    var step = event.target.closest('[data-step]');
    if (step && detail.open) { openStudy(activeDetail + Number(step.getAttribute('data-step'))); return; }
    var add = event.target.closest('[data-add]');
    if (add && editing) {
      var addScope = add.getAttribute('data-scope') || 'studies';
      openForm(emptyStudy(Number(add.getAttribute('data-add')), addScope), true, addScope);
      return;
    }
    var edit = event.target.closest('[data-edit]');
    if (edit && editing) {
      var editScope = edit.getAttribute('data-scope') || 'studies';
      var editState = editScope === 'colombia' ? colombiaState : state;
      var item = editState.find(function (study) { return study.id === edit.getAttribute('data-edit'); });
      if (item) openForm(item, false, editScope);
      return;
    }
    var move = event.target.closest('[data-move]');
    if (move && editing) {
      var moveScope = move.getAttribute('data-scope') || 'studies';
      if (moveScope === 'colombia') colombiaState = core.moveStudy(colombiaState, move.getAttribute('data-id'), Number(move.getAttribute('data-move')));
      else state = core.moveStudy(state, move.getAttribute('data-id'), Number(move.getAttribute('data-move')));
      setDirty(true); render(); return;
    }
    var remove = event.target.closest('[data-delete]');
    if (remove && editing) {
      var removeId = remove.getAttribute('data-delete');
      var removeScope = remove.getAttribute('data-scope') || 'studies';
      if (window.confirm('¿Eliminar este estudio? El cambio no se publicará hasta guardar.')) {
        if (removeScope === 'colombia') colombiaState = core.deleteStudy(colombiaState, removeId);
        else state = core.deleteStudy(state, removeId);
        if (pendingImages[removeScope][removeId]) {
          URL.revokeObjectURL(pendingImages[removeScope][removeId].url);
          delete pendingImages[removeScope][removeId];
        }
        setDirty(true); render();
      }
      return;
    }
    var close = event.target.closest('[data-close]');
    if (close) document.getElementById(close.getAttribute('data-close')).close();
    var removeRow = event.target.closest('[data-remove-row]');
    if (removeRow) removeRow.parentElement.remove();
    var addRow = event.target.closest('[data-add-row]');
    if (addRow) {
      var type = addRow.getAttribute('data-add-row');
      if (type === 'section') makeSectionRow({ titulo: '', parrafo: '', lista: [], tipoLista: 'ticks' });
      if (type === 'timeline') makePairRow('timeline-list', 'timeline-row', 'Duración', 'Actividad', { first: '', second: '' });
      if (type === 'fact') makePairRow('facts-list', 'fact-row', 'Nombre', 'Valor', { first: '', second: '' });
    }
  });

  detail.querySelector('.d-close').addEventListener('click', function () { detail.close(); });
  detail.addEventListener('click', function (event) { if (event.target === detail) detail.close(); });
  detail.addEventListener('close', function () {
    setHash(detail.dataset.returnHash || '#estudios');
    var current = studiesInDom()[activeDetail];
    if (current && current.tagName === 'DETAILS' && !current.open) current.open = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  });
  detail.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowRight') openStudy(activeDetail + 1);
    if (event.key === 'ArrowLeft') openStudy(activeDetail - 1);
  });

  document.getElementById('edit-entry').addEventListener('click', requestEditor);
  document.getElementById('editor-publish').addEventListener('click', publish);
  document.getElementById('editor-logout').addEventListener('click', function () {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Cerrar sesión de todos modos?')) return;
    request('/api/logout', jsonOptions('POST', {})).finally(function () { location.href = location.pathname + '#estudios'; location.reload(); });
  });

  document.getElementById('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var submit = event.target.querySelector('[type="submit"]');
    submit.disabled = true;
    document.getElementById('login-error').textContent = '';
    request('/api/login', jsonOptions('POST', { password: document.getElementById('login-password').value }))
      .then(function () { loginDialog.close(); return request('/api/session', { credentials: 'same-origin', cache: 'no-store' }); })
      .then(enterEditor)
      .catch(function (error) { document.getElementById('login-error').textContent = error.message || 'No se pudo iniciar sesión.'; })
      .finally(function () { submit.disabled = false; });
  });

  document.getElementById('study-name').addEventListener('input', function (event) {
    if (!slugTouched) document.getElementById('study-id').value = slug(event.target.value);
  });
  document.getElementById('study-id').addEventListener('input', function () { slugTouched = true; });
  document.getElementById('study-image').addEventListener('change', function (event) {
    var file = event.target.files[0];
    if (!file) return;
    imageProcessing = true;
    document.querySelector('#study-form [type="submit"]').disabled = true;
    document.getElementById('study-form-error').textContent = 'Comprimiendo imagen…';
    imageFromFile(file).then(function (result) {
      if (formImage) URL.revokeObjectURL(formImage.url);
      formImage = result;
      document.getElementById('study-image-remove').checked = false;
      updateImagePreview(result.url, document.getElementById('study-image-alt').value);
      document.getElementById('study-form-error').textContent = '';
    }).catch(function (error) { document.getElementById('study-form-error').textContent = error.message; })
      .finally(function () {
        imageProcessing = false;
        document.querySelector('#study-form [type="submit"]').disabled = false;
      });
  });
  document.getElementById('study-image-remove').addEventListener('change', function (event) {
    if (event.target.checked) updateImagePreview('', '');
  });

  document.getElementById('study-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var errorEl = document.getElementById('study-form-error');
    try {
      if (imageProcessing) throw new Error('Espera a que termine la compresión de la imagen.');
      var originalId = document.getElementById('study-original-id').value;
      var study = collectFormStudy();
      validateClientStudy(study);
      var currentState = formScope === 'colombia' ? colombiaState : state;
      currentState = originalId ? core.updateStudy(currentState, originalId, study) : core.createStudy(currentState, study);
      if (formScope === 'colombia') colombiaState = currentState;
      else state = currentState;
      if (originalId && originalId !== study.id && pendingImages[formScope][originalId]) {
        pendingImages[formScope][study.id] = pendingImages[formScope][originalId];
        delete pendingImages[formScope][originalId];
      }
      if (document.getElementById('study-image-remove').checked && pendingImages[formScope][study.id]) {
        URL.revokeObjectURL(pendingImages[formScope][study.id].url);
        delete pendingImages[formScope][study.id];
      }
      if (formImage) {
        if (pendingImages[formScope][study.id]) URL.revokeObjectURL(pendingImages[formScope][study.id].url);
        pendingImages[formScope][study.id] = formImage;
        formImage = null;
      }
      studyDialog.close();
      setDirty(true);
      render();
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });

  studyDialog.addEventListener('close', function () {
    if (formImage) {
      URL.revokeObjectURL(formImage.url);
      formImage = null;
    }
  });

  window.addEventListener('beforeunload', function (event) {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  Promise.all([
    request('/data/estudios.json', { cache: 'no-store' }),
    request('/data/colombia.json', { cache: 'no-store' })
  ]).then(function (collections) {
    state = collections[0];
    colombiaState = collections[1];
    render();
    openHashStudy();
    if (location.hash === '#editar') requestEditor();
  }).catch(function () {
    categoryLists[0].innerHTML = '<p>No fue posible cargar los estudios. Recarga la página para intentar de nuevo.</p>';
  });
})();
