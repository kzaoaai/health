import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadAuthConfig, identityOf, gate, canSee, unownedProfiles, parseOwners } from '../auth.js'

const ON = { SERVE_SOCKET: '/run/health/serve.sock', ALLOWED_USERS: 'Me@Example.test, you@example.test' }
const quiet = { warn: () => {} }

// Runs the middleware against a fake request; resolves to 'next' or { status, body }.
function run(cfg, { door = 'socket', login, method = 'GET', path = '/api/users', site } = {}) {
  const headers = {}
  if (login !== undefined) headers['tailscale-user-login'] = login
  if (site) headers['sec-fetch-site'] = site
  const req = { door, method, path, headers }
  return new Promise(resolve => {
    const res = {
      code: 200,
      status(c) { this.code = c; return this },
      type() { return this },
      json(b) { resolve({ status: this.code, body: b }) },
      send(b) { resolve({ status: this.code, body: b }) },
    }
    gate(cfg, quiet)(req, res, () => resolve({ next: true, who: req.who }))
  })
}

test('loadAuthConfig: off by default, and the combinations that would protect nothing are refused', () => {
  assert.equal(loadAuthConfig({}).enabled, false)
  assert.deepEqual(loadAuthConfig(ON).allowedUsers, ['me@example.test', 'you@example.test'])
  assert.equal(loadAuthConfig(ON).enabled, true)
  assert.throws(() => loadAuthConfig({ SERVE_SOCKET: '/s' }), /ALLOWED_USERS is empty/)
  assert.throws(() => loadAuthConfig({ ...ON, DEV_USER: 'me@example.test' }), /DEV_USER/)
  assert.throws(() => loadAuthConfig({ ALLOWED_USERS: 'me@example.test' }), /without SERVE_SOCKET/)
  assert.equal(loadAuthConfig({ DEV_USER: 'Dev@Example.test' }).devUser, 'dev@example.test')
})

test('gate: off means every request passes, on any door', async () => {
  const cfg = loadAuthConfig({})
  assert.equal((await run(cfg, { door: 'tcp' })).next, true)
  assert.equal((await run(cfg, { door: 'tcp', method: 'POST', site: 'cross-site' })).next, true)
})

test('gate: the socket admits allowed logins only, case-insensitively', async () => {
  const cfg = loadAuthConfig(ON)
  const ok = await run(cfg, { login: 'ME@example.test' })
  assert.equal(ok.next, true)
  assert.equal(ok.who, 'me@example.test')
  assert.equal((await run(cfg, { login: 'stranger@example.test' })).status, 403)
  assert.equal((await run(cfg, {})).status, 403)
  assert.equal((await run(cfg, { login: '' })).status, 403)
})

test('gate: the TCP port never believes the header and serves /healthz alone', async () => {
  const cfg = loadAuthConfig(ON)
  assert.equal((await run(cfg, { door: 'tcp', login: 'me@example.test' })).status, 404)
  assert.equal((await run(cfg, { door: 'tcp', path: '/' })).status, 404)
  assert.equal((await run(cfg, { door: 'tcp', path: '/healthz' })).next, true)
})

test('gate: browser writes must be same-origin; apps without Sec-Fetch-Site pass', async () => {
  const cfg = loadAuthConfig(ON)
  const login = 'me@example.test'
  assert.equal((await run(cfg, { login, method: 'POST', site: 'cross-site' })).status, 403)
  assert.equal((await run(cfg, { login, method: 'DELETE', site: 'same-site' })).status, 403)
  assert.equal((await run(cfg, { login, method: 'POST', site: 'same-origin' })).next, true)
  assert.equal((await run(cfg, { login, method: 'POST' })).next, true)  // Health Auto Export
  assert.equal((await run(cfg, { login, method: 'GET', site: 'cross-site' })).next, true)
})

test('gate: DEV_USER stands in on TCP in development', async () => {
  const cfg = loadAuthConfig({ DEV_USER: 'dev@example.test' })
  const r = await run(cfg, { door: 'tcp', login: 'someone-else@example.test' })
  assert.equal(r.next, true)
  assert.equal(r.who, 'dev@example.test')
})

test('identityOf: takes the first value when a header repeats', () => {
  const cfg = loadAuthConfig(ON)
  assert.equal(identityOf({ door: 'socket', headers: { 'tailscale-user-login': ['A@x.test', 'b@x.test'] } }, cfg), 'a@x.test')
  assert.equal(identityOf({ door: 'tcp', headers: { 'tailscale-user-login': 'a@x.test' } }, cfg), null)
})

test('canSee: owners only when on; everyone when off', () => {
  const on = loadAuthConfig(ON)
  const off = loadAuthConfig({})
  const mine = { id: 'mine', owners: ['me@example.test'] }
  const legacy = { id: 'legacy' }
  assert.equal(canSee(mine, { who: 'me@example.test' }, on), true)
  assert.equal(canSee(mine, { who: 'you@example.test' }, on), false)
  assert.equal(canSee(legacy, { who: 'me@example.test' }, on), false)
  assert.equal(canSee(legacy, {}, off), true)
  assert.deepEqual(unownedProfiles([mine, legacy, { id: 'empty', owners: [] }]), ['legacy', 'empty'])
})

test('parseOwners: a non-empty, normalised list or null', () => {
  assert.deepEqual(parseOwners([' A@x.test', 'a@x.test', 'b@x.test', 3]), ['a@x.test', 'b@x.test'])
  assert.equal(parseOwners([]), null)
  assert.equal(parseOwners('a@x.test'), null)
})
