// /api/salesforce/auth.js
// Vercel Serverless Function - starts Salesforce OAuth flow

export default function handler(req, res) {
  const SALESFORCE_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID;
  const REDIRECT_URI = process.env.SALESFORCE_REDIRECT_URI || 'https://comish.online/api/salesforce/callback';

  if (!SALESFORCE_CLIENT_ID) {
    return res.status(500).json({ error: 'Salesforce not configured' });
  }

  // Salesforce OAuth scopes
  const scopes = [
    'api',
    'refresh_token',
    'offline_access'
  ].join(' ');

  // Store user ID in state so we know who to associate the token with
  const state = req.query.user_id || '';

  // Use login.salesforce.com for production, test.salesforce.com for sandbox
  const loginUrl = req.query.sandbox === 'true' 
    ? 'https://test.salesforce.com' 
    : 'https://login.salesforce.com';

  const authUrl = new URL(`${loginUrl}/services/oauth2/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', SALESFORCE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);

  // Redirect to Salesforce
  res.redirect(302, authUrl.toString());
}
