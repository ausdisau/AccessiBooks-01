# DRM Service — Key Management

## JWT Signing (RS256)

The DRM service signs playback tokens using RS256 (RSA + SHA-256).

### Environment Variable

Set `JWT_PRIVATE_KEY_PEM` to your RSA private key in PEM format.
Multiline values are supported — use literal newlines or `\n` escape sequences.

### Generating Local Development Keys

```bash
# Generate a 2048-bit RSA private key
openssl genrsa -out private.pem 2048

# Extract the public key (optional — the service derives it automatically)
openssl rsa -in private.pem -pubout -out public.pem

# Set the env var (escape newlines for .env files)
export JWT_PRIVATE_KEY_PEM=$(cat private.pem)
```

If `JWT_PRIVATE_KEY_PEM` is not set, the service generates an **ephemeral keypair** on startup.
This is fine for local development but must not be used in production (keys change every restart).

### JWKS Endpoint

The public key is exposed as a JSON Web Key Set at:

```
GET /.well-known/jwks.json
```

Consumers (e.g., CDN edge, license proxy) can fetch this endpoint to verify playback tokens
without needing the private key.

### Key Rotation

To rotate keys:

1. Generate a new keypair
2. Update `JWT_PRIVATE_KEY_PEM` with the new private key
3. Restart the service
4. The JWKS endpoint will automatically serve the new public key

Note: Tokens signed with the old key will fail verification after rotation.
For zero-downtime rotation, implement a grace period that accepts both old and new keys.
