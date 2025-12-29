// /api/hubspot/status.js
// Vercel Serverless Function - checks if HubSpot is connected

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { data: tokenData, error: tokenError } = await supabase
      .from('hubspot_tokens')
      .select('expires_at, updated_at')
      .eq('user_id', user.id)
      .single();

    if (tokenError || !tokenData) {
      return res.status(200).json({ connected: false });
    }

    const isExpired = new Date(tokenData.expires_at) < new Date();

    return res.status(200).json({ 
      connected: true,
      expires_at: tokenData.expires_at,
      needs_refresh: isExpired,
      connected_at: tokenData.updated_at
    });

  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({ error: error.message });
  }
}
