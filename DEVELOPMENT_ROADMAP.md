# ROMIMI Visual Generator — Development Roadmap

## 📋 Hozirgi Holat

✅ **Tugallangan:**
- Database integratsiya (PostgreSQL + TypeORM)
- Entities yaratildi (users, brands, collections, products, generations)
- Config sozlandi (.env dan foydalanish)
- Port sozlandi (3007)
- Enumlar va DTO struktura (src/libs/)

---

## 🎯 Keyingi Qadamlar (Prioritet bo'yicha)

### **Faza 1: Authentication & Users (1-2 kun)**

#### 1.1 Authentication Module
- [ ] JWT Strategy setup (`@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`)
- [ ] Bcrypt password hashing
- [ ] Auth DTOs yaratish:
  - `RegisterDto` (email, password, name)
  - `LoginDto` (email, password)
  - `AuthResponseDto` (token, user)
- [ ] Auth endpoints:
  - `POST /api/auth/register` — Ro'yxatdan o'tish
  - `POST /api/auth/login` — Kirish
- [ ] JWT Guard va decorators:
  - `@UseGuards(JwtAuthGuard)` — Protected routes
  - `@CurrentUser()` — Current user decorator
  - `@Public()` — Public routes decorator

#### 1.2 Users Module
- [ ] Users service va controller
- [ ] Endpoints:
  - `GET /api/users/me` — Joriy foydalanuvchi ma'lumotlari
  - `PUT /api/users/me` — Profil yangilash

---

### **Faza 2: Brands & Collections (1-2 kun)**

#### 2.1 Brands Module
- [ ] Brands service va controller
- [ ] DTOs:
  - `CreateBrandDto` (name, brand_brief)
  - `UpdateBrandDto`
- [ ] Endpoints:
  - `GET /api/brands` — Barcha brandlar
  - `GET /api/brands/:id` — Bitta brand
  - `POST /api/brands` — Yangi brand yaratish
  - `PUT /api/brands/:id` — Brand yangilash
  - `DELETE /api/brands/:id` — Brand o'chirish

#### 2.2 Collections Module
- [ ] Collections service va controller
- [ ] DTOs:
  - `CreateCollectionDto` (name, brand_id, fixed_elements, prompt_templates)
  - `UpdateCollectionDto`
  - `FixedElementsDto` (background, styling, decor, quality, lighting, camera_defaults)
- [ ] Endpoints:
  - `GET /api/collections` — Barcha collectionlar
  - `GET /api/collections/:id` — Bitta collection
  - `POST /api/collections` — Yangi collection yaratish
  - `PUT /api/collections/:id` — Collection yangilash
  - `PUT /api/collections/:id/fixed-elements` — Fixed elements yangilash
  - `PUT /api/collections/:id/prompt-templates` — Prompt templates yangilash
  - `DELETE /api/collections/:id` — Collection o'chirish

---

### **Faza 3: Products & File Upload (2-3 kun)**

#### 3.1 File Upload Setup
- [ ] Multer setup (`@nestjs/platform-express`, `multer`)
- [ ] File storage service:
  - Local storage (development)
  - Yoki cloud storage (S3/Cloudinary) — production uchun
- [ ] File validation (image types, size limits)

#### 3.2 Products Module
- [ ] Products service va controller
- [ ] DTOs:
  - `CreateProductDto` (name, collection_id, front_image, back_image, reference_images)
  - `UpdateProductDto`
  - `UploadProductDto` (multipart/form-data)
- [ ] Endpoints:
  - `POST /api/products` — Product yaratish + rasm yuklash
  - `GET /api/products` — Barcha productlar (filter, pagination)
  - `GET /api/products/:id` — Bitta product
  - `PUT /api/products/:id` — Product yangilash
  - `DELETE /api/products/:id` — Product o'chirish

---

### **Faza 4: AI Services Integration (2-3 kun)**

#### 4.1 AI Packages Install
- [ ] `@anthropic-ai/sdk` — Claude API
- [ ] `@google/generative-ai` — Gemini API
- [ ] AI config: `.env` ga `CLAUDE_API_KEY` va `GEMINI_API_KEY` qo'shish

#### 4.2 Claude Service
- [ ] Claude service yaratish (`src/ai/claude.service.ts`)
- [ ] Methods:
  - `analyzeProduct()` — Product rasmlarini tahlil qilish
  - `generatePrompts()` — 6 ta prompt generatsiya qilish
  - `analyzeCompetitorAd()` — Raqobatchi reklamani tahlil qilish

#### 4.3 Gemini Service
- [ ] Gemini service yaratish (`src/ai/gemini.service.ts`)
- [ ] Methods:
  - `generateImage()` — Rasm generatsiya qilish
  - `generateBatch()` — Bir nechta rasm generatsiya qilish

#### 4.4 Product Analysis Endpoint
- [ ] `POST /api/products/:id/analyze` — Claude bilan tahlil qilish
- [ ] Response: `extracted_variables` va `generations.visuals` (6 ta prompt)

---

### **Faza 5: Generations Module (2-3 kun)**

#### 5.1 Generations Module
- [ ] Generations service va controller
- [ ] DTOs:
  - `CreateGenerationDto` (product_id, collection_id, generation_type, aspect_ratio, resolution)
  - `UpdateGenerationDto`
  - `GenerateDto`
- [ ] Endpoints:
  - `POST /api/generations` — Generation yaratish
  - `GET /api/generations` — Barcha generationlar (filter, pagination)
  - `GET /api/generations/:id` — Bitta generation
  - `GET /api/generations/:id/preview` — Promptlarni ko'rsatish
  - `PUT /api/generations/:id/prompts` — Promptlarni yangilash
  - `POST /api/generations/:id/generate` — Rasm generatsiya qilish (Gemini)
  - `GET /api/generations/:id/download` — ZIP file yuklab olish

#### 5.2 Generation Workflow
- [ ] Background job yoki queue (Bull/BullMQ) — rasm generatsiya uchun
- [ ] Real-time updates (WebSocket yoki SSE)
- [ ] Progress tracking (status: pending → processing → completed/failed)

---

### **Faza 6: Ad Recreation Module (1-2 kun)**

#### 6.1 Ad Recreation Module
- [ ] Ad Recreation service va controller
- [ ] DTOs:
  - `CreateAdRecreationDto` (competitor_ad, brand_refs, brand_brief, variations_count)
  - `AnalyzeAdDto`
- [ ] Endpoints:
  - `POST /api/ad-recreation` — Competitor ad yuklash
  - `POST /api/ad-recreation/:id/analyze` — Claude bilan tahlil
  - `POST /api/ad-recreation/:id/generate` — Variations generatsiya

---

### **Faza 7: Validation & Error Handling (1 kun)**

#### 7.1 Global Validation
- [ ] `class-validator` va `class-transformer` setup
- [ ] Global validation pipe (`ValidationPipe`)
- [ ] Custom validators (email, password strength, file types)

#### 7.2 Exception Filters
- [ ] Custom exception filter
- [ ] Validation error responses
- [ ] HTTP exception handling

---

### **Faza 8: Documentation & Testing (1 kun)**

#### 8.1 Swagger/OpenAPI
- [ ] `@nestjs/swagger` setup
- [ ] API documentation
- [ ] DTOs va endpoints annotatsiyalari

#### 8.2 Testing (ixtiyoriy)
- [ ] Unit tests (services)
- [ ] E2E tests (critical endpoints)

---

## 📦 Package Dependencies

### Kerakli packages:
```bash
# Authentication
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
npm install -D @types/passport-jwt @types/bcrypt

# File Upload
npm install multer @types/multer

# AI APIs
npm install @anthropic-ai/sdk @google/generative-ai

# Validation
npm install class-validator class-transformer

# Documentation
npm install @nestjs/swagger swagger-ui-express

# Background Jobs (optional)
npm install @nestjs/bull bull
```

---

## 🔐 Environment Variables

`.env` faylga qo'shish kerak:
```env
# AI APIs
CLAUDE_API_KEY=your_claude_api_key
GEMINI_API_KEY=your_gemini_api_key

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# File Storage (optional)
STORAGE_TYPE=local  # yoki 's3', 'cloudinary'
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
AWS_BUCKET=...
```

---

## 📁 Folder Structure (Keyingi)

```
src/
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   └── guards/
│       ├── jwt-auth.guard.ts
│       └── public.decorator.ts
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   └── users.service.ts
├── brands/
│   ├── brands.module.ts
│   ├── brands.controller.ts
│   └── brands.service.ts
├── collections/
│   ├── collections.module.ts
│   ├── collections.controller.ts
│   └── collections.service.ts
├── products/
│   ├── products.module.ts
│   ├── products.controller.ts
│   └── products.service.ts
├── generations/
│   ├── generations.module.ts
│   ├── generations.controller.ts
│   └── generations.service.ts
├── ad-recreation/
│   ├── ad-recreation.module.ts
│   ├── ad-recreation.controller.ts
│   └── ad-recreation.service.ts
├── ai/
│   ├── ai.module.ts
│   ├── claude.service.ts
│   └── gemini.service.ts
├── storage/
│   ├── storage.module.ts
│   └── storage.service.ts
└── common/
    ├── filters/
    │   └── http-exception.filter.ts
    ├── interceptors/
    └── decorators/
        └── current-user.decorator.ts
```

---

## 🎯 Keyingi Qadam

**Birinchi qadam:** Authentication module yaratish va JWT setup qilish.
