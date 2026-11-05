// Optional access control: who is asking, and which profiles they may see.
//
// Off by default, so an install that sets nothing behaves exactly as before:
// every request is trusted and every profile is visible to everyone.
//
// It turns on with SERVE_SOCKET. The server then also listens on that unix
// socket, and only there does it believe an identity header (IDENTITY_HEADER,
// default `Tailscale-User-Login`). The intended front end is `tailscale serve`
// pointed at the socket: tailscaled is the only thing that connects to it, and
// serve sets that header to the caller's tailnet login, replacing any copy the
// caller sent. Any reverse proxy that does the same works too.
//
// The TCP port never believes the header, because anything on the Docker
// network or the host could send it there. With SERVE_SOCKET set the TCP port
// answers /healthz alone (for container healthchecks and uptime monitors).
//
// On the socket:
//   - the login must be in ALLOWED_USERS, or the request is refused;
//   - a profile is visible only to the logins in its `owners` list in
//     users.json. A profile created through the socket is owned by its creator.
//     Profiles created before access control was turned on have no owners and
//     are hidden until you add `"owners": ["<login>"]` to them in users.json;
//   - a write (anything but GET/HEAD/OPTIONS) from a browser must come from the
//     dashboard's own pages. Browsers always send Sec-Fetch-Site; apps such as
//     Health Auto Export send none and are not affected.
//
// DEV_USER stands in for the login on the TCP port during development. It is
// refused when SERVE_SOCKET is set, so it cannot leak into a real deployment.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function list(value) {
  return [...new Set(String(value ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))]
}

export function loadAuthConfig(env = process.env) {
  const cfg = {
    serveSocket: env.SERVE_SOCKET?.trim() || null,
    identityHeader: (env.IDENTITY_HEADER?.trim() || 'tailscale-user-login').toLowerCase(),
    allowedUsers: list(env.ALLOWED_USERS),
    devUser: env.DEV_USER?.trim().toLowerCase() || null,
  }
  if (cfg.serveSocket && cfg.devUser) {
    throw new Error('DEV_USER is for development only and is refused when SERVE_SOCKET is set')
  }
  if (cfg.serveSocket && cfg.allowedUsers.length === 0) {
    throw new Error('SERVE_SOCKET is set but ALLOWED_USERS is empty: nobody could open the dashboard')
  }
  if (!cfg.serveSocket && cfg.allowedUsers.length > 0 && !cfg.devUser) {
    throw new Error('ALLOWED_USERS is set without SERVE_SOCKET: logins are only believed on the socket, so it would protect nothing')
  }
  cfg.enabled = Boolean(cfg.serveSocket || cfg.devUser)
  return cfg
}

/** The caller's login: the header on the socket, DEV_USER on TCP, else null. */
export function identityOf(req, cfg) {
  if (req.door === 'socket') {
    const raw = req.headers[cfg.identityHeader]
    return String(Array.isArray(raw) ? raw[0] : raw ?? '').trim().toLowerCase() || null
  }
  return cfg.devUser
}

/** Express middleware that admits or refuses a request before any route runs. */
export function gate(cfg, log = console) {
  return (req, res, next) => {
    if (!cfg.enabled) return next()
    if (req.path === '/healthz') return next()

    const refuse = (status, message) => {
      if (req.path.startsWith('/api/')) return res.status(status).json({ error: message })
      return res.status(status).type('text/plain').send(message)
    }

    if (req.door !== 'socket' && !cfg.devUser) return refuse(404, 'Not here.')

    const who = identityOf(req, cfg)
    if (!who || (req.door === 'socket' && !cfg.allowedUsers.includes(who))) {
      log.warn?.(`[auth] refused ${req.method} ${req.path} from ${who ?? 'no login'} on ${req.door}`)
      return refuse(403, 'This dashboard is not open to you.')
    }

    if (!SAFE_METHODS.has(req.method)) {
      const site = req.headers['sec-fetch-site']
      if (site && site !== 'same-origin' && site !== 'none') {
        log.warn?.(`[auth] refused cross-site ${req.method} ${req.path} from ${who}`)
        return refuse(403, 'Send this from the dashboard itself.')
      }
    }

    req.who = who
    next()
  }
}

/** Whether the caller may see this profile. Everyone may when access control is off. */
export function canSee(profile, req, cfg) {
  if (!cfg.enabled) return true
  return Array.isArray(profile?.owners) && profile.owners.includes(req.who)
}

/** Profiles nobody can see once access control is on, for a warning at boot. */
export function unownedProfiles(users) {
  return users.filter(u => !Array.isArray(u.owners) || u.owners.length === 0).map(u => u.id)
}

/** Normalise an `owners` value from a request: a non-empty list of logins, or null. */
export function parseOwners(value) {
  if (!Array.isArray(value)) return null
  const owners = list(value.filter(v => typeof v === 'string').join(','))
  return owners.length ? owners : null
}
