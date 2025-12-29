// /api/hubspot/callback.js
// Vercel Serverless Function - handles HubSpot OAuth callback

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { code, state: userId } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
  const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
  const REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI || 'https://comish.online/api/hubspot/callback';
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: HUBSPOT_CLIENT_ID,
        client_secret: HUBSPOT_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('HubSpot token error:', error);
      return res.redirect('/?hubspot=error&msg=token_exchange_failed');
    }

    const tokens = await tokenResponse.json();
    
    // Calculate expiry time
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Store tokens in Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { error: dbError } = await supabase
      .from('hubspot_tokens')
      .upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (dbError) {
      console.error('DB error:', dbError);
      return res.redirect('/?hubspot=error&msg=db_error');
    }

    // Success - redirect back to app
    return res.redirect('/?hubspot=connected');

  } catch (error) {
    console.error('Callback error:', error);
    return res.redirect('/?hubspot=error&msg=' + encodeURIComponent(error.message));
  }
}
