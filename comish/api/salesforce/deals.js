// /api/salesforce/deals.js
// Vercel Serverless Function - fetches Closed Won Opportunities from Salesforce

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
  const SALESFORCE_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID;
  const SALESFORCE_CLIENT_SECRET = process.env.SALESFORCE_CLIENT_SECRET;

  try {
    // Verify user token and get user ID
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get Salesforce tokens for this user
    const { data: tokenData, error: tokenError } = await supabase
      .from('salesforce_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (tokenError || !tokenData) {
      return res.status(400).json({ error: 'Salesforce not connected', needsAuth: true });
    }

    let accessToken = tokenData.access_token;
    let instanceUrl = tokenData.instance_url;

    // Try to refresh the token (Salesforce tokens can expire)
    const refreshResponse = await fetch(`${instanceUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: SALESFORCE_CLIENT_ID,
        client_secret: SALESFORCE_CLIENT_SECRET,
        refresh_token: tokenData.refresh_token,
      }),
    });

    if (refreshResponse.ok) {
      const newTokens = await refreshResponse.json();
      accessToken = newTokens.access_token;
      
      // Update access token in DB
      await supabase
        .from('salesforce_tokens')
        .update({
          access_token: newTokens.access_token,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
    }

    // Build SOQL query for Closed Won opportunities
    // Looking for opportunities with StageName = 'Closed Won' 
    // Fields: Name, Amount, CloseDate, and try to find contract term
    let soql = `SELECT Id, Name, Amount, CloseDate, StageName, Contract_Term__c, Contract_Length__c, Term_Months__c 
                FROM Opportunity 
                WHERE StageName = 'Closed Won' AND Amount > 0`;

    // Add date filters
    if (after) {
      soql += ` AND CloseDate >= ${after}`;
    }
    if (before) {
      soql += ` AND CloseDate <= ${before}`;
    }

    soql += ' ORDER BY CloseDate DESC LIMIT 200';

    // Query Salesforce
    const queryUrl = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`;
    
    const oppsResponse = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!oppsResponse.ok) {
      const error = await oppsResponse.text();
      console.error('Salesforce query error:', error);
      
      // Check if it's an auth error
      if (oppsResponse.status === 401) {
        await supabase.from('salesforce_tokens').delete().eq('user_id', user.id);
        return res.status(400).json({ error: 'Salesforce session expired', needsAuth: true });
      }
      
      // Try simpler query without custom fields
      const simpleSOQL = `SELECT Id, Name, Amount, CloseDate, StageName 
                          FROM Opportunity 
                          WHERE StageName = 'Closed Won' AND Amount > 0
                          ORDER BY CloseDate DESC LIMIT 200`;
      
      const simpleResponse = await fetch(`${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(simpleSOQL)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!simpleResponse.ok) {
        return res.status(500).json({ error: 'Failed to fetch opportunities from Salesforce' });
      }

      const simpleData = await simpleResponse.json();
      const deals = mapOpportunitiesToDeals(simpleData.records);
      
      return res.status(200).json({ 
        deals,
        total: deals.length,
        hasMore: simpleData.nextRecordsUrl ? true : false
      });
    }

    const oppsData = await oppsResponse.json();

    // Map Salesforce opportunities to Comish deals format
    const deals = mapOpportunitiesToDeals(oppsData.records);

    return res.status(200).json({ 
      deals,
      total: deals.length,
      hasMore: oppsData.nextRecordsUrl ? true : false
    });

  } catch (error) {
    console.error('Deals fetch error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function mapOpportunitiesToDeals(records) {
  return records.map(opp => {
    // Try to find term in months from various possible field names
    let termMonths = opp.Contract_Term__c || opp.Contract_Length__c || opp.Term_Months__c || 12;
    termMonths = parseInt(termMonths) || 12;
    
    // Convert months to years (1 or 2)
    const term = termMonths >= 24 ? 2 : 1;

    return {
      salesforce_id: opp.Id,
      name: opp.Name || 'Unnamed Opportunity',
      amount: parseFloat(opp.Amount) || 0,
      close_date: opp.CloseDate || null,
      term: term,
      paid: false, // Manual field
    };
  }).filter(d => d.amount > 0 && d.close_date);
}
