# HubSpot Integration Setup

## 1. Create HubSpot Developer App

1. Go to https://developers.hubspot.com/
2. Create a developer account (free)
3. Create a new app
4. Under "Auth" tab:
   - Add redirect URL: `https://comish.online/api/hubspot/callback`
   - Scopes needed: `crm.objects.deals.read`, `oauth`
5. Copy your **Client ID** and **Client Secret**

## 2. Add Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```
HUBSPOT_CLIENT_ID=your-client-id
HUBSPOT_CLIENT_SECRET=your-client-secret
HUBSPOT_REDIRECT_URI=https://comish.online/api/hubspot/callback
```

## 3. Run Database Migration

In Supabase SQL Editor, run the contents of:
`supabase/migrations/003_hubspot_tokens.sql`

## 4. Deploy API Routes

The `/api/hubspot/` folder contains 4 files:
- `auth.js` - Starts OAuth flow
- `callback.js` - Handles OAuth callback
- `deals.js` - Fetches closed-won deals
- `status.js` - Checks connection status
- `disconnect.js` - Removes connection

These deploy automatically with Vercel.

## 5. HubSpot Field Mapping

The integration looks for these HubSpot properties:
- `dealname` → Client name
- `amount` → Deal amount
- `closedate` → Close date
- `term_months` OR `contract_length` OR `contract_term` → Term (months)

### Custom Property for Term

If you don't have a term field in HubSpot, create one:
1. Go to Settings → Properties → Deals
2. Create property:
   - Name: `Term (Months)`
   - Internal name: `term_months`
   - Type: Number
3. Set values like `12` for 1yr, `24` for 2yr

If no term field exists, defaults to 1 year.

## How It Works

1. User clicks "🔶 HubSpot" button
2. If not connected → OAuth flow to connect
3. If connected → Select date range
4. Fetch pulls closed-won deals (where deal probability = 100%)
5. User selects which deals to import
6. Deals added to Comish with `paid: false`

## Files Changed

- `index.html` - Added HubSpot button + modal + JS functions
- `api/hubspot/*` - New API routes
- `supabase/migrations/003_hubspot_tokens.sql` - New table
