const fs = require('node:fs/promises');
const env = require('../src/config/env');

async function main() {
  const { SignJWT, importPKCS8 } = await import('jose');
  const [jwksFile, privateKeyFile] = await Promise.all([
    fs.readFile(env.jwtLocalJwksPath, 'utf8'),
    fs.readFile(env.jwtDemoPrivateKeyPath, 'utf8'),
  ]);
  const jwks = JSON.parse(jwksFile);
  const signingKey = await importPKCS8(privateKeyFile, 'RS256');
  const subject = process.argv[2] || 'demo-user';
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(subject)) {
    throw new Error('Subject must be 1-100 letters, digits, or ._:-');
  }
  const token = await new SignJWT({ roles: ['user'] })
    .setProtectedHeader({ alg: 'RS256', kid: jwks.keys[0].kid, typ: 'JWT' })
    .setSubject(subject)
    .setIssuedAt()
    .setIssuer(env.jwtIssuer)
    .setAudience(env.jwtAudience)
    .setExpirationTime('15m')
    .sign(signingKey);
  process.stdout.write(`${token}\n`);
}

main().catch((error) => {
  console.error(`Unable to issue demonstration token: ${error.message}`);
  process.exitCode = 1;
});
