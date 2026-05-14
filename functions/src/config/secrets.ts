import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();

/**
 * Reads a secret from Google Secret Manager.
 * Falls back to environment variables for local development.
 * Example: getSecret('hik-nordelta-pass') or env var 'HIK_NORDELTA_PASS'
 */
export async function getSecret(secretId: string): Promise<string> {
  // Fallback for local development with emulators
  const envKey = secretId.toUpperCase().replace(/-/g, '_');
  if (process.env[envKey]) {
    return process.env[envKey]!;
  }

  const projectId = process.env.GCLOUD_PROJECT;
  const name = `projects/${projectId}/secrets/${secretId}/versions/latest`;

  const [version] = await client.accessSecretVersion({ name });
  const payload = version.payload?.data;

  if (!payload) {
    throw new Error(`Secret ${secretId} not found or empty`);
  }

  return Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
}
