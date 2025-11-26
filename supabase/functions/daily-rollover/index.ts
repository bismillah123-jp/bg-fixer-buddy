import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting daily rollover process...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current date in WIB timezone (UTC+7)
    const now = new Date();
    const wibOffset = 7 * 60; // WIB is UTC+7
    const wibDate = new Date(now.getTime() + wibOffset * 60 * 1000);
    const targetDate = wibDate.toISOString().split('T')[0];
    
    console.log(`Target date for rollover: ${targetDate}`);

    // Get the last date with data
    const { data: lastEntry, error: lastEntryError } = await supabase
      .from('stock_entries')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (lastEntryError) {
      console.error('Error fetching last entry:', lastEntryError);
      throw lastEntryError;
    }

    if (!lastEntry) {
      console.log('No existing data found, skipping rollover');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No existing data, skipping rollover',
          rolled_over: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lastDate = lastEntry.date;
    console.log(`Last data date: ${lastDate}`);

    // Check if we need to rollover
    if (lastDate >= targetDate) {
      console.log('Data already up to date, no rollover needed');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Data already up to date',
          last_date: lastDate,
          target_date: targetDate,
          rolled_over: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Perform rollover for each missing date
    const lastDateTime = new Date(lastDate + 'T00:00:00Z');
    const targetDateTime = new Date(targetDate + 'T00:00:00Z');
    const daysDiff = Math.floor((targetDateTime.getTime() - lastDateTime.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log(`Rolling over ${daysDiff} day(s)...`);
    
    const rolledDates = [];
    let currentDate = new Date(lastDateTime);
    currentDate.setDate(currentDate.getDate() + 1);
    
    while (currentDate <= targetDateTime) {
      const dateStr = currentDate.toISOString().split('T')[0];
      console.log(`Performing rollover to: ${dateStr}`);
      
      const { error: rolloverError } = await supabase.rpc('rollover_to_new_day', { 
        target_date: dateStr 
      });
      
      if (rolloverError) {
        console.error(`Rollover error for ${dateStr}:`, rolloverError);
        throw rolloverError;
      }
      
      rolledDates.push(dateStr);
      console.log(`✓ Rollover successful for ${dateStr}`);
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`Rollover completed successfully for ${rolledDates.length} date(s)`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Rollover completed for ${rolledDates.length} date(s)`,
        rolled_dates: rolledDates,
        last_date: lastDate,
        target_date: targetDate,
        rolled_over: true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in daily rollover:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        rolled_over: false
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
})
