# AWS Academy Single-EC2 Deployment

This runbook deploys the complete project on one Ubuntu 24.04 EC2 instance: Nginx, the built React
dashboard, the gateway, both User Service instances, Product/Order/Payment services, and MongoDB.
All application and database ports bind to loopback; Nginx on port 80 is the only public HTTP entry
point.

**This is a manual AWS Console runbook, not an IaC deployment.** It does not create resources
automatically, attach a custom IAM role, or require AWS Secrets Manager. No AWS resource has been
created or tested for this project. AWS Academy inventory, instance types, role availability, and
credits vary by lab; follow the lab's restrictions and review its remaining budget before launching.
This HTTP setup is for a trusted academic demo, not production use.

## Before launch

1. Publish the approved source and deployment files to a Git branch that the instance can clone.
   The current local worktree is not automatically available on GitHub; do not launch from a branch
   that does not contain these files.
2. Obtain your current public IPv4 address. Use `<your-public-ip>/32` for SSH and the administrator
   CIDR. If the address changes, update the instance security group and rerun the installer with the
   new administrator CIDR.
3. In the AWS Academy Learner Lab, confirm the allowed region, remaining credits, allowed instance
   types, and any supplied instance profile. Do not create an IAM role or policy for this deployment.
4. Choose an Ubuntu 24.04 LTS x86_64 AMI and an instance type permitted by the lab. A 2-vCPU,
   4-GiB-or-larger instance is a practical starting point for the application stack; use a larger
   permitted type if the lab supports only heavier types. This is a sizing suggestion, not a
   measured capacity claim.

## Launch through the AWS Console

1. Open **EC2 → Instances → Launch instances** in the lab's assigned region.
2. Use a recognizable name such as `dynamic-api-gateway-demo`, the Ubuntu Server 24.04 LTS
   x86_64 AMI, and an instance type allowed by the lab.
3. Select or create a key pair that you can securely access.
4. Create a security group with inbound rules only:
   - SSH, TCP 22, source `<your-public-ip>/32`.
   - HTTP, TCP 80, source `<your-public-ip>/32` for a private demo, or another explicitly approved
     client CIDR if the dashboard must be shared.
   - Do **not** add public rules for 27017, 8000, 5001, 5002, 5003, 5005, or 5007.
5. Allocate enough encrypted EBS storage for the OS, npm packages, MongoDB data, and backups; check
   lab quotas before selecting the volume size. No fixed cost estimate is supplied because Academy
   credit rules and regional pricing differ. Check the lab budget rather than assuming ordinary
   on-demand pricing applies.
6. Launch the instance. Use the instance's public DNS/IP to connect by SSH from your allowed IP.

## Install the application

Connect as the Ubuntu user, then clone the branch that contains the approved deployment files:

```bash
sudo apt-get update
sudo apt-get install -y git
sudo git clone --branch YOUR_APPROVED_BRANCH --depth 1 \
  https://github.com/YOUR_ORG/YOUR_REPOSITORY.git /opt/dynamic-api-gateway
cd /opt/dynamic-api-gateway
sudo chmod +x deployment/scripts/*.sh
sudo deployment/scripts/install-single-ec2.sh YOUR_PUBLIC_IP/32
```

The installer installs Node.js 22, Nginx, and MongoDB 8; installs workspace dependencies; builds
the frontend with a same-origin gateway URL; and enables/restarts the MongoDB, gateway, and five
service systemd units. It creates `/etc/dynamic-api-gateway/gateway.env` and `services.env` only if
they do not already exist. Review those files before the first start. The installer preserves
existing environment files, MongoDB configuration and database contents, and a complete JWT key
pair. It rejects a partial key pair rather than overwriting either key.

For this single-host Academy setup, JWT verification uses a locally generated RS256 public JWKS.
`JWT_ALLOW_LOCAL_JWKS=true` is explicitly set by the installer; this does not enable local keys
globally in the application. The demo private key is stored outside the Git checkout at
`/var/lib/dynamic-gateway/keys/private.pem` with service-account-only permissions. Do not copy it
into the repository or share it. No AWS credentials or secret value is needed. The gateway may
continue to use Secrets Manager if the lab-provided instance profile already has appropriate access,
but that is optional and is not configured by this runbook; see [secret-manager.md](secret-manager.md).

Nginx serves the dashboard and forwards `/api/*` and `/health` to the loopback gateway. Its
`/api/gateway` location allows only loopback plus the installer-supplied administrator CIDR. The
security group must also restrict port 80 to an approved client CIDR; do not expose management
operations to untrusted clients.

## Verify and operate

Open `http://INSTANCE_PUBLIC_DNS/` from an allowed IP. Check health and the public service APIs:

```bash
curl -fsS http://127.0.0.1/health
curl -i http://127.0.0.1/api/users
curl -i http://127.0.0.1/api/products
curl -i http://127.0.0.1/api/orders
curl -i http://127.0.0.1/api/payments
```

Check all service units and application health:

```bash
sudo /opt/dynamic-api-gateway/deployment/scripts/manage.sh status
sudo /opt/dynamic-api-gateway/deployment/scripts/manage.sh health
```

The management script also supports `restart` and `logs`; run it without arguments to print its
usage. Refresh routes with `POST /api/gateway/routes/refresh` from an allowed administrator
address. Systemd logs can be inspected with:

```bash
sudo journalctl -u gateway -u user-service@5001 -u user-service@5002 \
  -u product-service -u order-service -u payment-service -u mongod -n 100 --no-pager
```

For a protected-route demonstration, create keys only if they are absent, enable authentication on
a test route with the management API, and generate a short-lived demo token:

```bash
cd /opt/dynamic-api-gateway
sudo -u dynamic-gateway env \
  JWT_LOCAL_JWKS_PATH=/var/lib/dynamic-gateway/keys/public.jwks.json \
  JWT_DEMO_PRIVATE_KEY_PATH=/var/lib/dynamic-gateway/keys/private.pem \
  npm run auth:token --workspace gateway
```

Never paste the token into shared logs or tickets. Follow [authentication.md](authentication.md)
for route setup and authorization behavior.

## Backups and restore

MongoDB data is stored in `/var/lib/mongodb`. Create an on-disk database dump and restrict access:

```bash
sudo install -d -m 0700 /var/backups/dynamic-api-gateway
sudo mongodump --uri mongodb://127.0.0.1:27017/dynamic_api_gateway \
  --out /var/backups/dynamic-api-gateway/$(date +%F)
sudo chmod -R go-rwx /var/backups/dynamic-api-gateway
```

Copy backups and the JWT key pair to a separate, access-controlled location according to the lab's
rules; a backup left only on this EC2 volume does not protect against instance/volume loss. Keep
private-key backups encrypted and separate from public artifacts. Restore a dump only after making
a fresh backup and stopping application writes:

```bash
sudo systemctl stop gateway
sudo mongorestore --uri mongodb://127.0.0.1:27017 \
  --drop /path/to/backup/dynamic_api_gateway
sudo systemctl start gateway
```

Restoring `--drop` replaces the selected database contents. Verify the backup path and target
database carefully before executing the restore.

## Limitations and teardown

- One EC2 host is a single point of failure; MongoDB and all app processes share its CPU, memory,
  storage, and OS. No high availability or production capacity claim is made.
- HTTP is unencrypted. Do not use real credentials or expose the site to untrusted networks; add a
  reviewed TLS termination setup before broader access.
- The dashboard is same-origin, while management APIs are IP-restricted by Nginx. This is network
  filtering, not user authentication.
- No AWS deployment, browser test, or cloud performance benchmark has been run. Verify behavior in
  the target Academy lab before a demonstration.
- To clean up, first back up anything needed. Then stop the instance and terminate only the
  instance created for this demo; delete its security group, key pair only if no longer used, and
  EBS volumes/snapshots only after confirming they belong to this demo and are no longer needed.
  Follow AWS Academy lab cleanup rules; do not delete shared or unrelated resources.

On the installed Ubuntu host, run `sudo npm run smoke:deployment` after MongoDB, Nginx, the gateway,
and all services are running. The smoke test restarts the gateway and Product Service to verify
persistence, creates unique temporary data, and removes its records and request logs afterward. It
does not provision AWS resources. Do not enable its optional failover mode unless you are prepared
for it to stop and restart both User Service units:

```bash
sudo env SMOKE_TEST_FAILOVER=true npm run smoke:deployment
```
