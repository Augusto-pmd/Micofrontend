import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let _client: SecretManagerServiceClient | null = null;
function getClient(): SecretManagerServiceClient {
  if (!_client) _client = new SecretManagerServiceClient();
  return _client;
}

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

  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new Error(
      `getSecret('${secretId}') failed: GCLOUD_PROJECT is not set and no env var fallback found`
    );
  }
  const name = `projects/${projectId}/secrets/${secretId}/versions/latest`;

  const [version] = await getClient().accessSecretVersion({ name });
  const payload = version.payload?.data;

  if (!payload) {
    throw new Error(`Secret ${secretId} not found or empty`);
  }

  if (Buffer.isBuffer(payload)) return payload.toString('utf8');
  if (payload instanceof Uint8Array) return Buffer.from(payload).toString('utf8');
  return String(payload);
}
