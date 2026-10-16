# Stock API Documentation

## Overview

Stock API adalah endpoint REST untuk mengakses data stok HP secara eksternal. API ini menyediakan informasi lengkap tentang stok termasuk brand, model, storage, warna, IMEI, dan harga.

---

## Base URL

```
https://jbyqdwhqfedmuekrpdsx.supabase.co/functions/v1/stock-api
```

---

## Authentication

API menggunakan API Key authentication. Setiap request harus menyertakan header `x-api-key`.

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `x-api-key` | string | ✅ Yes | API key untuk autentikasi |

### Contoh Header

```
x-api-key: YOUR_API_KEY_HERE
```

---

## Endpoints

### GET /stock-api

Mengambil data stok berdasarkan tanggal dan filter opsional.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `date` | string | No | Hari ini | Tanggal dalam format `YYYY-MM-DD` |
| `location` | string | No | - | Filter berdasarkan nama lokasi (partial match) |
| `brand` | string | No | - | Filter berdasarkan nama brand (partial match) |
| `available` | boolean | No | false | Jika `true`, hanya tampilkan stok yang tersedia (night_stock > 0) |

---

## Request Examples

### 1. Basic Request - Semua Stok Hari Ini

```bash
curl -X GET \
  'https://jbyqdwhqfedmuekrpdsx.supabase.co/functions/v1/stock-api' \
  -H 'x-api-key: YOUR_API_KEY'
```

### 2. Stok Tanggal Tertentu

```bash
curl -X GET \
  'https://jbyqdwhqfedmuekrpdsx.supabase.co/functions/v1/stock-api?date=2025-01-20' \
  -H 'x-api-key: YOUR_API_KEY'
```

### 3. Filter by Location

```bash
curl -X GET \
  'https://jbyqdwhqfedmuekrpdsx.supabase.co/functions/v1/stock-api?location=MBUTOH' \
  -H 'x-api-key: YOUR_API_KEY'
```

### 4. Filter by Brand

```bash
curl -X GET \
  'https://jbyqdwhqfedmuekrpdsx.supabase.co/functions/v1/stock-api?brand=Samsung' \
  -H 'x-api-key: YOUR_API_KEY'
```

### 5. Hanya Stok Tersedia

```bash
curl -X GET \
  'https://jbyqdwhqfedmuekrpdsx.supabase.co/functions/v1/stock-api?available=true' \
  -H 'x-api-key: YOUR_API_KEY'
```

### 6. Kombinasi Filter

```bash
curl -X GET \
  'https://jbyqdwhqfedmuekrpdsx.supabase.co/functions/v1/stock-api?date=2025-01-20&location=MBUTOH&brand=iPhone&available=true' \
  -H 'x-api-key: YOUR_API_KEY'
```

---

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "summary": {
    "total_items": 25,
    "total_stock": 45,
    "total_sold": 3,
    "total_incoming": 5,
    "date": "2025-01-22",
    "filters_applied": {
      "location": null,
      "brand": null,
      "available_only": false
    }
  },
  "data": [
    {
      "id": "uuid-here",
      "date": "2025-01-22",
      "imei": "123456789012345",
      "brand": "Samsung",
      "model": "Galaxy A54",
      "storage": "128GB",
      "color": "Black",
      "location": "MBUTOH",
      "morning_stock": 1,
      "night_stock": 1,
      "incoming": 0,
      "sold": 0,
      "returns": 0,
      "adjustment": 0,
      "cost_price": 3500000,
      "selling_price": 4000000,
      "srp": 4200000,
      "notes": "Unit baru",
      "label": "NEW",
      "metadata": {
        "supplier": "PT ABC",
        "invoice": "INV-001"
      }
    }
  ]
}
```

### Response Fields

#### Summary Object

| Field | Type | Description |
|-------|------|-------------|
| `total_items` | integer | Jumlah item dalam response |
| `total_stock` | integer | Total stok malam (night_stock) |
| `total_sold` | integer | Total unit terjual |
| `total_incoming` | integer | Total unit masuk |
| `date` | string | Tanggal data |
| `filters_applied` | object | Filter yang digunakan |

#### Data Array Items

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID unik untuk entry |
| `date` | string | Tanggal entry (YYYY-MM-DD) |
| `imei` | string | Nomor IMEI HP |
| `brand` | string | Merek HP (Samsung, iPhone, dll) |
| `model` | string | Model HP |
| `storage` | string | Kapasitas penyimpanan (64GB, 128GB, dll) |
| `color` | string | Warna HP |
| `location` | string | Nama lokasi/cabang |
| `morning_stock` | integer | Stok awal pagi |
| `night_stock` | integer | Stok akhir malam |
| `incoming` | integer | Unit masuk hari itu |
| `sold` | integer | Unit terjual hari itu |
| `returns` | integer | Unit retur hari itu |
| `adjustment` | integer | Penyesuaian stok |
| `cost_price` | number | Harga modal |
| `selling_price` | number | Harga jual |
| `srp` | number | Suggested Retail Price |
| `notes` | string | Catatan |
| `label` | string | Label (NEW, SECOND, dll) |
| `metadata` | object | Data tambahan (supplier, invoice, dll) |

---

## Error Responses

### 401 Unauthorized

API key tidak valid atau tidak disertakan.

```json
{
  "error": "Unauthorized - Invalid API key"
}
```

### 500 Internal Server Error

Terjadi kesalahan pada server.

```json
{
  "error": "Failed to fetch stock data",
  "details": "Error message here"
}
```

```json
{
  "error": "Internal server error",
  "details": "Error message here"
}
```

---

## Code Examples

### JavaScript (Fetch)

```javascript
const API_URL = 'https://jbyqdwhqfedmuekrpdsx.supabase.co/functions/v1/stock-api';
const API_KEY = 'YOUR_API_KEY';

async function getStock(options = {}) {
  const params = new URLSearchParams();
  
  if (options.date) params.append('date', options.date);
  if (options.location) params.append('location', options.location);
  if (options.brand) params.append('brand', options.brand);
  if (options.available) params.append('available', 'true');
  
  const url = `${API_URL}?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  
  return response.json();
}

// Usage
getStock({ location: 'MBUTOH', available: true })
  .then(data => console.log(data))
  .catch(error => console.error(error));
```

### Python

```python
import requests

API_URL = 'https://jbyqdwhqfedmuekrpdsx.supabase.co/functions/v1/stock-api'
API_KEY = 'YOUR_API_KEY'

def get_stock(date=None, location=None, brand=None, available=False):
    params = {}
    if date:
        params['date'] = date
    if location:
        params['location'] = location
    if brand:
        params['brand'] = brand
    if available:
        params['available'] = 'true'
    
    headers = {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
    }
    
    response = requests.get(API_URL, params=params, headers=headers)
    response.raise_for_status()
    return response.json()

# Usage
data = get_stock(location='MBUTOH', available=True)
print(data)
```

### PHP

```php
<?php
$apiUrl = 'https://jbyqdwhqfedmuekrpdsx.supabase.co/functions/v1/stock-api';
$apiKey = 'YOUR_API_KEY';

function getStock($options = []) {
    global $apiUrl, $apiKey;
    
    $params = http_build_query($options);
    $url = $apiUrl . '?' . $params;
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'x-api-key: ' . $apiKey,
        'Content-Type: application/json'
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        throw new Exception("API Error: $httpCode");
    }
    
    return json_decode($response, true);
}

// Usage
$data = getStock(['location' => 'MBUTOH', 'available' => 'true']);
print_r($data);
?>
```

---

## Rate Limiting

Saat ini tidak ada rate limiting yang diterapkan. Namun, disarankan untuk:
- Tidak melakukan lebih dari 60 request per menit
- Gunakan caching di sisi client jika memungkinkan
- Batch request jika perlu data dari beberapa tanggal

---

## Best Practices

1. **Simpan API Key dengan aman** - Jangan expose API key di client-side code
2. **Gunakan filter** - Gunakan parameter filter untuk mengurangi data yang dikembalikan
3. **Cache response** - Cache data yang tidak sering berubah
4. **Handle errors** - Selalu handle error response dengan baik
5. **Gunakan HTTPS** - Selalu gunakan HTTPS untuk keamanan

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-22 | Initial release |

---

## Support

Jika ada pertanyaan atau masalah, silakan hubungi administrator sistem.
