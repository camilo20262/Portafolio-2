'use strict';

var http = require('./_lib/http');
var sessions = require('./_lib/session');
var github = require('./_lib/github');
var validation = require('./_lib/validation');

function imagePaths(collections) {
  var paths = new Set();
  collections.forEach(function (studies) {
    studies.forEach(function (study) {
      if (study.imagen) paths.add(study.imagen.ruta);
    });
  });
  return paths;
}

function uploadKey(scope, id) {
  return scope + ':' + id;
}

function validClaimPath(scope, path) {
  var directory = scope === 'colombia' ? 'colombia' : 'estudios';
  return new RegExp('^/assets/' + directory + '/[a-z0-9-]+\\.(webp|png|jpe?g)$').test(path || '');
}

function parseJson(value, label) {
  try { return JSON.parse(value); }
  catch (error) { throw Object.assign(new Error('El archivo actual de ' + label + ' no es JSON válido.'), { status: 502 }); }
}

module.exports = async function save(req, res) {
  try {
    http.method(req, 'POST');
    http.verifyOrigin(req);
    sessions.requireSession(req);
    var body = await http.jsonBody(req, 2 * 1024 * 1024);
    if (!body || typeof body !== 'object') throw Object.assign(new Error('La solicitud no es válida.'), { status: 400 });
    if (typeof body.baseSha !== 'string' || !/^[a-f0-9]{40}$/i.test(body.baseSha)) {
      throw Object.assign(new Error('El SHA base no es válido.'), { status: 400 });
    }

    var studies = validation.validateStudies(body.studies);
    var colombia = validation.validateColombia(body.colombia);
    var uploads = Array.isArray(body.uploads) ? body.uploads : [];
    if (uploads.length > studies.length + colombia.length) {
      throw Object.assign(new Error('Hay demasiadas imágenes nuevas.'), { status: 400 });
    }

    var uploadClaims = new Map();
    uploads.forEach(function (upload) {
      if (!upload || typeof upload.id !== 'string' || typeof upload.scope !== 'string' || typeof upload.token !== 'string' ||
          (upload.scope !== 'studies' && upload.scope !== 'colombia')) {
        throw Object.assign(new Error('Una referencia de imagen no es válida.'), { status: 400 });
      }
      var claim = sessions.readUploadToken(upload.token);
      if (!claim || claim.id !== upload.id || claim.scope !== upload.scope || !/^[a-f0-9]{40}$/i.test(claim.sha || '') ||
          !validClaimPath(upload.scope, claim.path)) {
        throw Object.assign(new Error('Una referencia de imagen venció o fue alterada.'), { status: 400 });
      }
      var key = uploadKey(upload.scope, upload.id);
      if (uploadClaims.has(key)) throw Object.assign(new Error('Hay imágenes nuevas repetidas.'), { status: 400 });
      uploadClaims.set(key, claim);
    });

    uploadClaims.forEach(function (claim, key) {
      var scope = key.split(':')[0];
      var collection = scope === 'colombia' ? colombia : studies;
      var study = collection.find(function (item) { return item.id === claim.id; });
      if (!study || !study.imagen) throw Object.assign(new Error('La imagen nueva no corresponde a un estudio.'), { status: 400 });
      study.imagen.ruta = claim.path;
    });

    var currentSha = await github.currentSha();
    if (currentSha !== body.baseSha) {
      return http.send(res, 409, { error: 'Alguien publicó cambios mientras editabas. Recarga la página para ver la versión nueva.' });
    }

    var results = await Promise.all([
      github.commit(currentSha),
      github.file('data/estudios.json', currentSha),
      github.file('data/colombia.json', currentSha)
    ]);
    var currentCommit = results[0];
    var oldStudies = parseJson(results[1], 'estudios');
    var oldColombia = parseJson(results[2], 'estudios de Colombia');

    var blobs = await Promise.all([
      github.blob(Buffer.from(JSON.stringify(studies, null, 2) + '\n', 'utf8')),
      github.blob(Buffer.from(JSON.stringify(colombia, null, 2) + '\n', 'utf8'))
    ]);
    var entries = [
      { path: 'data/estudios.json', mode: '100644', type: 'blob', sha: blobs[0] },
      { path: 'data/colombia.json', mode: '100644', type: 'blob', sha: blobs[1] }
    ];
    uploadClaims.forEach(function (claim) {
      entries.push({ path: claim.path.replace(/^\//, ''), mode: '100644', type: 'blob', sha: claim.sha });
    });

    var oldPaths = imagePaths([oldStudies, oldColombia]);
    var newPaths = imagePaths([studies, colombia]);
    var claimedPaths = new Set(Array.from(uploadClaims.values()).map(function (claim) { return claim.path; }));
    newPaths.forEach(function (path) {
      if (!oldPaths.has(path) && !claimedPaths.has(path)) {
        throw Object.assign(new Error('Una imagen nueva no fue generada por el servidor.'), { status: 400 });
      }
    });
    oldPaths.forEach(function (path) {
      if (!newPaths.has(path)) entries.push({ path: path.replace(/^\//, ''), mode: '100644', type: 'blob', sha: null });
    });

    var newTree = await github.tree(currentCommit.tree.sha, entries);
    var newCommit = await github.createCommit(newTree.sha, currentSha);
    try { await github.updateRef(newCommit.sha); }
    catch (error) {
      if (error.status === 409 || error.status === 422) {
        return http.send(res, 409, { error: 'Alguien publicó cambios mientras editabas. Recarga la página para ver la versión nueva.' });
      }
      throw error;
    }
    http.send(res, 200, { sha: newCommit.sha });
  } catch (error) { http.handleError(res, error); }
};
