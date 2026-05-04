#!/bin/bash
# Idempotent Keycloak bootstrap: creates the realm, client, roles, audience
# mapper, and (optionally) a dev user. Invoked automatically by the
# keycloak-bootstrap compose service once the keycloak service is healthy.
#
# All values are env-var driven so the same script runs in dev and prod.
set -euo pipefail

REALM="${REALM_NAME:-tariq}"
CLIENT_ID="${CLIENT_ID:-tariq-web}"
AUDIENCE="${AUDIENCE:-tariq-api}"
APP_ORIGIN="${APP_ORIGIN:-http://localhost:3000}"
SERVER_URL="${KC_SERVER_URL:-http://localhost:8080}"
ADMIN_USER="${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${KC_BOOTSTRAP_ADMIN_PASSWORD:?KC_BOOTSTRAP_ADMIN_PASSWORD is required}"

KCADM="/opt/keycloak/bin/kcadm.sh"

log() { echo "[bootstrap] $*"; }
err() { echo "[bootstrap][ERROR] $*" >&2; }

# ---- Pre-flight credential guards ----
# Refuse to run with documented placeholder passwords. Anyone copying
# .env.docker.example without replacing these would otherwise stand up a
# Keycloak with publicly-known admin credentials.
case "${ADMIN_PASSWORD}" in
  change-me|change-me-to-a-strong-password|dev-admin-pw|admin|__GENERATE_RANDOM_32_CHAR_PASSWORD__)
    err "KC_BOOTSTRAP_ADMIN_PASSWORD is set to a placeholder value."
    err "Generate a strong random password (e.g. 'openssl rand -base64 32') and set it in .env.docker."
    exit 1
    ;;
esac

# Refuse to create a dev user against a non-localhost Keycloak deployment.
# KC_HOSTNAME is only injected into this container if the operator opts in
# via docker-compose.yml; when unset/empty we assume a local dev run.
if [ "${CREATE_DEV_USER:-false}" = "true" ]; then
  KC_HOSTNAME_VAL="${KC_HOSTNAME:-}"
  case "${KC_HOSTNAME_VAL}" in
    ""|localhost|127.0.0.1)
      ;;
    *)
      err "Refusing to bootstrap: CREATE_DEV_USER=true with KC_HOSTNAME='${KC_HOSTNAME_VAL}'."
      err "Auto-creating a dev user is unsafe outside localhost. Set CREATE_DEV_USER=false in production."
      exit 1
      ;;
  esac

  if [ "${DEV_USER_PASSWORD:-}" = "ChangeMe123!" ]; then
    err "DEV_USER_PASSWORD is set to the documented default 'ChangeMe123!'."
    err "Override DEV_USER_PASSWORD in .env.docker before enabling CREATE_DEV_USER, or set CREATE_DEV_USER=false."
    exit 1
  fi
fi

# ---- Authenticate without leaking the password via argv ----
# kcadm.sh exposes --password on argv, which appears in `ps`, container logs,
# and any audit tooling that captures process args. Pipe the password into
# the interactive prompt instead so it never crosses the argv boundary.
kc_login() {
  printf '%s\n' "${ADMIN_PASSWORD}" | "${KCADM}" config credentials \
    --server "${SERVER_URL}" --realm master --user "${ADMIN_USER}" \
    >/dev/null 2>&1
}

log "Waiting for Keycloak at ${SERVER_URL}..."
for i in {1..30}; do
  if kc_login; then
    log "Authenticated as ${ADMIN_USER}."
    break
  fi
  sleep 2
done

# ---- Realm ----
if "${KCADM}" get "realms/${REALM}" >/dev/null 2>&1; then
  log "Realm '${REALM}' already exists — updating settings."
else
  log "Creating realm '${REALM}'."
  "${KCADM}" create realms -s realm="${REALM}" -s enabled=true
fi

"${KCADM}" update "realms/${REALM}" \
  -s registrationAllowed=true \
  -s registrationEmailAsUsername=true \
  -s loginWithEmailAllowed=true \
  -s duplicateEmailsAllowed=false \
  -s resetPasswordAllowed=true \
  -s rememberMe=true \
  -s verifyEmail=false \
  -s internationalizationEnabled=true \
  -s 'supportedLocales=["en","fa"]' \
  -s defaultLocale=en \
  -s accessTokenLifespan=300 \
  -s ssoSessionIdleTimeout=1800 \
  -s ssoSessionMaxLifespan=36000

# ---- Realm roles ----
for role in admin user; do
  if "${KCADM}" get "roles" -r "${REALM}" --fields name | grep -q "\"${role}\""; then
    log "Role '${role}' already exists."
  else
    log "Creating realm role '${role}'."
    "${KCADM}" create roles -r "${REALM}" -s name="${role}"
  fi
done

# Set 'user' as default realm role (assigned to every new user).
DEFAULT_ROLE_NAME="default-roles-${REALM}"
log "Ensuring '${DEFAULT_ROLE_NAME}' composite includes 'user'."
"${KCADM}" add-roles -r "${REALM}" --rname "${DEFAULT_ROLE_NAME}" --rolename user >/dev/null 2>&1 || true

# ---- Client ----
CLIENT_UUID=$("${KCADM}" get clients -r "${REALM}" -q clientId="${CLIENT_ID}" --fields id --format csv --noquotes | tail -n +2 | head -n 1)
if [ -n "${CLIENT_UUID}" ]; then
  log "Client '${CLIENT_ID}' already exists (id=${CLIENT_UUID}) — updating."
else
  log "Creating public client '${CLIENT_ID}' with PKCE."
  CLIENT_UUID=$("${KCADM}" create clients -r "${REALM}" \
    -s clientId="${CLIENT_ID}" \
    -s enabled=true \
    -s publicClient=true \
    -s standardFlowEnabled=true \
    -s directAccessGrantsEnabled=false \
    -s serviceAccountsEnabled=false \
    -s protocol=openid-connect \
    -i)
fi

"${KCADM}" update "clients/${CLIENT_UUID}" -r "${REALM}" \
  -s "redirectUris=[\"${APP_ORIGIN}/api/auth/callback\"]" \
  -s "webOrigins=[\"${APP_ORIGIN}\"]" \
  -s 'attributes."pkce.code.challenge.method"=S256' \
  -s "attributes.\"post.logout.redirect.uris\"=\"${APP_ORIGIN}/*\""

# ---- Audience mapper (so backend can validate aud=${AUDIENCE}) ----
MAPPER_NAME="${AUDIENCE}-audience"
EXISTING_MAPPER=$("${KCADM}" get "clients/${CLIENT_UUID}/protocol-mappers/models" -r "${REALM}" --fields name,id --format csv --noquotes | grep "^${MAPPER_NAME}," || true)
if [ -z "${EXISTING_MAPPER}" ]; then
  log "Adding audience mapper '${MAPPER_NAME}'."
  "${KCADM}" create "clients/${CLIENT_UUID}/protocol-mappers/models" -r "${REALM}" \
    -s name="${MAPPER_NAME}" \
    -s protocol=openid-connect \
    -s protocolMapper=oidc-audience-mapper \
    -s "config.\"included.custom.audience\"=${AUDIENCE}" \
    -s 'config."id.token.claim"=false' \
    -s 'config."access.token.claim"=true'
else
  log "Audience mapper '${MAPPER_NAME}' already exists."
fi

# ---- Optional dev user ----
if [ "${CREATE_DEV_USER:-false}" = "true" ]; then
  DEV_EMAIL="${DEV_USER_EMAIL:-demo@example.com}"
  DEV_PASSWORD="${DEV_USER_PASSWORD:-ChangeMe123!}"
  DEV_ROLE="${DEV_USER_ROLE:-user}"
  EXISTING_USER=$("${KCADM}" get users -r "${REALM}" -q username="${DEV_EMAIL}" --fields id --format csv --noquotes | tail -n +2 | head -n 1)
  if [ -n "${EXISTING_USER}" ]; then
    log "Dev user '${DEV_EMAIL}' already exists."
  else
    log "Creating dev user '${DEV_EMAIL}' with role '${DEV_ROLE}'."
    "${KCADM}" create users -r "${REALM}" \
      -s username="${DEV_EMAIL}" -s email="${DEV_EMAIL}" \
      -s enabled=true -s emailVerified=true
    "${KCADM}" set-password -r "${REALM}" --username "${DEV_EMAIL}" --new-password "${DEV_PASSWORD}"
    if [ "${DEV_ROLE}" != "user" ]; then
      "${KCADM}" add-roles -r "${REALM}" --uusername "${DEV_EMAIL}" --rolename "${DEV_ROLE}"
    fi
  fi
fi

log "Done. Realm '${REALM}' is ready at ${SERVER_URL}/realms/${REALM}."
log "  Client ID:   ${CLIENT_ID} (public, PKCE S256)"
log "  App origin:  ${APP_ORIGIN}"
log "  Audience:    ${AUDIENCE}"
log "  Roles:       admin, user (default)"
