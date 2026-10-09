'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');

var root = path.resolve(__dirname, '..');
var core = require('../assets/js/studies-core');
var login = require('../api/login');
var save = require('../api/save');
var sessions = require('../api/_lib/session');
var validation = require('../api/_lib/validation');

process.env.ADMIN_PASSWORD = 'correct-password';
process.env.SESSION_SECRET = 'test-secret-with-at-least-thirty-two-characters';
process.env.GITHUB_TOKEN = 'github-test-token';
process.env.GITHUB_OWNER = 'owner';
process.env.GITHUB_REPO = 'repo';
process.env.GITHUB_BRANCH = 'main';

function canonical(fragment) {
  return fragment.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader: function (name, value) { this.headers[name.toLowerCase()] = value; },
    end: function (body) { this.body = body; this.json = body ? JSON.parse(body) : {}; }
  };
}

function request(method, body, extraHeaders) {
  return {
    method: method,
    body: body,
    headers: Object.assign({ origin: 'https://portfolio.example', host: 'portfolio.example' }, extraHeaders || {}),
    socket: { remoteAddress: '127.0.0.1' }
  };
}

async function authenticatedCookie() {
  var req = request('POST', { password: process.env.ADMIN_PASSWORD }, { 'x-forwarded-for': 'login-' + Math.random() });
  var res = response();
  await login(req, res);
  assert.equal(res.statusCode, 200);
  return res.headers['set-cookie'].split(';')[0];
}

test('la página pública reconstruye el HTML de los 16 estudios migrados', function () {
  var studies = JSON.parse(fs.readFileSync(path.join(root, 'data/estudios.json'), 'utf8'));
  var before = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/studies-before.json'), 'utf8'));
  var rendered = studies.map(function (study) { return canonical(core.buildStudy(study, false)); });
  assert.equal(rendered.length, 16);
  assert.deepEqual(rendered, before);
});

test('el inicio de sesión acepta la contraseña correcta y rechaza una incorrecta', async function () {
  var badRes = response();
  await login(request('POST', { password: 'wrong' }, { 'x-forwarded-for': 'bad-password-test' }), badRes);
  assert.equal(badRes.statusCode, 401);
  assert.equal(badRes.headers['set-cookie'], undefined);

  var goodRes = response();
  await login(request('POST', { password: process.env.ADMIN_PASSWORD }, { 'x-forwarded-for': 'good-password-test' }), goodRes);
  assert.equal(goodRes.statusCode, 200);
  assert.match(goodRes.headers['set-cookie'], /HttpOnly/);
  assert.match(goodRes.headers['set-cookie'], /Secure/);
  assert.match(goodRes.headers['set-cookie'], /SameSite=Strict/);
});

test('/api/save sin sesión responde 401', async function () {
  var res = response();
  await save(request('POST', {}), res);
  assert.equal(res.statusCode, 401);
});

test('crear, editar, reordenar y eliminar produce el JSON esperado', function () {
  var initial = [
    { id: 'a', categoria: 0, nombre: 'A' },
    { id: 'b', categoria: 0, nombre: 'B' },
    { id: 'c', categoria: 1, nombre: 'C' }
  ];
  var created = core.createStudy(initial, { id: 'd', categoria: 0, nombre: 'D' });
  assert.deepEqual(created.map(function (item) { return item.id; }), ['a', 'b', 'd', 'c']);
  var edited = core.updateStudy(created, 'd', { id: 'd', categoria: 0, nombre: 'D editado' });
  assert.equal(edited[2].nombre, 'D editado');
  var reordered = core.moveStudy(edited, 'd', -1);
  assert.deepEqual(reordered.map(function (item) { return item.id; }), ['a', 'd', 'b', 'c']);
  var removed = core.deleteStudy(reordered, 'a');
  assert.deepEqual(removed, [
    { id: 'd', categoria: 0, nombre: 'D editado' },
    { id: 'b', categoria: 0, nombre: 'B' },
    { id: 'c', categoria: 1, nombre: 'C' }
  ]);
});

test('un SHA base desactualizado responde 409 sin crear commits', async function () {
  var originalFetch = global.fetch;
  var calls = [];
  global.fetch = async function (url) {
    calls.push(String(url));
    return { ok: true, status: 200, json: async function () { return { object: { sha: '1'.repeat(40) } }; } };
  };
  try {
    var cookie = await authenticatedCookie();
    var studies = JSON.parse(fs.readFileSync(path.join(root, 'data/estudios.json'), 'utf8'));
    var res = response();
    await save(request('POST', { studies: studies, uploads: [], baseSha: '0'.repeat(40) }, { cookie: cookie }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/git\/ref\/heads\/main$/);
  } finally { global.fetch = originalFetch; }
});

test('la validación rechaza una imagen falsa y una imagen demasiado grande', function () {
  assert.throws(function () { validation.validateImageBytes(Buffer.from('this is not an image')); }, /no es una imagen/);
  var oversized = Buffer.alloc(validation.MAX_IMAGE + 1);
  oversized.write('RIFF', 0, 'ascii');
  oversized.write('WEBP', 8, 'ascii');
  assert.throws(function () { validation.validateImageBytes(oversized); }, /supera el máximo/);
});

test('los tokens de carga están firmados y detectan alteraciones', function () {
  var token = sessions.uploadToken({ id: 'study', path: '/assets/estudios/study-a.webp', sha: 'a'.repeat(40) });
  assert.equal(sessions.readUploadToken(token).id, 'study');
  assert.equal(sessions.readUploadToken(token.slice(0, -1) + 'x'), null);
});
