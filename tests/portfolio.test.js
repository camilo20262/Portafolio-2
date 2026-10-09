'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');

var root = path.resolve(__dirname, '..');
var core = require('../assets/js/studies-core');
var login = require('../api/login');
var save = require('../api/save');
var upload = require('../api/upload');
var sessions = require('../api/_lib/session');
var validation = require('../api/_lib/validation');

process.env.ADMIN_PASSWORD = 'correct-password';
process.env.SESSION_SECRET = 'test-secret-with-at-least-thirty-two-characters';
process.env.GITHUB_TOKEN = 'github-test-token';
process.env.GITHUB_OWNER = 'owner';
process.env.GITHUB_REPO = 'repo';
process.env.GITHUB_BRANCH = 'main';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
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

function githubResponse(data, status) {
  return {
    ok: !status || status < 400,
    status: status || 200,
    json: async function () { return data; }
  };
}

test('estudios.json contiene solo los tres estudios pedidos en Marca & Campaña', function () {
  var studies = readJson('data/estudios.json');
  assert.deepEqual(studies.map(function (study) { return study.id; }), ['lift', 'preview-starview', 'mmm']);
  assert.deepEqual(studies.map(function (study) { return study.categoria; }), [0, 0, 0]);
  assert.equal(studies[0].nombre, 'Media BI Lift');
  assert.equal(studies[1].nombre, 'Preview · Starview');
  assert.deepEqual(studies[2], {
    id: 'mmm',
    categoria: 0,
    nombre: 'MMM · Marketing Mix Modeling',
    frase: 'Mide cuánto aporta cada medio a los resultados del negocio para optimizar la inversión.',
    puntos: [], tiempos: [], etiquetas: [], imagen: null, intro: '', secciones: [], cronograma: [], datos: []
  });
  assert.doesNotMatch(core.buildStudy(studies[2], false), /data-open/);
});

test('las categorías vacías se ocultan en público y aparecen en edición', function () {
  var studies = readJson('data/estudios.json');
  assert.deepEqual(core.visibleCategoryIndexes(studies, false), [0]);
  assert.deepEqual(core.visibleCategoryIndexes(studies, true), [0, 1, 2, 3]);
});

test('la sección de Colombia renderiza sus dos estudios y el mismo acceso al detalle', function () {
  var colombia = readJson('data/colombia.json');
  assert.equal(colombia.length, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(colombia[0], 'categoria'), false);
  var html = colombia.map(function (study, index) { return core.buildColombiaStudy(study, index, false); }).join('');
  assert.match(html, /01/);
  assert.match(html, /02/);
  assert.match(html, /Hábitos de uso del efectivo en Colombia/);
  assert.match(html, /Hábitos y usos del dinero en Colombia/);
  assert.equal((html.match(/data-detail-label="Mercado de Colombia"/g) || []).length, 2);
  assert.equal((html.match(/data-open/g) || []).length, 2);
});

test('la sección de Colombia no se muestra vacía salvo durante la edición', function () {
  assert.equal(core.shouldShowColombia([], false), false);
  assert.equal(core.shouldShowColombia([], true), true);
  assert.equal(core.shouldShowColombia([{}], false), true);
});

test('crear, editar, reordenar y eliminar estudios de Colombia conserva un arreglo sin categoría', function () {
  var initial = [
    { id: 'a', nombre: 'A' },
    { id: 'b', nombre: 'B' }
  ];
  var created = core.createStudy(initial, { id: 'c', nombre: 'C' });
  assert.deepEqual(created.map(function (item) { return item.id; }), ['a', 'b', 'c']);
  var edited = core.updateStudy(created, 'c', { id: 'c', nombre: 'C editado' });
  assert.equal(edited[2].nombre, 'C editado');
  var reordered = core.moveStudy(edited, 'c', -1);
  assert.deepEqual(reordered.map(function (item) { return item.id; }), ['a', 'c', 'b']);
  var removed = core.deleteStudy(reordered, 'a');
  assert.deepEqual(removed, [{ id: 'c', nombre: 'C editado' }, { id: 'b', nombre: 'B' }]);
  assert.equal(removed.some(function (item) { return 'categoria' in item; }), false);
});

test('la página incluye el título, subtítulo, enlace y sección de Colombia solicitados', function () {
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<title>Propuesta BBVA · WPP Media<\/title>/);
  assert.match(html, /Estos son los estudios que proponemos para BBVA\./);
  assert.match(html, /href="#colombia">Colombia<\/a>/);
  assert.match(html, /id="colombia"/);
  assert.match(html, /Estudios hechos para el mercado de Colombia/);
  assert.ok(html.indexOf('id="estudios"') < html.indexOf('id="colombia"'));
  assert.ok(html.indexOf('id="colombia"') < html.indexOf('</main>'));
});

test('la validación acepta colombia.json y rechaza categoría o rutas de otra colección', function () {
  var colombia = readJson('data/colombia.json');
  var valid = validation.validateColombia(colombia);
  assert.equal(valid.length, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(valid[0], 'categoria'), false);

  var withCategory = JSON.parse(JSON.stringify(colombia));
  withCategory[0].categoria = 0;
  assert.throws(function () { validation.validateColombia(withCategory); }, /no debe incluir categoría/);

  var wrongPath = JSON.parse(JSON.stringify(colombia));
  wrongPath[0].imagen.ruta = '/assets/estudios/habitos-efectivo.webp';
  assert.throws(function () { validation.validateColombia(wrongPath); }, /ruta de imagen/i);
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

test('un SHA base desactualizado responde 409 sin crear commits', async function () {
  var originalFetch = global.fetch;
  var calls = [];
  global.fetch = async function (url) {
    calls.push(String(url));
    return githubResponse({ object: { sha: '1'.repeat(40) } });
  };
  try {
    var cookie = await authenticatedCookie();
    var res = response();
    await save(request('POST', {
      studies: readJson('data/estudios.json'),
      colombia: readJson('data/colombia.json'),
      uploads: [],
      baseSha: '0'.repeat(40)
    }, { cookie: cookie }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/git\/ref\/heads\/main$/);
  } finally { global.fetch = originalFetch; }
});

test('/api/save guarda estudios.json y colombia.json en un solo commit atómico', async function () {
  var originalFetch = global.fetch;
  var baseSha = '1'.repeat(40);
  var treeSha = '2'.repeat(40);
  var newTreeSha = '3'.repeat(40);
  var newCommitSha = '4'.repeat(40);
  var studies = readJson('data/estudios.json');
  var colombia = readJson('data/colombia.json');
  var calls = [];
  var blobIndex = 0;

  global.fetch = async function (url, options) {
    var method = options && options.method || 'GET';
    var body = options && options.body ? JSON.parse(options.body) : null;
    calls.push({ url: String(url), method: method, body: body });
    if (/\/git\/ref\/heads\/main$/.test(url) && method === 'GET') return githubResponse({ object: { sha: baseSha } });
    if (/\/git\/commits\//.test(url) && method === 'GET') return githubResponse({ tree: { sha: treeSha } });
    if (/\/contents\/data\/estudios\.json/.test(url)) return githubResponse({ encoding: 'base64', content: Buffer.from(JSON.stringify(studies)).toString('base64') });
    if (/\/contents\/data\/colombia\.json/.test(url)) return githubResponse({ encoding: 'base64', content: Buffer.from(JSON.stringify(colombia)).toString('base64') });
    if (/\/git\/blobs$/.test(url) && method === 'POST') return githubResponse({ sha: String(++blobIndex).padStart(40, 'a') });
    if (/\/git\/trees$/.test(url) && method === 'POST') return githubResponse({ sha: newTreeSha });
    if (/\/git\/commits$/.test(url) && method === 'POST') return githubResponse({ sha: newCommitSha });
    if (/\/git\/refs\/heads\/main$/.test(url) && method === 'PATCH') return githubResponse({ object: { sha: newCommitSha } });
    throw new Error('Llamada GitHub no simulada: ' + method + ' ' + url);
  };

  try {
    var cookie = await authenticatedCookie();
    var res = response();
    await save(request('POST', { studies: studies, colombia: colombia, uploads: [], baseSha: baseSha }, { cookie: cookie }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json.sha, newCommitSha);

    var treeCalls = calls.filter(function (call) { return call.method === 'POST' && /\/git\/trees$/.test(call.url); });
    var commitCalls = calls.filter(function (call) { return call.method === 'POST' && /\/git\/commits$/.test(call.url); });
    assert.equal(treeCalls.length, 1);
    assert.equal(commitCalls.length, 1);
    assert.deepEqual(treeCalls[0].body.tree.slice(0, 2).map(function (entry) { return entry.path; }), ['data/estudios.json', 'data/colombia.json']);
    assert.deepEqual(commitCalls[0].body.parents, [baseSha]);
  } finally { global.fetch = originalFetch; }
});

test('/api/upload genera rutas firmadas dentro de assets/colombia', async function () {
  var originalFetch = global.fetch;
  global.fetch = async function (url, options) {
    assert.match(String(url), /\/git\/blobs$/);
    assert.equal(options.method, 'POST');
    return githubResponse({ sha: 'a'.repeat(40) });
  };
  try {
    var cookie = await authenticatedCookie();
    var image = Buffer.alloc(12);
    image.write('RIFF', 0, 'ascii');
    image.write('WEBP', 8, 'ascii');
    var res = response();
    await upload(request('POST', image, {
      cookie: cookie,
      'content-type': 'image/webp',
      'x-study-id': 'nuevo-estudio',
      'x-study-scope': 'colombia'
    }), res);
    assert.equal(res.statusCode, 200);
    assert.match(res.json.path, /^\/assets\/colombia\/nuevo-estudio-[a-f0-9]{12}\.webp$/);
    var claim = sessions.readUploadToken(res.json.token);
    assert.equal(claim.scope, 'colombia');
    assert.equal(claim.path, res.json.path);
  } finally { global.fetch = originalFetch; }
});

test('la validación rechaza una imagen falsa y una imagen demasiado grande', function () {
  assert.throws(function () { validation.validateImageBytes(Buffer.from('this is not an image')); }, /no es una imagen/);
  var oversized = Buffer.alloc(validation.MAX_IMAGE + 1);
  oversized.write('RIFF', 0, 'ascii');
  oversized.write('WEBP', 8, 'ascii');
  assert.throws(function () { validation.validateImageBytes(oversized); }, /supera el máximo/);
});

test('los tokens de carga están firmados, incluyen colección y detectan alteraciones', function () {
  var token = sessions.uploadToken({ id: 'study', scope: 'colombia', path: '/assets/colombia/study-a.webp', sha: 'a'.repeat(40) });
  assert.equal(sessions.readUploadToken(token).scope, 'colombia');
  assert.equal(sessions.readUploadToken(token.slice(0, -1) + 'x'), null);
});
