# ตั้งค่าของใหม่ (ทำตามลำดับ — ข้ามข้อที่ไม่อยากใช้ได้ ระบบไม่พัง)

## 0) เพลงไม่ดัง — แก้แล้ว (สาเหตุจริง ไม่ใช่ Mute)
Discord บังคับใช้การเข้ารหัสเสียงแบบใหม่ (DAVE) ตั้งแต่ มี.ค. 2026 บอทเสียงรุ่นเก่า **เข้าห้องได้แต่เงียบสนิทและไม่มี error**
ตอนนี้อัปเกรด `@discordjs/voice` เป็น 0.19.2 + เพิ่ม `@snazzah/davey` แล้ว
หลัง deploy ดู Render Logs ต้องเห็น:
- `Voice dependency report` และในนั้นมี `@snazzah/davey: 0.1.x` (ถ้าเป็น `not found` = ติดตั้งไม่สำเร็จ ส่ง log มา)
- `Music channel permissions OK` (ถ้าเห็น `MISSING permissions ... Speak` = ให้สิทธิ์ Speak/Connect ที่ **ตัวห้อง** ด้วย ไม่ใช่แค่ยศ)
- `Voice connection state: ready` แล้วตามด้วย `Player state: Playing`
บอทโดน Mute เอง: ตอนนี้บอทปลด Mute ตัวเองอัตโนมัติ (ต้องมีสิทธิ์ Mute Members)
เช็คสถานะสดได้ที่ `/status` แถว "Music Channel"

## 1) ให้ Level ไม่หาย — MongoDB Atlas (ฟรีตลอดกาล)
1. สมัคร https://www.mongodb.com/cloud/atlas → สร้าง Cluster แบบ **M0 (Free)**
2. Database Access → เพิ่ม user (จดชื่อ/รหัสผ่าน)
3. Network Access → Add IP Address → **Allow access from anywhere (0.0.0.0/0)** (Render ไม่มี IP ตายตัว)
4. Connect → Drivers → คัดลอก connection string (`mongodb+srv://...`) แล้วแทนที่ `<password>`
5. Render → Environment → เพิ่ม `MONGODB_URI` = ค่านั้น
6. `/status` แถว "Database" ต้องเป็นสีเขียว "MongoDB"
(ถ้าไม่ตั้ง ระบบใช้ไฟล์เหมือนเดิม = Level รีเซ็ตทุก deploy)

## 2) Login ด้วย Discord (/login → /main)
1. Discord Developer Portal → แอปบอท → **OAuth2** → คัดลอก **Client Secret**
2. ในหน้าเดียวกัน → **Redirects** → Add: `https://n-meboon-service.onrender.com/auth/discord/callback` → Save
3. Render → Environment เพิ่ม:
   - `DISCORD_CLIENT_SECRET` = Client Secret
   - `SESSION_SECRET` = ข้อความสุ่มยาวๆ อะไรก็ได้ (เช่น พิมพ์มั่ว 40 ตัว) — ห้ามบอกใคร
4. ลอง https://n-meboon-service.onrender.com/login

**ความจำของ login:** เก็บเป็น signed cookie ในเบราว์เซอร์ผู้ใช้ 30 วัน → redeploy ไม่ทำให้ใครหลุด, ปลอมแปลงไม่ได้ (เปลี่ยน `SESSION_SECRET` = ล็อกเอาต์ทุกคน)

## 3) ของที่เปลี่ยนชื่อ/เพิ่ม
- `/check` → **`/status`** (ลิงก์เก่ายังเด้งมาให้) โชว์ สุขภาพระบบ + รายการคุณสมบัติ
- `/main` = โปรไฟล์: รูป+ชื่อ Discord, Lv, แถบ XP, XP รวม/เดือน/ปี, อันดับรายเดือน
- ลิงก์ Verify ในการ์ด Information (`/Login`) เด้งไป `/login` แล้ว
