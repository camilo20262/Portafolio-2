'use strict';

var http = require('./_lib/http');
var sessions = require('./_lib/session');

module.exports = async function logout(req, res) {
  try {
    http.method(req, 'POST');
    http.verifyOrigin(req);
    sessions.requireSession(req);
    res.setHeader('Set-Cookie', sessions.clearCookie());
    http.send(res, 200, { ok: true });
  } catch (error) { http.handleError(res, error); }
};
