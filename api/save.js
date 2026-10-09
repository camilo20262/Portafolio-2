'use strict';

var http = require('./_lib/http');
var sessions = require('./_lib/session');
var github = require('./_lib/github');
var validation = require('./_lib/validation');

function imagePaths(studies) {
  return new Set(studies.filter(function (study) { return study.imagen; }).map(function (study) { return study.imagen.ruta; }));
}

module.exports = async function save(req, res) {
  try {
    http.method(req, 'POST');
    http.verifyOrigin(req);
    sessions.requireSession(req);
    var body = await http.jsonBody(req, 1024 * 1024);
    if (!body || typeof body !== 'object') throw Object.assign(new Error('La solicitud no es válida.'), { status: 400 });
    if (typeof body.baseSha !== 'string' || !/^[a-f0-9]{40}$/i.test(body.baseSha)) {
      throw Object.assign(new Error('El SHA base no es válido.'), { status: 400 });
    }
    var studies = validation.validateStudies(body.studies);
    var uploads = Array.isArray(body.uploads) ? body.uploads : [];
    if (uploads.length > studies.length) throw Object.assign(new Error('Hay demasiadas imágenes nuevas.'), { status: 400 });
    var uploadClaims = new Map();
    uploads.forEach(function (upload) {
      if (!upload || typeof upload.id !== 'string' || typeof upload.token !== 'string') {
        throw Object.assign(new Error('Una referencia de imagen no es válida.'), { status: 400 });
      }
      var claim = sessions.readUploadToken(upload.token);
      if (!claim || claim.id !== upload.id || !/^[a-f0-9]{40}$/i.test(claim.sha || '') ||
          !/^\/assets\/estudios\/[a-z0-9-]+\.(webp|png|jpe?g)$/.test(claim.path || '')) {
        throw Object.assign(new Error('Una referencia de imagen venció o fue alterada.'), { status: 400 });
      }
      if (uploadClaims.has(upload.id)) throw Object.assign(new Error('Hay imágenes nuevas repetidas.'), { status: 400 });
      uploadClaims.set(upload.id, claim);
    });
    studies.forEach(function (study) {
      var claim = uploadClaims.get(study.id);
      if (claim) {
        if (!study.imagen) throw Object.assign(new Error('La imagen nueva no corresponde a un estudio.'), { status: 400 });
        study.imagen.ruta = claim.path;
      }
    });

    var currentSha = await github.currentSha();
    if (currentSha !== body.baseSha) {
      return http.send(res, 409, { error: 'Alguien publicó cambios mientras editabas. Recarga la página para ver la versión nueva.' });
    }

    var results = await Promise.all([github.commit(currentSha), github.file('data/estudios.json', currentSha)]);
    var currentCommit = results[0];
    var oldStudies;
    try { oldStudies = JSON.parse(results[1]); }
    catch (error) { throw Object.assign(new Error('El archivo actual de estudios no es JSON válido.'), { status: 502 }); }

    var json = Buffer.from(JSON.stringify(studies, null, 2) + '\n', 'utf8');
    var jsonSha = await github.blob(json);
    var entries = [{ path: 'data/estudios.json', mode: '100644', type: 'blob', sha: jsonSha }];
    uploadClaims.forEach(function (claim) {
      entries.push({ path: claim.path.replace(/^\//, ''), mode: '100644', type: 'blob', sha: claim.sha });
    });
    var oldPaths = imagePaths(oldStudies);
    var newPaths = imagePaths(studies);
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
