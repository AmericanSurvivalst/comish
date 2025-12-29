// /api/hubspot/auth.js
// Vercel Serverless Function - starts HubSpot OAuth flow

export default function handler(req, res) {
  const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
  const REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI || 'https://comish.online/api/hubspot/callback';

  if (!HUBSPOT_CLIENT_ID) {
    return res.status(500).json({ error: 'HubSpot not configured' });
  }

  const scopes = [
    'crm.objects.deals.read',
    'oauth'
  ].join(' ');

  // Store user ID in state so we know who to associate the token with
  const state = req.query.user_id || '';

  const authUrl = new URL('https://app.hubspot.com/oauth/authorize');
  authUrl.searchParams.set('client_id', HUBSPOT_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);

  // Redirect to HubSpot
  res.redirect(302, authUrl.toString());
}
