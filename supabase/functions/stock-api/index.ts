import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

interface PhoneModel {
  id: string
  brand: string
  model: string
  storage_capacity: string
  color: string
  srp: number
}

interface StockLocation {
  id: string
  name: string
  description: string
}

interface StockEntry {
  id: string
  date: string
  imei: string
  morning_stock: number
  night_stock: number
  incoming: number
  sold: number
  returns: number
  adjustment: number
  cost_price: number
  selling_price: number
  notes: string
  label: string
  metadata: Record<string, unknown>
  phone_models: PhoneModel | null
  stock_locations: StockLocation | null
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate API Key
    const apiKey = req.headers.get('x-api-key')
    const validApiKey = Deno.env.get('STOCK_API_KEY')
    
    if (!apiKey || apiKey !== validApiKey) {
      console.error('Invalid or missing API key')
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid API key' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse query parameters
    const url = new URL(req.url)
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
    const location = url.searchParams.get('location')
    const brand = url.searchParams.get('brand')
    const availableOnly = url.searchParams.get('available') === 'true'

    console.log(`Fetching stock for date: ${date}, location: ${location}, brand: ${brand}, available: ${availableOnly}`)

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Build query
    let query = supabase
      .from('stock_entries')
      .select(`
        id,
        date,
        imei,
        morning_stock,
        night_stock,
        incoming,
        sold,
        returns,
        adjustment,
        cost_price,
        selling_price,
        notes,
        label,
        metadata,
        phone_models (
          id,
          brand,
          model,
          storage_capacity,
          color,
          srp
        ),
        stock_locations (
          id,
          name,
          description
        )
      `)
      .eq('date', date)
      .order('created_at', { ascending: false })

    // Apply filters
    if (availableOnly) {
      query = query.gt('night_stock', 0)
    }

    const { data: stockData, error: stockError } = await query

    if (stockError) {
      console.error('Database error:', stockError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch stock data', details: stockError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Cast to proper type
    const typedData = (stockData || []) as unknown as StockEntry[]

    // Filter by location and brand if provided
    let filteredData = typedData
    
    if (location) {
      filteredData = filteredData.filter(item => 
        item.stock_locations?.name?.toLowerCase().includes(location.toLowerCase())
      )
    }
    
    if (brand) {
      filteredData = filteredData.filter(item => 
        item.phone_models?.brand?.toLowerCase().includes(brand.toLowerCase())
      )
    }

    // Transform data for cleaner response
    const transformedData = filteredData.map(item => ({
      id: item.id,
      date: item.date,
      imei: item.imei,
      brand: item.phone_models?.brand || null,
      model: item.phone_models?.model || null,
      storage: item.phone_models?.storage_capacity || null,
      color: item.phone_models?.color || null,
      location: item.stock_locations?.name || null,
      morning_stock: item.morning_stock,
      night_stock: item.night_stock,
      incoming: item.incoming,
      sold: item.sold,
      returns: item.returns,
      adjustment: item.adjustment,
      cost_price: item.cost_price,
      selling_price: item.selling_price,
      srp: item.phone_models?.srp || null,
      notes: item.notes,
      label: item.label,
      metadata: item.metadata
    }))

    // Summary statistics
    const summary = {
      total_items: transformedData.length,
      total_stock: transformedData.reduce((sum, item) => sum + (item.night_stock || 0), 0),
      total_sold: transformedData.reduce((sum, item) => sum + (item.sold || 0), 0),
      total_incoming: transformedData.reduce((sum, item) => sum + (item.incoming || 0), 0),
      date: date,
      filters_applied: {
        location: location || null,
        brand: brand || null,
        available_only: availableOnly
      }
    }

    console.log(`Successfully fetched ${transformedData.length} stock items`)

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        data: transformedData
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (err) {
    const error = err as Error
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
