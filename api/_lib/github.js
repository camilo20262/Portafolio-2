'use strict';

function config() {
  var required = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
  required.forEach(function (name) {
    if (!process.env[name]) throw Object.assign(new Error('Falta configurar ' + name + '.'), { status: 500 });
  });
  return {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH || 'main'
  };
}

async function call(path, options) {
  var cfg = config();
  var response = await fetch('https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) + path, {
    method: options && options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + cfg.token,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'wpp-portfolio-editor',
      'Content-Type': 'application/json'
    },
    body: options && options.body ? JSON.stringify(options.body) : undefined
  });
  var data = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    var error = new Error(data.message || 'GitHub rechazó la solicitud.');
    error.status = response.status;
    error.github = data;
    throw error;
  }
  return data;
}

async function currentSha() {
  var cfg = config();
  var ref = await call('/git/ref/heads/' + encodeURIComponent(cfg.branch));
  return ref.object.sha;
}

async function commit(sha) { return call('/git/commits/' + encodeURIComponent(sha)); }

async function file(path, ref) {
  var data = await call('/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(ref));
  if (data.encoding !== 'base64') throw Object.assign(new Error('GitHub devolvió un archivo en un formato inesperado.'), { status: 502 });
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
}

async function blob(buffer) {
  var data = await call('/git/blobs', { method: 'POST', body: { content: Buffer.from(buffer).toString('base64'), encoding: 'base64' } });
  return data.sha;
}

async function tree(baseTree, entries) {
  return call('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree: entries } });
}

async function createCommit(treeSha, parentSha) {
  return call('/git/commits', {
    method: 'POST',
    body: { message: 'Portafolio: actualiza estudios desde el editor', tree: treeSha, parents: [parentSha] }
  });
}

async function updateRef(sha) {
  var cfg = config();
  return call('/git/refs/heads/' + encodeURIComponent(cfg.branch), { method: 'PATCH', body: { sha: sha, force: false } });
}

module.exports = { config: config, currentSha: currentSha, commit: commit, file: file, blob: blob, tree: tree, createCommit: createCommit, updateRef: updateRef };
