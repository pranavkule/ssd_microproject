const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const env = require('../src/config/env');

const privateKeyPath = env.jwtDemoPrivateKeyPath;
const publicJwksPath = env.jwtLocalJwksPath;

async function main() {
  const { exportJWK, exportPKCS8, generateKeyPair } = await import('jose');
  await Promise.all([
    fs.mkdir(path.dirname(privateKeyPath), { recursive: true }),
    fs.mkdir(path.dirname(publicJwksPath), { recursive: true }),
  ]);
  const existingFiles = await Promise.all(
    [privateKeyPath, publicJwksPath].map((file) =>
      fs.access(file).then(() => true, () => false)
    )
  );
  if (existingFiles.some(Boolean)) {
    throw new Error('Development keys already exist; remove the local key directory to rotate them.');
  }

  const { privateKey, publicKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  });
  const kid = randomUUID();
  const privatePem = await exportPKCS8(privateKey);
  const publicJwk = await exportJWK(publicKey);
  const jwks = {
    keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }],
  };

  await fs.writeFile(privateKeyPath, privatePem, { flag: 'wx', mode: 0o600 });
  try {
    await fs.writeFile(publicJwksPath, `${JSON.stringify(jwks, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o644,
    });
  } catch (error) {
    await fs.rm(privateKeyPath, { force: true });
    throw error;
  }
  console.log('Created ignored local development JWT keys.');
  console.log('The private key remains local; only public.jwks.json may be uploaded to Secrets Manager.');
}

main().catch((error) => {
  console.error(`Unable to generate development JWT keys: ${error.message}`);
  process.exitCode = 1;
});
