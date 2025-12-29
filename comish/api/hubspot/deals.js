// /api/hubspot/deals.js
// Vercel Serverless Function - fetches closed-won deals from HubSpot

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  // Parse filters from query
  const { after, before } = req.query;

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
  const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;

  try {
    // Verify user token and get user ID
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get HubSpot tokens for this user
    const { data: tokenData, error: tokenError } = await supabase
      .from('hubspot_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (tokenError || !tokenData) {
      return res.status(400).json({ error: 'HubSpot not connected', needsAuth: true });
    }

    let accessToken = tokenData.access_token;

    // Check if token is expired and refresh if needed
    if (new Date(tokenData.expires_at) < new Date()) {
      const refreshResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: HUBSPOT_CLIENT_ID,
          client_secret: HUBSPOT_CLIENT_SECRET,
          refresh_token: tokenData.refresh_token,
        }),
      });

      if (!refreshResponse.ok) {
        // Token refresh failed, user needs to re-auth
        await supabase.from('hubspot_tokens').delete().eq('user_id', user.id);
        return res.status(400).json({ error: 'HubSpot token expired', needsAuth: true });
      }

      const newTokens = await refreshResponse.json();
      accessToken = newTokens.access_token;

      // Update tokens in DB
      await supabase
        .from('hubspot_tokens')
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
    }

    // Fetch deals from HubSpot
    // We need: dealname, amount, closedate, and custom property for term (months)
    const properties = ['dealname', 'amount', 'closedate', 'dealstage', 'hs_deal_stage_probability', 'contract_length', 'term_months', 'contract_term'];
    
    // Build filter for closed-won deals
    const filters = [
      {
        propertyName: 'hs_deal_stage_probability',
        operator: 'EQ',
        value: '1' // 1 = 100% = Won
      }
    ];

    // Add date filters if provided
    if (after) {
      filters.push({
        propertyName: 'closedate',
        operator: 'GTE',
        value: new Date(after).getTime().toString()
      });
    }
    if (before) {
      filters.push({
        propertyName: 'closedate',
        operator: 'LTE', 
        value: new Date(before).getTime().toString()
      });
    }

    const searchBody = {
      filterGroups: [{ filters }],
      properties,
      limit: 100,
      sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }]
    };

    const dealsResponse = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchBody),
    });

    if (!dealsResponse.ok) {
      const error = await dealsResponse.text();
      console.error('HubSpot deals error:', error);
      return res.status(500).json({ error: 'Failed to fetch deals from HubSpot' });
    }

    const dealsData = await dealsResponse.json();

    // Map HubSpot deals to Comish format
    const deals = dealsData.results.map(deal => {
      const props = deal.properties;
      
      // Try to find term in months from various possible field names
      let termMonths = props.term_months || props.contract_length || props.contract_term || '12';
      termMonths = parseInt(termMonths) || 12;
      
      // Convert months to years (1 or 2)
      const term = termMonths >= 24 ? 2 : 1;

      return {
        hubspot_id: deal.id,
        name: props.dealname || 'Unnamed Deal',
        amount: parseFloat(props.amount) || 0,
        close_date: props.closedate ? props.closedate.split('T')[0] : null,
        term: term,
        paid: false, // Manual field
      };
    }).filter(d => d.amount > 0 && d.close_date); // Only deals with amount and close date

    return res.status(200).json({ 
      deals,
      total: deals.length,
      hasMore: dealsData.paging?.next ? true : false
    });

  } catch (error) {
    console.error('Deals fetch error:', error);
    return res.status(500).json({ error: error.message });
  }
}
