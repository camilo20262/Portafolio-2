'use strict';

var crypto = require('node:crypto');

var COOKIE_NAME = 'portfolio_admin';
var EIGHT_HOURS = 8 * 60 * 60;

function secret() {
  var value = process.env.SESSION_SECRET || '';
  if (value.length < 32) throw Object.assign(new Error('SESSION_SECRET debe tener al menos 32 caracteres.'), { status: 500 });
  return value;
}

function signature(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(left, right) {
  var a = crypto.createHash('sha256').update(String(left)).digest();
  var b = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
}

function signPayload(payload) {
  var encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return encoded + '.' + signature(encoded);
}

function verifyPayload(token) {
  if (!token || typeof token !== 'string') return null;
  var parts = token.split('.');
  if (parts.length !== 2 || !safeEqual(signature(parts[0]), parts[1])) return null;
  try { return JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); }
  catch (error) { return null; }
}

function cookieValue(req) {
  var header = req.headers.cookie || '';
  var values = header.split(';');
  for (var i = 0; i < values.length; i++) {
    var pair = values[i].trim().split('=');
    if (pair.shift() === COOKIE_NAME) return decodeURIComponent(pair.join('='));
  }
  return '';
}

function readSession(req) {
  var value = verifyPayload(cookieValue(req));
  if (!value || value.purpose !== 'session' || !Number.isFinite(value.exp) || value.exp <= Math.floor(Date.now() / 1000)) return null;
  return value;
}

function requireSession(req) {
  var value = readSession(req);
  if (!value) throw Object.assign(new Error('Sesión no válida o vencida.'), { status: 401 });
  return value;
}

function sessionCookie() {
  var now = Math.floor(Date.now() / 1000);
  var token = signPayload({ purpose: 'session', exp: now + EIGHT_HOURS, nonce: crypto.randomBytes(16).toString('hex') });
  return COOKIE_NAME + '=' + encodeURIComponent(token) + '; Path=/; Max-Age=' + EIGHT_HOURS + '; HttpOnly; Secure; SameSite=Strict';
}

function clearCookie() {
  return COOKIE_NAME + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict';
}

function uploadToken(value) {
  return signPayload(Object.assign({ purpose: 'upload', exp: Math.floor(Date.now() / 1000) + EIGHT_HOURS }, value));
}

function readUploadToken(token) {
  var value = verifyPayload(token);
  if (!value || value.purpose !== 'upload' || value.exp <= Math.floor(Date.now() / 1000)) return null;
  return value;
}

module.exports = {
  safeEqual: safeEqual,
  readSession: readSession,
  requireSession: requireSession,
  sessionCookie: sessionCookie,
  clearCookie: clearCookie,
  uploadToken: uploadToken,
  readUploadToken: readUploadToken
};
