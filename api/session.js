'use strict';

var http = require('./_lib/http');
var sessions = require('./_lib/session');
var github = require('./_lib/github');

module.exports = async function session(req, res) {
  try {
    http.method(req, 'GET');
    sessions.requireSession(req);
    var sha = await github.currentSha();
    http.send(res, 200, { authenticated: true, sha: sha });
  } catch (error) { http.handleError(res, error); }
};
