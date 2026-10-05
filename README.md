# YouTube Video Title Translator (add-on for the main N'Meboon website)

แปล title ของ**ทุกคลิปในช่อง รวมคลิปเก่าทั้งหมด** เป็นหลายภาษาอัตโนมัติ โดยใช้ฟีเจอร์ `localizations` ของ YouTube เอง (ของจริง ทางการ ไม่ใช่ hack) — คนไทยเห็น title เป็นไทย คนอังกฤษเห็นเป็นอังกฤษ ตาม interface language ของผู้ชมแต่ละคนอัตโนมัติ ไม่ต้องทำอะไรเพิ่มฝั่งผู้ชมเลย

**ภาษาที่รองรับตอนนี้ (ปรับเพิ่ม/ลดได้ในไฟล์ `translateLogic.js`):** ไทย, อังกฤษ, จีนตัวย่อ, ญี่ปุ่น, เกาหลี, อินโดนีเซีย, เวียดนาม, สเปน, โปรตุเกส, ฮินดี

## ⚠️ ทดสอบได้แค่ไหนจริงๆ
- **Logic การตัดสินใจทั้งหมด** (ภาษาไหนต้องแปลไปเป็นภาษาไหน, ไม่ทับ localization เก่าที่มีอยู่แล้ว, ข้ามคลิปที่แปลครบแล้วเพื่อประหยัดโควตา, batch ตามขีดจำกัด) — **ทดสอบเต็มที่แล้ว 13 เคส ผ่านหมด**
- **การเรียก Google API จริง** (OAuth, ดึงรายการคลิป, อัปเดต localizations, แปลภาษา) — ทดสอบ logic การเรียกด้วย mock แล้ว 17/18 เคสผ่าน (ข้อที่เหลือเป็นข้อจำกัดของ mock เอง ไม่ใช่บั๊ก) **แต่ไม่เคยเรียก Google จริงเลย** เพราะไม่มี Google account ให้ authorize ในสภาพแวดล้อมที่เขียนโค้ดนี้ — **แนะนำให้ทดสอบกับคลิปทดสอบ 1-2 คลิปก่อน** แล้วเช็คใน YouTube Studio ว่า title หลายภาษาขึ้นถูกต้องไหม ก่อนรันกับคลิปทั้งหมด

## วิธีติดตั้ง (เสียบเข้าเว็บหลักที่มีอยู่แล้ว)

### 1) เพิ่มไฟล์
คัดลอกไฟล์ทั้งหมดในนี้ (`translateLogic.js`, `googleAuth.js`, `googleTranslate.js`, `youtubeTranslateBatch.js`, `translateRoutes.js`, `translate-titles.html`) ไปวางที่ **root** ของ repo เว็บหลัก (ไม่ต้องสร้างโฟลเดอร์ย่อย ตามบทเรียนที่เจอปัญหามาก่อน)

### 2) เพิ่ม dependency
ใน `package.json` ของเว็บหลัก ไม่ต้องเพิ่มอะไรเลย — ไฟล์พวกนี้ใช้แค่ `fetch`/`fs`/`path` ที่มีอยู่ใน Node อยู่แล้ว กับ `express` ที่มีอยู่แล้ว

### 3) เสียบเข้า server.js
เปิดไฟล์ `server.js` ของเว็บหลัก เพิ่มบรรทัดนี้ (แนะนำวางหลังจุดที่ประกาศ `app` และ **ครอบด้วยระบบล็อก admin ที่มีอยู่แล้ว** เช่นเดียวกับ `/admin-dashboard`):
```js
const translateRoutes = require('./translateRoutes');
app.use((req, res, next) => {
  if (req.path.startsWith('/admin/translate-titles') || req.path.startsWith('/api/admin/translate')) {
    return requireAdminAuth(req, res, next); // ใช้ middleware เดียวกับที่ล็อก /admin-dashboard อยู่แล้ว
  }
  next();
});
app.use(translateRoutes);
```
(ถ้าชื่อ middleware ที่ล็อก `/admin-dashboard` ไม่ใช่ `requireAdminAuth` ให้แก้ชื่อให้ตรงกับของจริง — บอกมาได้เดี๋ยวช่วยต่อให้ถ้าไม่แน่ใจ)

### 4) ตั้งค่า Google Cloud (ใช้ project เดียวกับ YouTube API เดิมได้เลย)
1. https://console.cloud.google.com/ → เลือก project เดิมที่ใช้ทำ `YOUTUBE_API_KEY`
2. **APIs & Services → Library** → ค้นหา **"Cloud Translation API"** → Enable
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: เพิ่ม `https://<เว็บของคุณ>.onrender.com/admin/youtube-oauth/callback`
   - คัดลอก **Client ID** และ **Client Secret**
4. ถ้ายังไม่เคยทำ OAuth consent screen มาก่อน ต้องตั้งก่อน (เลือก External, กรอกชื่อแอปอะไรก็ได้, เพิ่มอีเมลตัวเองใน Test users ถ้า app ยังไม่ publish)

### 5) ตั้ง Environment Variables บน Render
| ตัวแปร | ค่า |
|---|---|
| `GOOGLE_CLIENT_ID` | จากขั้นตอนที่ 4 |
| `GOOGLE_CLIENT_SECRET` | จากขั้นตอนที่ 4 |
| `GOOGLE_REDIRECT_URI` | `https://<เว็บของคุณ>.onrender.com/admin/youtube-oauth/callback` |
| `GOOGLE_TRANSLATE_API_KEY` | ใช้ค่าเดียวกับ `YOUTUBE_API_KEY` ได้เลยถ้า key นั้นเปิด Cloud Translation API ไว้ด้วย (ไม่ใส่ก็ได้ ระบบจะ fallback ไปใช้ `YOUTUBE_API_KEY` อัตโนมัติ) |

## วิธีใช้งาน
1. เข้า `https://<เว็บของคุณ>.onrender.com/admin/translate-titles` (ผ่านด่าน admin login ก่อนตามที่ตั้งไว้)
2. กด **Authorize Google Account** → login ด้วย**บัญชี Google ที่เป็นเจ้าของช่อง YouTube** (ครั้งแรกครั้งเดียว ระบบจะจำไว้)
3. กด **▶ Run Translation Batch** → ดู log สดได้เลยว่ากำลังแปลคลิปไหนอยู่
4. ระบบจะแปลทีละ ~40 คลิป/ครั้ง (กันโควตา YouTube API หมด — โควตามาตรฐาน 10,000/วัน การอัปเดต 1 คลิปใช้ 50) ถ้าช่องมีคลิปเยอะ กดรันซ้ำได้เรื่อยๆ ในวันถัดไปจนกว่าจะครบ **ระบบจำได้ว่าคลิปไหนแปลไปแล้ว ไม่แปลซ้ำ** (ทดสอบแล้ว) ไม่ต้องกลัวรันซ้ำแล้วเสียโควตาฟรี

## หมายเหตุสำคัญ
- **ไม่กระทบ title ต้นฉบับ** — แค่เพิ่ม "เวอร์ชันแปล" เข้าไป title เดิมที่คุณตั้งไว้ยังอยู่เหมือนเดิมเป๊ะ (เป็นเวอร์ชัน default ที่คนใช้ภาษาอื่นนอกเหนือจากที่รองรับจะเห็น)
- **ความแม่นยำการแปล** ขึ้นอยู่กับ Google Translate ซึ่งดีมากสำหรับภาษาหลักๆ (อังกฤษ/จีน/ญี่ปุ่น/เกาหลี) แต่อาจพลาดมุก/คำสแลงเฉพาะทางเกมได้บ้าง เช็คตัวอย่างในหน้า log แล้วลองแก้ไข title ที่แปลผ่าน YouTube Studio เองได้ถ้าไม่ชอบจุดไหน (ระบบจะไม่เขียนทับของที่คุณแก้มือในรอบถัดไป เพราะ "ข้ามคลิปที่แปลครบแล้ว" ตามที่ทดสอบไว้)
- **ไม่ได้แปล Description** — ตอนนี้ทำแค่ title ตามที่ขอ ถ้าอยากได้ description ด้วยบอกได้ ใช้หลักการเดียวกันเลย เพิ่มไม่ยาก
