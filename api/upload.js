'use strict';

var crypto = require('node:crypto');
var http = require('./_lib/http');
var sessions = require('./_lib/session');
var github = require('./_lib/github');
var validation = require('./_lib/validation');

module.exports = async function upload(req, res) {
  try {
    http.method(req, 'POST');
    http.verifyOrigin(req);
    sessions.requireSession(req);
    var id = String(req.headers['x-study-id'] || '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 80) {
      throw Object.assign(new Error('El ID del estudio no es válido.'), { status: 400 });
    }
    var scope = String(req.headers['x-study-scope'] || 'studies');
    if (scope !== 'studies' && scope !== 'colombia') {
      throw Object.assign(new Error('La colección del estudio no es válida.'), { status: 400 });
    }
    var bytes = await http.rawBody(req, validation.MAX_IMAGE + 1);
    var type = validation.validateImageBytes(bytes);
    var hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    var directory = scope === 'colombia' ? 'colombia' : 'estudios';
    var path = '/assets/' + directory + '/' + id + '-' + hash + '.' + type.ext;
    var sha = await github.blob(bytes);
    var token = sessions.uploadToken({ id: id, scope: scope, path: path, sha: sha });
    http.send(res, 200, { path: path, sha: sha, token: token });
  } catch (error) { http.handleError(res, error); }
};
