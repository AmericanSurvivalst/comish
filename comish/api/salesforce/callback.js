// /api/salesforce/callback.js
// Vercel Serverless Function - handles Salesforce OAuth callback

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { code, state: userId } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  const SALESFORCE_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID;
  const SALESFORCE_CLIENT_SECRET = process.env.SALESFORCE_CLIENT_SECRET;
  const REDIRECT_URI = process.env.SALESFORCE_REDIRECT_URI || 'https://comish.online/api/salesforce/callback';
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Try production first, then sandbox
  const loginUrls = [
    'https://login.salesforce.com',
    'https://test.salesforce.com'
  ];

  let tokens = null;
  let tokenError = null;

  for (const loginUrl of loginUrls) {
    try {
      const tokenResponse = await fetch(`${loginUrl}/services/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: SALESFORCE_CLIENT_ID,
          client_secret: SALESFORCE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          code: code,
        }),
      });

      if (tokenResponse.ok) {
        tokens = await tokenResponse.json();
        break;
      } else {
        tokenError = await tokenResponse.text();
      }
    } catch (e) {
      tokenError = e.message;
    }
  }

  if (!tokens) {
    console.error('Salesforce token error:', tokenError);
    return res.redirect('/?salesforce=error&msg=token_exchange_failed');
  }

  try {
    // Store tokens in Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { error: dbError } = await supabase
      .from('salesforce_tokens')
      .upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        instance_url: tokens.instance_url,
        issued_at: new Date(parseInt(tokens.issued_at)).toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (dbError) {
      console.error('DB error:', dbError);
      return res.redirect('/?salesforce=error&msg=db_error');
    }

    // Success - redirect back to app
    return res.redirect('/?salesforce=connected');

  } catch (error) {
    console.error('Callback error:', error);
    return res.redirect('/?salesforce=error&msg=' + encodeURIComponent(error.message));
  }
}
