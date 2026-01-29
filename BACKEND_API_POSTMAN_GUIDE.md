# ROMIMI Backend API — Postman test qo‘llanmasi

**Base URL:** `http://localhost:5031/api` (yoki production: `http://167.172.90.235:5031/api`)

**Authentication:** Ko‘pchiga endpointlar JWT kerak. `Authorization: Bearer <access_token>` headerida yuboriladi.

---

## 1. Umumiy tartib (ketma-ketlik)

1. **Health** — server ishlayotganini tekshirish  
2. **Auth** — Register yoki Login → `access_token` olish  
3. **Brand** — Brand yaratish (majburiy)  
4. **Collection** — Collection yaratish (brand_id kerak)  
5. **Product** — Product yaratish (rasm + name + collection_id)  
6. **Product Analyze** — Mahsulotni Claude orqali tahlil  
7. **Product JSON** — (ixtiyoriy) Foydalanuvchi tahriri  
8. **Collection DA** — (ixtiyoriy) DA rasmini yuklash va tahlil  
9. **Generation** — Generation yaratish → Merge → Generate  
10. **Download** — ZIP yuklash  
11. **Users, Ad Recreation** — kerak bo‘lsa  

---

## 1.1 API yaratish / o‘zgartirishda Postman hujjati (qoida)

**Har safar API yaratilsa yoki o‘zgartirilsa**, ushbu qo‘llanmaga quyidagi formatda bo‘lim qo‘shiladi:

1. **Request**
   - **Method** — GET / POST / PUT / PATCH / DELETE
   - **URL** — `{{baseUrl}}/...` ( Postman env: `baseUrl` )
   - **Headers** — `Authorization: Bearer {{access_token}}`, `Content-Type` (agar kerak bo‘lsa). FormData uchun Content-Type qo‘yilmasin.
   - **Body** — `none` / `form-data` (file + text) / `raw JSON` — aniq kalitlar va qiymatlar ko‘rsatiladi.

2. **Postmanda qanday test qilish**
   - Qadam-baqadam: **Body** tab → **form-data** yoki **raw** tanlash, kalitlarni kiritish, fayllarni **File** qilib yuklash.
   - Kerak bo‘lsa: **Pre-request Script** yoki **Tests** da `pm.environment.set(...)` bilan `product_id`, `collection_id` va hokazo saqlash.

3. **Kutiladigan javob**
   - **Muvaffaqiyat:** status code (200, 201, ...) va **aniq JSON** struktura (misol).
   - **Xato:** 400, 401, 403, 404, 422 va hokazo — **aniq `message`** va ixtiyoriy `error`, `statusCode`.

4. **DB ta’siri**
   - Qaysi jadvalga qanday yoziladi / yangilanadi / o‘chiriladi — qisqacha.

5. **Postman:** kerakli `_id` larni saqlash — **Collection** / **Environment** da keyingi so‘rovlar uchun.

Har bir yangi yoki o‘zgargan endpoint uchun yuqoridagi struktura saqlanadi. Misol: **3.8 POST `/api/products`** (batafsil).

---

## 2. Barcha API ro‘yxati

### 2.1 App (Public)

| # | Method | Endpoint | Auth | Tavsif |
|---|--------|----------|------|--------|
| 1 | GET | `/api` | — | Hello |
| 2 | GET | `/api/health` | — | Health check |

### 2.2 Auth (Public)

| # | Method | Endpoint | Auth | Tavsif |
|---|--------|----------|------|--------|
| 3 | POST | `/api/auth/register` | — | Ro‘yxatdan o‘tish |
| 4 | POST | `/api/auth/login` | — | Login |

### 2.3 Brands (JWT)

| # | Method | Endpoint | Auth | Tavsif |
|---|--------|----------|------|--------|
| 5 | GET | `/api/brands/getAllBrands` | JWT | Barcha brendlar |
| 6 | GET | `/api/brands/getBrand/:id` | JWT | Bitta brend |
| 7 | POST | `/api/brands/createBrand` | JWT | Brand yaratish |
| 8 | POST | `/api/brands/updateBrand/:id` | JWT | Brand yangilash |
| 9 | POST | `/api/brands/deleteBrand/:id` | JWT | Brand o‘chirish |

### 2.4 Collections (JWT)

| # | Method | Endpoint | Auth | Tavsif |
|---|--------|----------|------|--------|
| 10 | GET | `/api/collections/decorators` | — | DA shablonlar (public) |
| 11 | GET | `/api/collections/decorators/:code` | — | Bitta DA shablon (public) |
| 12 | GET | `/api/collections/getAllCollections` | JWT | Barcha kolleksiyalar |
| 13 | GET | `/api/collections/getCollectionsByBrand/:brandId` | JWT | Brend bo‘yicha kolleksiyalar |
| 14 | POST | `/api/collections/createCollection` | JWT | Kolleksiya yaratish |
| 15 | POST | `/api/collections/updateCollection/:id` | JWT | Kolleksiya yangilash |
| 16 | POST | `/api/collections/updateFixedElements/:id` | JWT | Fixed elements yangilash |
| 17 | POST | `/api/collections/updatePromptTemplates/:id` | JWT | Prompt shablonlari |
| 18 | POST | `/api/collections/deleteCollection/:id` | JWT | Kolleksiya o‘chirish |
| 19 | POST | `/api/collections/:id/analyze-da` | JWT | DA rasm tahlil (FormData: image) |
| 20 | POST | `/api/collections/updateDAJson/:id` | JWT | DA JSON tahrir |
| 21 | GET | `/api/collections/getCollection/:id` | JWT | Kolleksiya + DA ma’lumot |

### 2.5 Products (JWT)

| # | Method | Endpoint | Auth | Tavsif |
|---|--------|----------|------|--------|
| 22 | POST | `/api/products` | JWT | Product yaratish (FormData) |
| 23 | GET | `/api/products/getAllProducts` | JWT | Barcha mahsulotlar |
| 24 | POST | `/api/products/updateProduct/:id` | JWT | Mahsulot yangilash |
| 25 | POST | `/api/products/deleteProduct/:id` | JWT | Mahsulot o‘chirish |
| 26 | POST | `/api/products/analyze-images` | JWT | Rasmlarni tahlil (images[] + productName) |
| 27 | POST | `/api/products/:id/analyze` | JWT | Mahsulot Claude tahlil |
| 28 | POST | `/api/products/updateProductJson/:id` | JWT | Product JSON tahrir |
| 29 | GET | `/api/products/getProduct/:id` | JWT | Bitta mahsulot |

### 2.6 Generations (JWT)

| # | Method | Endpoint | Auth | Tavsif |
|---|--------|----------|------|--------|
| 30 | POST | `/api/generations/createGeneration` | JWT | Generation yaratish |
| 31 | GET | `/api/generations/getAllGenerations` | JWT | Barcha generatsiyalar |
| 32 | GET | `/api/generations/getGeneration/:id` | JWT | Bitta generation |
| 33 | POST | `/api/generations/:id/merge` | JWT | Merge prompts |
| 34 | POST | `/api/generations/updateMergedPrompts/:id` | JWT | Merged prompts tahrir |
| 35 | GET | `/api/generations/getPrompts/:id` | JWT | Prompts ko‘rish |
| 36 | POST | `/api/generations/:id/generate` | JWT | Rasmlar generatsiya |
| 37 | POST | `/api/generations/reset/:id` | JWT | Generation qayta boshlash |
| 38 | GET | `/api/generations/getProgress/:id` | JWT | Progress |
| 39 | GET | `/api/generations/download/:id` | JWT | ZIP yuklash |
| 40 | POST | `/api/generations/:generationId/visual/:index/retry` | JWT | Bitta visual qayta generatsiya |
| 41 | GET | `/api/generations/debug/config` | JWT | Debug config |
| 42 | POST | `/api/generations/debug/test-job` | JWT | Test job |
| 43 | POST | `/api/generations/debug/clear-queue` | JWT | Queue tozalash |

### 2.7 Files (JWT)

| # | Method | Endpoint | Auth | Tavsif |
|---|--------|----------|------|--------|
| 44 | POST | `/api/files/uploadImage` | JWT | Rasm yuklash (FormData: file) |

### 2.8 Users (JWT)

| # | Method | Endpoint | Auth | Tavsif |
|---|--------|----------|------|--------|
| 45 | GET | `/api/users/getUser` | JWT | Joriy user |
| 46 | POST | `/api/users/updateUser` | JWT | User yangilash |

### 2.9 Ad Recreation (JWT)

| # | Method | Endpoint | Auth | Tavsif |
|---|--------|----------|------|--------|
| 47 | POST | `/api/ad-recreation` | JWT | Ad recreation yaratish |
| 48 | GET | `/api/ad-recreation` | JWT | Barcha ad recreations |
| 49 | GET | `/api/ad-recreation/:id` | JWT | Bitta ad recreation |
| 50 | POST | `/api/ad-recreation/:id/analyze` | JWT | Reklamani tahlil |
| 51 | POST | `/api/ad-recreation/:id/generate` | JWT | Variatsiyalar generatsiya |
| 52 | POST | `/api/ad-recreation/deleteAdRecreation/:id` | JWT | O‘chirish |

### 2.10 DA (Art Direction) — Phase 2

| # | Method | Endpoint | Auth | Tavsif |
|---|--------|----------|------|--------|
| 53 | POST | `/api/da/analyze` | JWT | **DA Reference Analysis** (FormData: image) — Claude AI |
| 54 | GET | `/api/da/presets` | JWT | Barcha DA Presets (system + user) |
| 55 | GET | `/api/da/presets/defaults` | — | Faqat system presets (public) |
| 56 | GET | `/api/da/presets/:id` | JWT | Bitta preset (ID bo'yicha) |
| 57 | GET | `/api/da/presets/code/:code` | — | Bitta preset (code bo'yicha, public) |
| 58 | POST | `/api/da/presets` | JWT | Analyzed result'ni preset sifatida saqlash |
| 59 | POST | `/api/da/presets/delete/:id` | JWT | User preset o'chirish (system emas) |

### 2.11 SSE (ixtiyoriy)

| # | Method | Endpoint | Auth | Tavsif |
|---|--------|----------|------|--------|
| 60 | GET | `/api/generations/:id/stream?token=<JWT>` | Query token | SSE progress |

---

## 3. Postman orqali ketma-ket test qilish

### 3.0 Postman sozlash

- **Base URL:** `{{baseUrl}}` = `http://localhost:5031/api`
- **Token:** Login/Register dan `access_token` oling. Keyin:
  - **Authorization** tab → Type: Bearer Token → Token: `{{access_token}}`
  - yoki **Headers:** `Authorization: Bearer {{access_token}}`

---

### 3.1 GET `/api/health` (Public)

**Request:**
- Method: `GET`
- URL: `{{baseUrl}}/health`
- Headers: yo‘q

**Kutiladigan javob (200):**
```json
{
  "ok": true,
  "timestamp": "2026-01-27T12:00:00.000Z"
}
```

**DB:** Hech narsa o‘zgarmaydi.

---

### 3.2 POST `/api/auth/register` (Public)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/auth/register`
- Headers: `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "email": "test@example.com",
  "password": "MySecurePass123",
  "name": "Test User"
}
```
- Parol: kamida 8 belgi, bitta katta, bitta kichik, bitta raqam.

**Kutiladigan javob (201):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "test@example.com",
    "name": "Test User"
  }
}
```

**DB:** `users` jadvaliga yangi qator:
- `id`, `email`, `password_hash`, `name`, `created_at`, `updated_at`

**Postman:** `access_token` ni environment variable sifatida saqlang (masalan `access_token`).

---

### 3.3 POST `/api/auth/login` (Public)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/auth/login`
- Headers: `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "email": "test@example.com",
  "password": "MySecurePass123"
}
```

**Kutiladigan javob (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "test@example.com",
    "name": "Test User"
  }
}
```

**DB:** O‘zgarish yo‘q. Faqat JWT beriladi.

---

### 3.4 POST `/api/brands/createBrand` (JWT)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/brands/createBrand`
- Headers: `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- Body (raw JSON):
```json
{
  "name": "Test Brand",
  "brand_brief": "Premium streetwear brand."
}
```

**Kutiladigan javob (201):**
```json
{
  "id": "brand-uuid",
  "user_id": "user-uuid",
  "name": "Test Brand",
  "brand_brief": "Premium streetwear brand.",
  "logo_url": null,
  "created_at": "...",
  "updated_at": "..."
}
```

**DB:** `brands` jadvaliga yangi qator. `user_id` = JWT dagi user.

**Postman:** `brand_id` ni saqlang (keyingi qadamlar uchun).

---

### 3.5 GET `/api/brands/getAllBrands` (JWT)

**Request:**
- Method: `GET`
- URL: `{{baseUrl}}/brands/getAllBrands`
- Headers: `Authorization: Bearer {{access_token}}`

**Kutiladigan javob (200):** Brand objectlari massivi.

**DB:** O‘zgarish yo‘q.

---

### 3.6 POST `/api/collections/createCollection` (JWT)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/collections/createCollection`
- Headers: `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- Body (raw JSON):
```json
{
  "name": "SS26",
  "brand_id": "brand-uuid-from-step-3.4"
}
```
- Ixtiyoriy: `code`, `description`, `fixed_elements`, `prompt_templates`

**Kutiladigan javob (201):**
```json
{
  "id": "collection-uuid",
  "brand_id": "brand-uuid",
  "name": "SS26",
  "code": "ss26-xxx",
  "description": null,
  "da_reference_image_url": null,
  "analyzed_da_json": null,
  "fixed_elements": null,
  "prompt_templates": null,
  "is_preset": false,
  "created_at": "...",
  "updated_at": "..."
}
```

**DB:** `collections` jadvaliga yangi qator. `code` unique bo‘ladi.

**Postman:** `collection_id` ni saqlang.

---

### 3.7 GET `/api/collections/getCollectionsByBrand/:brandId` (JWT)

**Request:**
- Method: `GET`
- URL: `{{baseUrl}}/collections/getCollectionsByBrand/{{brand_id}}`
- Headers: `Authorization: Bearer {{access_token}}`

**Kutiladigan javob (200):** Collection objectlari massivi.

**DB:** O‘zgarish yo‘q.

---

### 3.8 POST `/api/products` — Product yaratish (JWT, FormData)

**Request:**
- **Method:** `POST`
- **URL:** `{{baseUrl}}/products`
- **Headers:** `Authorization: Bearer {{access_token}}`. **Content-Type qo‘ymang** — Postman `multipart/form-data` ni avtomatik qo‘yadi.
- **Body:** **form-data** (none emas, raw emas).

| Key | Type | Required | Qayd |
|-----|------|----------|------|
| `name` | Text | ✅ | Mahsulot nomi, max 255 belgi. Masalan: `Polo Bleu Ardoise`, `Zip Tracksuit Forest Green`. |
| `collection_id` | Text | ✅ | Collection UUID. Avval `POST /api/collections/createCollection` orqali olingan `id`. |
| `front_image` | File | ✅ | Old packshot (oldingi ko‘rinish). **Majburiy.** Rasm fayl (jpg, png, …). |
| `back_image` | File | ❌ | Orqa packshot. Ixtiyoriy. |
| `reference_images` | File | ❌ | Qo‘shimcha referens rasmlar (logolar, detallar). Ixtiyoriy, **maksimal 12 ta**. |

---

#### Postmanda qanday test qilish (qadam-baqadam)

1. **Request yaratish**
   - Postman da yangi request: **Method** = `POST`, **URL** = `{{baseUrl}}/products`.
   - **Authorization** tab: Type = **Bearer Token**, Token = `{{access_token}}`.

2. **Body ni to‘ldirish**
   - **Body** tab → **form-data** tanlang.
   - Quyidagi qatorlarni qo‘shing:

     | KEY | TYPE | VALUE |
     |-----|------|--------|
     | `name` | Text | `Test Product` (yoki ixtiyoriy nom) |
     | `collection_id` | Text | `{{collection_id}}` yoki haqiqiy collection UUID |
     | `front_image` | File | **Select Files** — bitta rasm tanlang (front packshot) |
     | `back_image` | File | (ixtiyoriy) Orqa rasm |
     | `reference_images` | File | (ixtiyoriy) 1–12 ta rasm — bir xil key da bir nechta file qo‘shish mumkin emas; har biri uchun alohida `reference_images` qator qo‘shib, **File** tanlang. |

   - **Eslatma:** `reference_images` uchun ba’zi serverlar `reference_images[]` yoki bitta key ga bir nechta fayl qabul qiladi. Bizda hozircha bitta `reference_images` key bo‘yicha **bitta** fayl yuboriladi; ko‘p fayl kerak bo‘lsa, key ni takrorlash (reference_images, reference_images, …) yoki backend konfigiga qarab tekshirish kerak.  
   - Hozirgi backend **FileFieldsInterceptor** da `reference_images` uchun `maxCount: 12` — bir xil key bo‘yicha 12 gacha file yuborish mumkin (multer bildirilgan bo‘lsa). Postman **form-data** da bir key ga bir nechta file qo‘shish qisqa: har biri uchun key `reference_images` qoldirib, har birida bitta **File** tanlash.

3. **Yuborish**
   - **Send** bosing.

4. **Javobni tekshirish**
   - **201 Created** — Product yaratildi. Body da `id`, `name`, `front_image_url`, `collection_id` va hokazo keladi.
   - **400** — front_image yo‘q, yoki validatsiya xatosi (nom, collection_id).
   - **401** — token yo‘q / noto‘g‘ri.
   - **403** — collection sizga tegishli emas.
   - **404** — collection topilmadi.

5. **Postman Environment**
   - **Tests** yoki **Pre-request** da:  
     `pm.environment.set("product_id", pm.response.json().id);`  
   - Keyingi so‘rovlar uchun `{{product_id}}` ishlatiladi.

---

#### Kutiladigan javob

**Muvaffaqiyat (201 Created):**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "user_id": "user-uuid-...",
  "collection_id": "collection-uuid-...",
  "brand_id": "brand-uuid-...",
  "name": "Test Product",
  "front_image_url": "http://localhost:5031/uploads/abc123-front.jpg",
  "back_image_url": "http://localhost:5031/uploads/abc123-back.jpg",
  "reference_images": [
    "http://localhost:5031/uploads/abc123-ref1.jpg",
    "http://localhost:5031/uploads/abc123-ref2.jpg"
  ],
  "analyzed_product_json": null,
  "manual_product_overrides": null,
  "final_product_json": null,
  "extracted_variables": null,
  "manual_overrides": null,
  "generated_images": null,
  "created_at": "2026-01-28T12:00:00.000Z",
  "updated_at": "2026-01-28T12:00:00.000Z"
}
```

- `front_image_url` — doim to‘ldirilgan (front majburiy).
- `back_image_url`, `reference_images` — ixtiyoriy; bo‘lmasa `null` yoki `[]`.
- `analyzed_product_json`, `final_product_json` — tahlil qilinmaguncha `null`. Tahlil: `POST /api/products/{{product_id}}/analyze`.

---

**Xato javoblari:**

| Status | Sabab | Javob (example) |
|--------|--------|------------------|
| **400** | Front image yuborilmagan | `{ "statusCode": 400, "message": "Front image is required. Upload front packshot (product front view)." }` |
| **400** | Validatsiya (nom bo‘sh, collection_id noto‘g‘ri, …) | `{ "statusCode": 400, "message": "Validation failed", "errors": [...] }` |
| **401** | Token yo‘q / expired | `{ "statusCode": 401, "message": "Unauthorized" }` |
| **403** | Collection sizga tegishli emas | `{ "statusCode": 403, "message": "You do not have permission to access this resource" }` |
| **404** | Collection topilmadi | `{ "statusCode": 404, "message": "Collection not found" }` |

---

**DB ta’siri:**  
`products` jadvaliga yangi qator qo‘shiladi. Rasmlar `uploads` (yoki S3) ga yoziladi; `front_image_url`, `back_image_url`, `reference_images` product ga saqlanadi. Tahlil **qilinmaydi** — keyin `POST /api/products/{{product_id}}/analyze` chaqiriladi.

**Postman:** `product_id` ni saqlang (`pm.environment.set("product_id", ...)`) — Analyze, updateProductJson, Generation va boshqa so‘rovlar uchun.

---

### 3.9 GET `/api/products/getAllProducts` (JWT)

**Request:**
- Method: `GET`
- URL: `{{baseUrl}}/products/getAllProducts` yoki `?collection_id={{collection_id}}&page=1&limit=10`
- Headers: `Authorization: Bearer {{access_token}}`

**Kutiladigan javob (200):**
```json
{
  "items": [...],
  "total": 1,
  "page": 1,
  "limit": 10
}
```

**DB:** O‘zgarish yo‘q.

---

### 3.10 POST `/api/products/:id/analyze` — Product tahlil (JWT)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/products/{{product_id}}/analyze`
- Headers: `Authorization: Bearer {{access_token}}`
- Body: bo‘sh yoki `{}`

**Kutiladigan javob (200):**
```json
{
  "product_id": "product-uuid",
  "analyzed_product_json": {
    "product_type": "puffer jacket",
    "product_name": "...",
    "color_name": "Black",
    "color_hex": "#1C1C1C",
    "material": "Synthetic down-filled nylon",
    "details": { ... },
    "logo_front": { "type": "...", "color": "...", "position": "..." },
    "logo_back": { ... },
    "texture_description": "...",
    "additional_details": [],
    "confidence_score": 0.95,
    "analyzed_at": "2026-01-27T12:00:00.000Z"
  },
  "status": "analyzed",
  "analyzed_at": "2026-01-27T12:00:00.000Z"
}
```

**DB:** `products.analyzed_product_json` yangilanadi. Claude API chaqiriladi.

---

### 3.11 POST `/api/products/updateProductJson/:id` (JWT)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/products/updateProductJson/{{product_id}}`
- Headers: `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- Body (raw JSON):
```json
{
  "manual_overrides": {
    "color_name": "Navy Blue",
    "color_hex": "#000080"
  }
}
```

**Kutiladigan javob (200):**
```json
{
  "analyzed_product_json": { ... },
  "final_product_json": { ... },
  "updated_at": "2026-01-27T12:00:00.000Z"
}
```

**DB:** `products.manual_product_overrides`, `products.final_product_json` yangilanadi.

---

### 3.12 POST `/api/collections/:id/analyze-da` (JWT, FormData)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/collections/{{collection_id}}/analyze-da`
- Headers: `Authorization: Bearer {{access_token}}`
- Body: **form-data**
  - `image`: file (DA reference rasm)

**Kutiladigan javob (200):**
```json
{
  "collection_id": "collection-uuid",
  "analyzed_da_json": {
    "background": { "color_hex": "...", "color_name": "...", "description": "..." },
    "props": { "items": [], "placement": "...", "style": "..." },
    "mood": "...",
    "lighting": { ... },
    "composition": { ... },
    "styling": { ... },
    "camera": { ... },
    "quality": "...",
    "analyzed_at": "..."
  },
  "fixed_elements": { ... },
  "status": "analyzed",
  "analyzed_at": "..."
}
```

**DB:** `collections.da_reference_image_url`, `collections.analyzed_da_json`, `collections.fixed_elements` yangilanadi.

---

### 3.13 POST `/api/generations/createGeneration` (JWT)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/generations/createGeneration`
- Headers: `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- Body (raw JSON):
```json
{
  "product_id": "product-uuid",
  "collection_id": "collection-uuid",
  "generation_type": "product_visuals",
  "aspect_ratio": "4:5",
  "resolution": "2K"
}
```
- `generation_type`: `product_visuals` | `ad_recreation`
- `aspect_ratio`: `4:5` | `1:1` | `9:16`
- `resolution`: `2K` | `4K`

**Kutiladigan javob (201):**
```json
{
  "id": "generation-uuid",
  "product_id": "product-uuid",
  "collection_id": "collection-uuid",
  "user_id": "user-uuid",
  "generation_type": "product_visuals",
  "merged_prompts": null,
  "aspect_ratio": "4:5",
  "resolution": "2K",
  "visuals": null,
  "status": "pending",
  "current_step": null,
  "progress_percent": 0,
  "completed_visuals_count": 0,
  "created_at": "...",
  "started_at": null,
  "completed_at": null
}
```

**DB:** `generations` jadvaliga yangi qator.

**Postman:** `generation_id` ni saqlang.

---

### 3.14 POST `/api/generations/:id/merge` (JWT)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/generations/{{generation_id}}/merge`
- Headers: `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- Body (raw JSON): `{}` yoki `{ "product_id": "...", "collection_id": "..." }`

**Kutiladigan javob (200):**
```json
{
  "generation_id": "generation-uuid",
  "merged_prompts": {
    "duo": { "prompt": "...", "visual_type": "duo" },
    "solo": { "prompt": "...", "visual_type": "solo" },
    "flatlay_front": { ... },
    "flatlay_back": { ... },
    "closeup_front": { ... },
    "closeup_back": { ... }
  },
  "status": "merged",
  "merged_at": "2026-01-27T12:00:00.000Z"
}
```

**DB:** `generations.merged_prompts` yangilanadi. Claude merge prompt ishlatiladi.

---

### 3.15 GET `/api/generations/getPrompts/:id` (JWT)

**Request:**
- Method: `GET`
- URL: `{{baseUrl}}/generations/getPrompts/{{generation_id}}`
- Headers: `Authorization: Bearer {{access_token}}`

**Kutiladigan javob (200):**
```json
{
  "generation_id": "generation-uuid",
  "merged_prompts": { ... },
  "product_json": { ... },
  "da_json": { ... },
  "can_edit": true
}
```

**DB:** O‘zgarish yo‘q.

---

### 3.15b POST `/api/generations/updateMergedPrompts/:id` (JWT, ixtiyoriy)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/generations/updateMergedPrompts/{{generation_id}}`
- Headers: `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- Body (raw JSON):
```json
{
  "prompts": {
    "duo": { "prompt": "O'zgartirilgan duo prompt...", "visual_type": "duo" },
    "solo": { "prompt": "O'zgartirilgan solo prompt...", "visual_type": "solo" }
  }
}
```
- Faqat o‘zgartirmoqchi bo‘lgan kalitlarni yuborish kifoya (`prompts` — `merged_prompts` ning partial objekti).

**Kutiladigan javob (200):**
```json
{
  "merged_prompts": { ... },
  "updated_at": "2026-01-27T12:00:00.000Z"
}
```

**DB:** `generations.merged_prompts` yangilanadi.

---

### 3.16 POST `/api/generations/:id/generate` (JWT)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/generations/{{generation_id}}/generate`
- Headers: `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- Body (raw JSON):
```json
{
  "visualTypes": ["duo", "solo", "flatlay_front", "flatlay_back", "closeup_front", "closeup_back"],
  "prompts": [
    "Professional e-commerce product photography: ...",
    "Professional e-commerce product photography: ..."
  ]
}
```
- `visualTypes` va `prompts` uzunligi mos kelishi kerak. `getPrompts` dan olingan `merged_prompts` dan tanlab yuboriladi.

**Kutiladigan javob (201):**
```json
{
  "id": "generation-uuid",
  "status": "pending",
  "progress_percent": 0,
  "completed_visuals_count": 0,
  "visuals": [ { "type": "duo", "status": "processing", ... }, ... ],
  ...
}
```
- Keyin statusni `GET /api/generations/getGeneration/:id` yoki `GET /api/generations/getProgress/:id` orqali polling qilinsa, `status: "completed"` va `visuals[].image_url` lar to‘ladi.

**DB:** Bull queue ga job qo‘shiladi. Processor rasmlarni generatsiya qilib `generations.visuals` va `products.generated_images` ni yangilaydi.

---

### 3.17 GET `/api/generations/getProgress/:id` (JWT)

**Request:**
- Method: `GET`
- URL: `{{baseUrl}}/generations/getProgress/{{generation_id}}`
- Headers: `Authorization: Bearer {{access_token}}`

**Kutiladigan javob (200):**
```json
{
  "generation_id": "generation-uuid",
  "status": "completed",
  "progress_percent": 100,
  "completed_visuals_count": 6,
  "total": 6,
  "elapsed_seconds": 120,
  "estimated_remaining_seconds": 0
}
```

**DB:** O‘zgarish yo‘q.

---

### 3.18 GET `/api/generations/getGeneration/:id` (JWT)

**Request:**
- Method: `GET`
- URL: `{{baseUrl}}/generations/getGeneration/{{generation_id}}`
- Headers: `Authorization: Bearer {{access_token}}`

**Kutiladigan javob (200):** To‘liq `Generation` object, jumladan `product`, `collection`, `visuals` (har birida `type`, `status`, `image_url`, `prompt`, …).

**DB:** O‘zgarish yo‘q.

---

### 3.19 GET `/api/generations/download/:id` (JWT)

**Request:**
- Method: `GET`
- URL: `{{baseUrl}}/generations/download/{{generation_id}}`
- Headers: `Authorization: Bearer {{access_token}}`

**Kutiladigan javob (200):**
- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="generation-xxx.zip"`
- Body: ZIP fayl (barcha generatsiya qilingan rasmlar).

**DB:** O‘zgarish yo‘q. Agar oldindan ZIP generatsiya qilingan bo‘lsa, tezroq qaytariladi.

---

### 3.20 POST `/api/files/uploadImage` (JWT, FormData)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/files/uploadImage`
- Headers: `Authorization: Bearer {{access_token}}`
- Body: **form-data**, `file`: rasm fayli.

**Kutiladigan javob (201):**
```json
{
  "url": "/uploads/xxx.jpg",
  "filename": "xxx.jpg"
}
```

**DB:** Fayl `uploads` da saqlanadi. DB da alohida jadval yo‘q.

---

### 3.21 GET `/api/users/getUser` (JWT)

**Request:**
- Method: `GET`
- URL: `{{baseUrl}}/users/getUser`
- Headers: `Authorization: Bearer {{access_token}}`

**Kutiladigan javob (200):**
```json
{
  "id": "user-uuid",
  "email": "test@example.com",
  "name": "Test User",
  "created_at": "...",
  "updated_at": "..."
}
```
- `password_hash` qaytarilmaydi.

**DB:** O‘zgarish yo‘q.

---

### 3.22 POST `/api/users/updateUser` (JWT)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/users/updateUser`
- Headers: `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- Body (raw JSON):
```json
{
  "name": "New Name",
  "email": "new@example.com"
}
```

**Kutiladigan javob (200):** Yangilangan user (`password_hash` siz).

**DB:** `users` da `name` va/yoki `email` yangilanadi.

---

### 3.23 POST `/api/ad-recreation` (JWT)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/ad-recreation`
- Headers: `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- Body (raw JSON):
```json
{
  "competitor_ad_url": "https://example.com/ad.jpg",
  "brand_brief": "Premium streetwear...",
  "brand_references": ["https://example.com/ref1.jpg"],
  "variations_count": 3
}
```

**Kutiladigan javob (201):** `AdRecreation` object (`id`, `competitor_ad_url`, `status`, …).

**DB:** `ad_recreations` jadvaliga yangi qator.

---

### 3.24 POST `/api/ad-recreation/:id/analyze` (JWT)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/ad-recreation/{{ad_recreation_id}}/analyze`
- Headers: `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- Body (raw JSON):
```json
{
  "additional_context": "...",
  "focus_areas": ["color_scheme", "typography"],
  "target_audience": "...",
  "brand_positioning": "..."
}
```

**Kutiladigan javob (200):** `AdRecreation` (`status: "analyzed"`, `competitor_analysis` to‘ldirilgan).

**DB:** `ad_recreations.competitor_analysis`, `ad_recreations.status` yangilanadi.

---

### 3.25 POST `/api/ad-recreation/:id/generate` (JWT)

**Request:**
- Method: `POST`
- URL: `{{baseUrl}}/ad-recreation/{{ad_recreation_id}}/generate`
- Headers: `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- Body (raw JSON):
```json
{
  "variations_count": 3,
  "variation_styles": ["similar", "modern"],
  "custom_instructions": "...",
  "avoid_elements": [],
  "must_include": []
}
```

**Kutiladigan javob (200):** `AdRecreation` (`status: "completed"`, `generated_variations` to‘ldirilgan).

**DB:** `ad_recreations.generated_variations`, `ad_recreations.status` yangilanadi.

---

### 3.26 POST `/api/da/analyze` — DA Reference Analysis (JWT, FormData)

**🎨 PHASE 2: Art Direction Reference Analysis**

Bu endpoint reference rasmni Claude AI orqali tahlil qilib, DAPreset JSON strukturasiga aylantiradi.

**Request:**
- **Method:** `POST`
- **URL:** `{{baseUrl}}/da/analyze`
- **Headers:** `Authorization: Bearer {{access_token}}`. Content-Type qo'ymang.
- **Body:** **form-data**

| Key | Type | Required | Tavsif |
|-----|------|----------|--------|
| `image` | File | ✅ | Reference rasm (room/scene photo) |
| `preset_name` | Text | ❌ | Custom nom (default: "Analyzed Reference") |

---

#### Postmanda qanday test qilish

1. **Request yaratish**
   - **Method** = `POST`, **URL** = `{{baseUrl}}/da/analyze`
   - **Authorization** tab: Bearer Token

2. **Body ni to'ldirish**
   - **Body** tab → **form-data**
   - `image` → File → Reference rasm tanlang
   - `preset_name` → Text → "My Custom Room" (ixtiyoriy)

3. **Send** bosing. Claude AI 5-15 sekund tahlil qiladi.

---

#### Kutiladigan javob (200 OK)

```json
{
  "success": true,
  "data": {
    "da_name": "Analyzed Reference",
    "background": {
      "type": "Dark walnut wood panel",
      "hex": "#5D4037"
    },
    "floor": {
      "type": "Light grey polished concrete",
      "hex": "#A9A9A9"
    },
    "props": {
      "left_side": ["Vintage book stack", "Yellow mushroom lamp", "Die-cast vintage cars"],
      "right_side": ["Vintage book stack", "Retro robot toy", "Rainbow stacking rings"]
    },
    "styling": {
      "pants": "Black chino (#1A1A1A)",
      "footwear": "BAREFOOT"
    },
    "lighting": {
      "type": "Soft diffused studio",
      "temperature": "4500K warm neutral"
    },
    "mood": "Nostalgic warmth, premium casual, father-son connection",
    "quality": "8K editorial Vogue-level"
  },
  "message": "DA reference analyzed successfully. Use POST /api/da/presets to save as a preset."
}
```

**DB ta'siri:** Hech narsa saqlanmaydi. Faqat tahlil qaytariladi.

---

### 3.27 GET `/api/da/presets` — Barcha DA Presets (JWT)

**Request:**
- **Method:** `GET`
- **URL:** `{{baseUrl}}/da/presets`
- **Headers:** `Authorization: Bearer {{access_token}}`

**Kutiladigan javob (200):**

```json
{
  "total": 5,
  "system_presets": 4,
  "user_presets": 1,
  "presets": [
    {
      "id": "uuid",
      "name": "Nostalgic Playroom",
      "code": "nostalgic_playroom",
      "is_default": true,
      "background_type": "Dark walnut wood panel",
      "background_hex": "#5D4037",
      "...": "..."
    }
  ]
}
```

---

### 3.28 GET `/api/da/presets/defaults` — System Presets (Public)

**Request:**
- **Method:** `GET`
- **URL:** `{{baseUrl}}/da/presets/defaults`
- **Headers:** Yo'q (public)

**Kutiladigan javob (200):** System preset array (is_default=true).

---

### 3.29 POST `/api/da/presets` — Save Analyzed Result as Preset (JWT)

**Request:**
- **Method:** `POST`
- **URL:** `{{baseUrl}}/da/presets`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer {{access_token}}`
- **Body (raw JSON):**

```json
{
  "analysis": {
    "da_name": "My Custom Room",
    "background": { "type": "...", "hex": "#..." },
    "floor": { "type": "...", "hex": "#..." },
    "props": { "left_side": [...], "right_side": [...] },
    "styling": { "pants": "...", "footwear": "..." },
    "lighting": { "type": "...", "temperature": "..." },
    "mood": "...",
    "quality": "8K editorial Vogue-level"
  },
  "code": "my_custom_room",
  "description": "My custom analyzed room preset"
}
```

**Kutiladigan javob (201):**

```json
{
  "success": true,
  "preset": {
    "id": "uuid",
    "name": "My Custom Room",
    "code": "my_custom_room",
    "is_default": false,
    "..."
  },
  "message": "DA Preset \"My Custom Room\" saved successfully"
}
```

**DB:** `da_presets` jadvaliga yangi qator qo'shiladi.

---

### 3.30 POST `/api/da/presets/delete/:id` — Delete User Preset (JWT)

**Request:**
- **Method:** `POST`
- **URL:** `{{baseUrl}}/da/presets/delete/{{preset_id}}`
- **Headers:** `Authorization: Bearer {{access_token}}`

**Kutiladigan javob (200):**

```json
{
  "message": "DA Preset \"My Custom Room\" deleted successfully"
}
```

**Muhim:** System presets (is_default=true) o'chirilmaydi!

---

## 4. Database jadval va API o'zgarishlari xulosa

| Jadval | Qaysi API lar yozadi |
|--------|----------------------|
| `users` | `POST /auth/register` (yangi), `POST /users/updateUser` |
| `brands` | `POST /brands/createBrand`, `POST /brands/updateBrand/:id`, `POST /brands/deleteBrand/:id` |
| `collections` | `POST /collections/createCollection`, `updateCollection`, `updateFixedElements`, `updatePromptTemplates`, `:id/analyze-da`, `updateDAJson`, `deleteCollection` |
| `products` | `POST /products` (yangi), `updateProduct`, `deleteProduct`, `:id/analyze`, `updateProductJson`; generatsiya tugagach `generated_images` processor tomonidan yangilanadi |
| `generations` | `POST /generations/createGeneration`, `:id/merge`, `updateMergedPrompts`, `:id/generate` (queue orqali), `reset/:id`; processor `visuals`, `status`, `progress_percent`, `completed_visuals_count`, `started_at`, `completed_at` ni yangilaydi |
| `ad_recreations` | `POST /ad-recreation`, `:id/analyze`, `:id/generate`, `deleteAdRecreation/:id` |
| `da_presets` | `POST /da/presets` (yangi preset saqlash), `POST /da/presets/delete/:id` (user preset o'chirish) |

---

## 5. Xatolik kodlari (umumiy)

| Code | Ma’no |
|------|--------|
| 400 | Bad Request — validatsiya yoki mantiqiy xato |
| 401 | Unauthorized — JWT yo‘q yoki noto‘g‘ri |
| 403 | Forbidden — ruxsat yo‘q (masalan, boshqa user resursi) |
| 404 | Not Found — resurs topilmadi |
| 409 | Conflict — masalan, email band |
| 500 | Internal Server Error — server xatosi |

---

## 6. Postman Collection import qilish (ixtiyoriy)

Ushbu qo‘llanmadagi barcha so‘rovlarni Postman Collection ga o‘rab, `BASE_URL` va `access_token` uchun environment variable ishlatishingiz mumkin. Ketma-ketlikni yuqoridagi 3.1–3.19 bo‘yicha saqlab, "Product Visuals" workflow ni to‘liq avtomatik test qilish mumkin.
