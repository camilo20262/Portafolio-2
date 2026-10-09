'use strict';

var http = require('./_lib/http');
var sessions = require('./_lib/session');

var attempts = new Map();
var WINDOW_MS = 15 * 60 * 1000;
var MAX_ATTEMPTS = 5;

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function activeAttempt(key) {
  var value = attempts.get(key);
  if (value && value.resetAt > Date.now()) return value;
  attempts.delete(key);
  return { count: 0, resetAt: Date.now() + WINDOW_MS };
}

module.exports = async function login(req, res) {
  try {
    http.method(req, 'POST');
    http.verifyOrigin(req);
    var configured = process.env.ADMIN_PASSWORD || '';
    if (!configured) throw Object.assign(new Error('Falta configurar ADMIN_PASSWORD.'), { status: 500 });
    var key = clientKey(req);
    var record = activeAttempt(key);
    if (record.count >= MAX_ATTEMPTS) {
      res.setHeader('Retry-After', String(Math.ceil((record.resetAt - Date.now()) / 1000)));
      throw Object.assign(new Error('Demasiados intentos. Espera unos minutos antes de volver a intentar.'), { status: 429 });
    }
    var body = await http.jsonBody(req, 4096);
    var candidate = typeof body.password === 'string' ? body.password : '';
    if (!sessions.safeEqual(candidate, configured)) {
      record.count += 1;
      attempts.set(key, record);
      throw Object.assign(new Error('Contraseña incorrecta.'), { status: 401 });
    }
    attempts.delete(key);
    res.setHeader('Set-Cookie', sessions.sessionCookie());
    http.send(res, 200, { ok: true });
  } catch (error) { http.handleError(res, error); }
};

module.exports._attempts = attempts;
