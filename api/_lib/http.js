'use strict';

function send(res, status, value, headers) {
  res.statusCode = status;
  Object.entries(headers || {}).forEach(function (entry) { res.setHeader(entry[0], entry[1]); });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

async function rawBody(req, limit) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > limit) throw Object.assign(new Error('La solicitud es demasiado grande.'), { status: 413 });
    return req.body;
  }
  if (typeof req.body === 'string') {
    var direct = Buffer.from(req.body);
    if (direct.length > limit) throw Object.assign(new Error('La solicitud es demasiado grande.'), { status: 413 });
    return direct;
  }
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body));
  var chunks = [];
  var total = 0;
  for await (var chunk of req) {
    var value = Buffer.from(chunk);
    total += value.length;
    if (total > limit) throw Object.assign(new Error('La solicitud es demasiado grande.'), { status: 413 });
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function jsonBody(req, limit) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  var raw = await rawBody(req, limit || 1024 * 1024);
  try { return JSON.parse(raw.toString('utf8')); }
  catch (error) { throw Object.assign(new Error('El cuerpo JSON no es válido.'), { status: 400 }); }
}

function verifyOrigin(req) {
  var origin = req.headers.origin;
  var host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin || !host) throw Object.assign(new Error('Origen no permitido.'), { status: 403 });
  var parsed;
  try { parsed = new URL(origin); }
  catch (error) { throw Object.assign(new Error('Origen no permitido.'), { status: 403 }); }
  if (parsed.host.toLowerCase() !== String(host).toLowerCase()) {
    throw Object.assign(new Error('Origen no permitido.'), { status: 403 });
  }
}

function method(req, expected) {
  if (req.method !== expected) throw Object.assign(new Error('Método no permitido.'), { status: 405 });
}

function handleError(res, error) {
  var status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
  if (status === 500) console.error(error);
  send(res, status, { error: status === 500 ? 'Error interno del servidor.' : error.message });
}

module.exports = { send: send, rawBody: rawBody, jsonBody: jsonBody, verifyOrigin: verifyOrigin, method: method, handleError: handleError };
