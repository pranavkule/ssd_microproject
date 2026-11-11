# AWS Secrets Manager for JWT Verification Keys

## Secret contents

The gateway uses AWS Secrets Manager only for the public verification JWKS. It must not contain
private signing keys, AWS credentials, or shared HMAC signing secrets. Store the JSON public JWK set
in the secret's `SecretString`:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "issuer-key-2026-01",
      "alg": "RS256",
      "use": "sig",
      "n": "PUBLIC_MODULUS_BASE64URL",
      "e": "AQAB"
    }
  ]
}
```

Only RS256 public RSA keys are accepted. Private JWK parameters are rejected. The gateway validates
the JWKS shape and imports each public key before replacing the active cache.

## Gateway configuration

Set the following non-secret configuration in the gateway environment:

```dotenv
AWS_REGION=us-east-1
AWS_SECRET_NAME=gateway/jwt/verification-jwks
JWT_ISSUER=https://issuer.example.invalid/
JWT_AUDIENCE=dynamic-api-gateway
JWT_ALGORITHM=RS256
JWT_SECRET_REFRESH_INTERVAL_MS=300000
```

`AWS_SECRET_NAME` can also be the secret ARN. When AWS is configured it takes precedence over the
local JWKS path. The AWS SDK for JavaScript v3 uses its standard credential provider chain. For an
AWS deployment, use only a lab-provided instance profile if permitted; do not create roles for the
AWS Academy deployment or put access keys in source code or `.env`.
For local AWS-backed testing, authenticate through the AWS CLI SSO/profile flow (for example,
`aws configure sso`) and select the profile with `AWS_PROFILE`. The local JWKS-file provider remains
available when AWS access is not needed.

The runtime dependency is `@aws-sdk/client-secrets-manager`. Required minimum IAM permission:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:us-east-1:123456789012:secret:gateway/jwt/verification-jwks-*"
    }
  ]
}
```

Replace the example region, account, and secret ARN with the deployment's values. Do not grant
secret create, update, or delete access to the gateway instance role.

Create a secret from a public JWKS file without placing secret values into a command argument:

```bash
aws secretsmanager create-secret \
  --name gateway/jwt/verification-jwks \
  --region us-east-1 \
  --secret-string file://public.jwks.json
```

An authorized operator can verify the configured value with:

```bash
aws secretsmanager get-secret-value \
  --secret-id gateway/jwt/verification-jwks \
  --region us-east-1 \
  --query SecretString \
  --output text
```

This prints the public JWKS to the terminal; do not capture it in shared logs. After updating an
existing secret, the gateway refreshes its cached key set at the configured interval.

## Local development

When `AWS_SECRET_NAME` is unset, the gateway can read a local public JWKS from
`gateway/.local-jwt/public.jwks.json` by default, or from `JWT_LOCAL_JWKS_PATH`. This provider is
enabled by default in `development` and `test`; production requires the explicit
`JWT_ALLOW_LOCAL_JWKS=true` opt-in. The single-EC2 academic runbook sets this opt-in and stores its
demo keys outside the Git checkout. The gateway repository includes commands to create a fresh local
RSA key pair and issue a 15-minute demonstration token:

```powershell
npm run auth:keys --workspace gateway
npm run auth:token --workspace gateway
```

The local development private key is ignored by Git and stays on the developer machine. Only the
public JWKS can be copied into a cloud secret. The demonstration issuer always grants the `user`
role and is not a production identity provider. In production, prefer `AWS_SECRET_NAME`; enable the
local-file provider only for a controlled single-host demonstration.

Generate local keys before starting the gateway. If keys are generated while it is running, restart
the gateway or wait for the next configured refresh interval before sending a protected request.
`JWT_LOCAL_JWKS_PATH` and `JWT_DEMO_PRIVATE_KEY_PATH` may point to other local files; ensure the
private-key path is never committed or placed in a shared location.

Local tests generate ephemeral keys in memory and do not require AWS credentials or an AWS account.

## Cache, failure, and rotation

- The gateway fetches and validates the key set once during startup and refreshes it periodically.
- Requests use the in-memory cache; the gateway does not call AWS for each request.
- A successful refresh atomically replaces the whole JWKS.
- A failed refresh keeps the last known-good JWKS. If no valid JWKS has ever loaded, protected
  routes return `503`; public routes continue to work.
- Logs include only the provider and error class, never the secret value or token.
- The provider supports multiple public keys in one JWKS for key rotation.

Rotation procedure:

1. Generate a new signing key pair at the token issuer; keep its private key at the issuer only.
2. Publish the new public JWK alongside the old public JWK in Secrets Manager.
3. Wait at least one configured refresh interval and confirm protected-token verification succeeds
   with the new `kid`.
4. Start signing new tokens with the new private key and `kid`.
5. Retain the old public key until all tokens signed with it have expired, then remove it from the
   JWKS and allow the gateway to refresh.

On AWS retrieval failure, the old cache stays active; a cold-start gateway has no cached key and
fails closed for protected routes. The gateway exposes no endpoint that returns key material.

## AWS validation status

The automated suite mocks the Secrets Manager client and tests `GetSecretValue`, parsing, caching,
rotation-compatible replacement, malformed values, and service failure. It does not contact AWS.
No AWS secret retrieval, IAM role assumption, EC2 deployment, or access-denial test was performed.
Verify these in the target AWS account only if the optional Secrets Manager provider is used. See
[aws-deployment.md](aws-deployment.md).
