# Mi Container Backend — Deploy Checklist

## Prerequisites (manual steps before first deploy)

1. **Create Firebase project**
   - Go to https://console.firebase.google.com
   - Create project named `micontainer-prod`
   - Disable Google Analytics

2. **Firebase CLI login**
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

3. **Associate repo with project**
   ```bash
   firebase use --add
   # Select micontainer-prod, alias: default
   ```

4. **Activate Firebase services in console:**
   - Firestore: Create database → Production mode → Region: us-central1
   - Authentication: Enable providers → Google + Email link (passwordless)
   - Upgrade to Blaze plan (required for external API calls)

5. **Configure secrets in Secret Manager**
   ```bash
   # Get production MP access token from https://www.mercadopago.com.ar/developers
   firebase functions:secrets:set MP_ACCESS_TOKEN
   
   # Generate a random secret for webhook verification
   firebase functions:secrets:set MP_WEBHOOK_SECRET
   ```

6. **Grant Functions access to secrets**
   In Firebase Console → Functions → each function → Edit → Add secret references:
   - MP_ACCESS_TOKEN
   - MP_WEBHOOK_SECRET

## Deploy commands

```bash
# Deploy Firestore rules + indexes
firebase deploy --only firestore:rules,firestore:indexes

# Deploy Cloud Functions
firebase deploy --only functions

# Deploy everything
firebase deploy
```

## Post-deploy smoke test

```bash
curl https://us-central1-micontainer-prod.cloudfunctions.net/api/health
# Expected: {"status":"ok","version":"1.0.0"}
```

## Configure MP webhook

In Mercado Pago Developer Dashboard:
- Webhook URL: `https://us-central1-micontainer-prod.cloudfunctions.net/api/webhooks/mp`
- Events: `subscription_authorized_payment`, `subscription_preapproval`
