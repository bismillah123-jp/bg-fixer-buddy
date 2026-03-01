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
    const type = url.searchParams.get('type') || 'stock' // stock, sold, transfer, incoming, morning, night, sales-summary, monthly-recap
    const month = url.searchParams.get('month') // format: YYYY-MM (for monthly-recap)

    console.log(`API request - type: ${type}, date: ${date}, location: ${location}, brand: ${brand}`)

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Handle different API types
    switch (type) {
      case 'sold':
        return await handleSoldData(supabase, date, location, brand)
      case 'transfer':
        return await handleTransferData(supabase, date, location)
      case 'incoming':
        return await handleIncomingData(supabase, date, location, brand)
      case 'morning':
        return await handleMorningStock(supabase, date, location, brand)
      case 'night':
        return await handleNightStock(supabase, date, location, brand)
      case 'sales-summary':
        return await handleSalesSummary(supabase, date, location)
      case 'monthly-recap':
        return await handleMonthlyRecap(supabase, month || date.substring(0, 7), location, brand)
      default:
        return await handleDefaultStock(supabase, date, location, brand, availableOnly)
    }

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(data: StockEntry[], location?: string | null, brand?: string | null): StockEntry[] {
  let filtered = data
  if (location) {
    filtered = filtered.filter(item => 
      item.stock_locations?.name?.toLowerCase().includes(location.toLowerCase())
    )
  }
  if (brand) {
    filtered = filtered.filter(item => 
      item.phone_models?.brand?.toLowerCase().includes(brand.toLowerCase())
    )
  }
  return filtered
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any

// Handle sold data - items that were sold on the specified date
async function handleSoldData(supabase: SupabaseClientType, date: string, location?: string | null, brand?: string | null) {
  console.log(`Fetching sold data for date: ${date}`)
  
  const { data, error } = await supabase
    .from('stock_entries')
    .select(`
      id, date, imei, sold, selling_price, cost_price, sale_date, notes, label,
      phone_models (id, brand, model, storage_capacity, color, srp),
      stock_locations (id, name, description)
    `)
    .eq('date', date)
    .gt('sold', 0)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Database error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch sold data', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const typedData = (data || []) as unknown as StockEntry[]
  const filtered = applyFilters(typedData, location, brand)

  const transformedData = filtered.map(item => ({
    id: item.id,
    date: item.date,
    imei: item.imei,
    brand: item.phone_models?.brand || null,
    model: item.phone_models?.model || null,
    storage: item.phone_models?.storage_capacity || null,
    color: item.phone_models?.color || null,
    location: item.stock_locations?.name || null,
    sold: item.sold,
    selling_price: item.selling_price,
    cost_price: item.cost_price,
    srp: item.phone_models?.srp || null,
    profit_loss: (item.selling_price || 0) - (item.cost_price || item.phone_models?.srp || 0),
    notes: item.notes
  }))

  const totalRevenue = transformedData.reduce((sum, item) => sum + (item.selling_price || 0), 0)
  const totalProfit = transformedData.reduce((sum, item) => sum + item.profit_loss, 0)

  return new Response(
    JSON.stringify({
      success: true,
      type: 'sold',
      summary: {
        total_items: transformedData.length,
        total_units_sold: transformedData.reduce((sum, item) => sum + (item.sold || 0), 0),
        total_revenue: totalRevenue,
        total_profit: totalProfit,
        date: date
      },
      data: transformedData
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// Handle transfer data - items transferred between locations
async function handleTransferData(supabase: SupabaseClientType, date: string, location?: string | null) {
  console.log(`Fetching transfer data for date: ${date}`)
  
  // Look for stock events with transfer type
  const { data, error } = await supabase
    .from('stock_events')
    .select(`
      id, date, imei, event_type, qty, notes, label, metadata,
      phone_models (id, brand, model, storage_capacity, color, srp),
      stock_locations (id, name, description)
    `)
    .eq('date', date)
    .in('event_type', ['transfer_in', 'transfer_out'])
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Database error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch transfer data', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  interface TransferEvent {
    id: number
    date: string
    imei: string
    event_type: string
    qty: number
    notes: string | null
    label: string | null
    metadata: Record<string, unknown>
    phone_models: PhoneModel | null
    stock_locations: StockLocation | null
  }

  const typedData = (data || []) as unknown as TransferEvent[]
  
  let filtered = typedData
  if (location) {
    filtered = filtered.filter(item => 
      item.stock_locations?.name?.toLowerCase().includes(location.toLowerCase())
    )
  }

  const transformedData = filtered.map(item => ({
    id: item.id,
    date: item.date,
    imei: item.imei,
    brand: item.phone_models?.brand || null,
    model: item.phone_models?.model || null,
    storage: item.phone_models?.storage_capacity || null,
    color: item.phone_models?.color || null,
    location: item.stock_locations?.name || null,
    transfer_type: item.event_type,
    quantity: item.qty,
    from_location: item.event_type === 'transfer_out' ? item.stock_locations?.name : (item.metadata?.from_location || null),
    to_location: item.event_type === 'transfer_in' ? item.stock_locations?.name : (item.metadata?.to_location || null),
    notes: item.notes
  }))

  return new Response(
    JSON.stringify({
      success: true,
      type: 'transfer',
      summary: {
        total_transfers: transformedData.length,
        transfer_in: transformedData.filter(t => t.transfer_type === 'transfer_in').length,
        transfer_out: transformedData.filter(t => t.transfer_type === 'transfer_out').length,
        date: date
      },
      data: transformedData
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// Handle incoming data - items that arrived on the specified date
async function handleIncomingData(supabase: SupabaseClientType, date: string, location?: string | null, brand?: string | null) {
  console.log(`Fetching incoming data for date: ${date}`)
  
  const { data, error } = await supabase
    .from('stock_entries')
    .select(`
      id, date, imei, incoming, cost_price, notes, label,
      phone_models (id, brand, model, storage_capacity, color, srp),
      stock_locations (id, name, description)
    `)
    .eq('date', date)
    .gt('incoming', 0)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Database error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch incoming data', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const typedData = (data || []) as unknown as StockEntry[]
  const filtered = applyFilters(typedData, location, brand)

  const transformedData = filtered.map(item => ({
    id: item.id,
    date: item.date,
    imei: item.imei,
    brand: item.phone_models?.brand || null,
    model: item.phone_models?.model || null,
    storage: item.phone_models?.storage_capacity || null,
    color: item.phone_models?.color || null,
    location: item.stock_locations?.name || null,
    incoming: item.incoming,
    cost_price: item.cost_price,
    srp: item.phone_models?.srp || null,
    notes: item.notes,
    label: item.label
  }))

  return new Response(
    JSON.stringify({
      success: true,
      type: 'incoming',
      summary: {
        total_items: transformedData.length,
        total_units: transformedData.reduce((sum, item) => sum + (item.incoming || 0), 0),
        total_cost: transformedData.reduce((sum, item) => sum + (item.cost_price || 0), 0),
        date: date
      },
      data: transformedData
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// Handle morning stock
async function handleMorningStock(supabase: SupabaseClientType, date: string, location?: string | null, brand?: string | null) {
  console.log(`Fetching morning stock for date: ${date}`)
  
  const { data, error } = await supabase
    .from('stock_entries')
    .select(`
      id, date, imei, morning_stock, notes, label,
      phone_models (id, brand, model, storage_capacity, color, srp),
      stock_locations (id, name, description)
    `)
    .eq('date', date)
    .gt('morning_stock', 0)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Database error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch morning stock', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const typedData = (data || []) as unknown as StockEntry[]
  const filtered = applyFilters(typedData, location, brand)

  const transformedData = filtered.map(item => ({
    id: item.id,
    date: item.date,
    imei: item.imei,
    brand: item.phone_models?.brand || null,
    model: item.phone_models?.model || null,
    storage: item.phone_models?.storage_capacity || null,
    color: item.phone_models?.color || null,
    location: item.stock_locations?.name || null,
    morning_stock: item.morning_stock,
    srp: item.phone_models?.srp || null,
    label: item.label
  }))

  return new Response(
    JSON.stringify({
      success: true,
      type: 'morning',
      summary: {
        total_items: transformedData.length,
        total_stock: transformedData.reduce((sum, item) => sum + (item.morning_stock || 0), 0),
        date: date
      },
      data: transformedData
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// Handle night stock
async function handleNightStock(supabase: SupabaseClientType, date: string, location?: string | null, brand?: string | null) {
  console.log(`Fetching night stock for date: ${date}`)
  
  const { data, error } = await supabase
    .from('stock_entries')
    .select(`
      id, date, imei, night_stock, notes, label,
      phone_models (id, brand, model, storage_capacity, color, srp),
      stock_locations (id, name, description)
    `)
    .eq('date', date)
    .gt('night_stock', 0)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Database error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch night stock', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const typedData = (data || []) as unknown as StockEntry[]
  const filtered = applyFilters(typedData, location, brand)

  const transformedData = filtered.map(item => ({
    id: item.id,
    date: item.date,
    imei: item.imei,
    brand: item.phone_models?.brand || null,
    model: item.phone_models?.model || null,
    storage: item.phone_models?.storage_capacity || null,
    color: item.phone_models?.color || null,
    location: item.stock_locations?.name || null,
    night_stock: item.night_stock,
    srp: item.phone_models?.srp || null,
    label: item.label
  }))

  return new Response(
    JSON.stringify({
      success: true,
      type: 'night',
      summary: {
        total_items: transformedData.length,
        total_stock: transformedData.reduce((sum, item) => sum + (item.night_stock || 0), 0),
        date: date
      },
      data: transformedData
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// Handle sales summary - total sales per brand and overall
async function handleSalesSummary(supabase: SupabaseClientType, date: string, location?: string | null) {
  console.log(`Fetching sales summary for date: ${date}`)
  
  // Get today's data
  const { data: todayData, error: todayError } = await supabase
    .from('stock_entries')
    .select(`
      id, date, imei, sold, selling_price, cost_price,
      phone_models (id, brand, model, storage_capacity, color, srp),
      stock_locations (id, name, description)
    `)
    .eq('date', date)
    .gt('sold', 0)

  if (todayError) {
    console.error('Database error:', todayError)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch sales summary', details: todayError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get yesterday's data
  const yesterday = new Date(date)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const { data: yesterdayData, error: yesterdayError } = await supabase
    .from('stock_entries')
    .select(`
      id, date, imei, sold, selling_price, cost_price,
      phone_models (id, brand, model, storage_capacity, color, srp),
      stock_locations (id, name, description)
    `)
    .eq('date', yesterdayStr)
    .gt('sold', 0)

  if (yesterdayError) {
    console.error('Database error for yesterday:', yesterdayError)
  }

  const typedTodayData = (todayData || []) as unknown as StockEntry[]
  const typedYesterdayData = (yesterdayData || []) as unknown as StockEntry[]

  // Apply location filter
  let filteredToday = typedTodayData
  let filteredYesterday = typedYesterdayData
  if (location) {
    filteredToday = filteredToday.filter(item => 
      item.stock_locations?.name?.toLowerCase().includes(location.toLowerCase())
    )
    filteredYesterday = filteredYesterday.filter(item => 
      item.stock_locations?.name?.toLowerCase().includes(location.toLowerCase())
    )
  }

  // Calculate sales by brand for today
  const todayByBrand: Record<string, { units: number; revenue: number; profit: number }> = {}
  filteredToday.forEach(item => {
    const brand = item.phone_models?.brand || 'Unknown'
    if (!todayByBrand[brand]) {
      todayByBrand[brand] = { units: 0, revenue: 0, profit: 0 }
    }
    todayByBrand[brand].units += item.sold || 0
    todayByBrand[brand].revenue += item.selling_price || 0
    todayByBrand[brand].profit += (item.selling_price || 0) - (item.cost_price || item.phone_models?.srp || 0)
  })

  // Calculate sales by brand for yesterday
  const yesterdayByBrand: Record<string, { units: number; revenue: number; profit: number }> = {}
  filteredYesterday.forEach(item => {
    const brand = item.phone_models?.brand || 'Unknown'
    if (!yesterdayByBrand[brand]) {
      yesterdayByBrand[brand] = { units: 0, revenue: 0, profit: 0 }
    }
    yesterdayByBrand[brand].units += item.sold || 0
    yesterdayByBrand[brand].revenue += item.selling_price || 0
    yesterdayByBrand[brand].profit += (item.selling_price || 0) - (item.cost_price || item.phone_models?.srp || 0)
  })

  // Calculate totals
  const todayTotal = {
    units: filteredToday.reduce((sum, item) => sum + (item.sold || 0), 0),
    revenue: filteredToday.reduce((sum, item) => sum + (item.selling_price || 0), 0),
    profit: filteredToday.reduce((sum, item) => sum + ((item.selling_price || 0) - (item.cost_price || item.phone_models?.srp || 0)), 0)
  }

  const yesterdayTotal = {
    units: filteredYesterday.reduce((sum, item) => sum + (item.sold || 0), 0),
    revenue: filteredYesterday.reduce((sum, item) => sum + (item.selling_price || 0), 0),
    profit: filteredYesterday.reduce((sum, item) => sum + ((item.selling_price || 0) - (item.cost_price || item.phone_models?.srp || 0)), 0)
  }

  return new Response(
    JSON.stringify({
      success: true,
      type: 'sales-summary',
      today: {
        date: date,
        total: todayTotal,
        by_brand: todayByBrand
      },
      yesterday: {
        date: yesterdayStr,
        total: yesterdayTotal,
        by_brand: yesterdayByBrand
      },
      comparison: {
        units_change: todayTotal.units - yesterdayTotal.units,
        revenue_change: todayTotal.revenue - yesterdayTotal.revenue,
        profit_change: todayTotal.profit - yesterdayTotal.profit
      }
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// Handle monthly recap - sales grouped by date and model
async function handleMonthlyRecap(supabase: SupabaseClientType, month: string, location?: string | null, brand?: string | null) {
  console.log(`Fetching monthly recap for month: ${month}, location: ${location}, brand: ${brand}`)

  // Calculate date range for the month
  const startDate = `${month}-01`
  const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0)
    .toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('stock_entries')
    .select(`
      date, sold, selling_price, cost_price, imei,
      phone_models (brand, model, storage_capacity, color, srp),
      stock_locations (name)
    `)
    .gte('date', startDate)
    .lte('date', endDate)
    .gt('sold', 0)
    .order('date', { ascending: true })

  if (error) {
    console.error('Database error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch monthly recap', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const typedData = (data || []) as unknown as StockEntry[]
  const filtered = applyFilters(typedData, location, brand)

  // Group by date, then by model
  const byDate: Record<string, {
    date: string
    total_sold: number
    total_revenue: number
    models: Record<string, { brand: string; model: string; storage: string; qty: number; revenue: number }>
  }> = {}

  filtered.forEach(item => {
    const d = item.date
    if (!byDate[d]) {
      byDate[d] = { date: d, total_sold: 0, total_revenue: 0, models: {} }
    }

    const brand = item.phone_models?.brand || 'Unknown'
    const model = item.phone_models?.model || 'Unknown'
    const storage = item.phone_models?.storage_capacity || ''
    const key = `${brand} ${model} ${storage}`.trim()

    if (!byDate[d].models[key]) {
      byDate[d].models[key] = { brand, model, storage, qty: 0, revenue: 0 }
    }

    byDate[d].models[key].qty += item.sold || 0
    byDate[d].models[key].revenue += item.selling_price || 0
    byDate[d].total_sold += item.sold || 0
    byDate[d].total_revenue += item.selling_price || 0
  })

  // Transform to array format
  const recap = Object.values(byDate).map(day => ({
    date: day.date,
    total_sold: day.total_sold,
    total_revenue: day.total_revenue,
    items: Object.values(day.models).sort((a, b) => b.qty - a.qty)
  }))

  // Build brand summary
  const brandMap: Record<string, { brand: string; total_sold: number; models: Record<string, { model: string; storage: string; qty: number }> }> = {}
  filtered.forEach(item => {
    const b = item.phone_models?.brand || 'Unknown'
    const model = item.phone_models?.model || 'Unknown'
    const storage = item.phone_models?.storage_capacity || ''
    const modelKey = `${model} ${storage}`.trim()

    if (!brandMap[b]) {
      brandMap[b] = { brand: b, total_sold: 0, models: {} }
    }
    if (!brandMap[b].models[modelKey]) {
      brandMap[b].models[modelKey] = { model, storage, qty: 0 }
    }
    brandMap[b].models[modelKey].qty += item.sold || 0
    brandMap[b].total_sold += item.sold || 0
  })

  const brand_summary = Object.values(brandMap)
    .map(b => ({
      brand: b.brand,
      total_sold: b.total_sold,
      models: Object.values(b.models).sort((a, c) => c.qty - a.qty)
    }))
    .sort((a, c) => c.total_sold - a.total_sold)

  const grandTotal = {
    total_sold: recap.reduce((s, d) => s + d.total_sold, 0),
    total_revenue: recap.reduce((s, d) => s + d.total_revenue, 0),
    days_with_sales: recap.length
  }

  return new Response(
    JSON.stringify({
      success: true,
      type: 'monthly-recap',
      month,
      filters: { location: location || null, brand: brand || null },
      grand_total: grandTotal,
      brand_summary,
      data: recap
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// Default stock handler (original functionality)
async function handleDefaultStock(supabase: SupabaseClientType, date: string, location?: string | null, brand?: string | null, availableOnly?: boolean) {
  console.log(`Fetching stock for date: ${date}, location: ${location}, brand: ${brand}, available: ${availableOnly}`)

  let query = supabase
    .from('stock_entries')
    .select(`
      id, date, imei, morning_stock, night_stock, incoming, sold, returns, adjustment,
      cost_price, selling_price, notes, label, metadata,
      phone_models (id, brand, model, storage_capacity, color, srp),
      stock_locations (id, name, description)
    `)
    .eq('date', date)
    .order('created_at', { ascending: false })

  if (availableOnly) {
    query = query.gt('night_stock', 0)
  }

  const { data, error } = await query

  if (error) {
    console.error('Database error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch stock data', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const typedData = (data || []) as unknown as StockEntry[]
  const filtered = applyFilters(typedData, location, brand)

  const transformedData = filtered.map(item => ({
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
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
