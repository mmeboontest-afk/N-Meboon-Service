# N'Meboon Menu Link (Web Service version)

เว็บลิงก์รวมโซเชียลของ N'Meboon พร้อมวิดีโอทรานซิชันตอนเปลี่ยนหน้า
เวอร์ชันนี้รันด้วย Node.js + Express เพื่อให้ deploy เป็น **Web Service**
บน Render ได้ (เผื่อจะต่อยอดใส่บอทหรือระบบอื่นในโปรเจกต์เดียวกันภายหลัง)

## โครงสร้างไฟล์
```
server.js            เซิร์ฟเวอร์ Express (จุดเริ่มโปรแกรม)
package.json         รายชื่อ dependency + คำสั่ง start
public/
  index.html          หน้าหลัก (Youtube, Discord, Tiktok, Menu Link)
  menu.html           หน้าเมนูอื่นๆ (Roblox, Suno, Facebook, กลับหน้าหลัก)
  style.css           สไตล์ทั้งเว็บ
  script.js           ระบบทรานซิชันวิดีโอ + อนิเมชันปุ่ม
  assets/             ไฟล์วิดีโอทรานซิชัน (.mp4 / .webm)
```

## วิธี deploy บน Render (Web Service)

1. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น GitHub repo (คงโครงสร้างโฟลเดอร์ `public/` ไว้เหมือนเดิม)
2. เข้า https://dashboard.render.com → **New** → **Web Service**
3. เชื่อมกับ repo ที่เพิ่งสร้าง
4. ตั้งค่า:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. กด **Create Web Service** รอสักครู่ Render จะ build แล้วรันเซิร์ฟเวอร์ให้ พร้อมลิงก์เว็บ เช่น `https://your-site.onrender.com`

> ไม่ต้องกำหนด PORT เอง — โค้ดใน `server.js` อ่านค่า `process.env.PORT` ที่ Render ส่งมาให้อัตโนมัติอยู่แล้ว

## แก้ไข/เพิ่มลิงก์ภายหลัง
- แก้ไขไฟล์ใน `public/index.html` และ `public/menu.html` (มองหา `<a class="btn ...">`)
- ปุ่มที่ลิงก์ไปหน้าอื่นในเว็บเดียวกัน ต้องมี `data-transition="true"` ในแท็ก `<a>` เพื่อให้เล่นวิดีโอทรานซิชันก่อนเปลี่ยนหน้า ส่วนลิงก์ออกเว็บนอกไม่ต้องใส่

## ต่อยอดทำบอท (เช่น Discord bot) ในโปรเจกต์เดียวกัน
1. `npm install discord.js` (หรือไลบรารีบอทที่ต้องใช้)
2. สร้างไฟล์ `bot.js` แยกไว้ เขียนโค้ดบอทตามปกติ
3. เปิดไฟล์ `server.js` แล้วเพิ่มบรรทัด `require('./bot.js');` เพื่อให้บอทเริ่มทำงานพร้อมเว็บ

ถ้าบอทมีงานหนักหรืออยากให้แยกกันชัดเจนไม่กระทบกัน แนะนำสร้างเป็น Render service แยกอีกตัวแบบ **Background Worker** สำหรับรันบอทโดยเฉพาะจะเสถียรกว่า

## หมายเหตุเรื่องวิดีโอ
ไฟล์วิดีโอต้นฉบับเป็น H.265/HEVC ซึ่งหลายเบราว์เซอร์ (Chrome, Firefox บน Windows) เล่นไม่ได้ จึงแปลงให้เป็น H.264 (.mp4) และ VP9 (.webm) ให้เล่นได้ทุกที่แล้ว ถ้าจะเปลี่ยนวิดีโอทรานซิชันใหม่ในอนาคต ให้แปลงไฟล์เป็น 2 ฟอร์แมตนี้ก่อนแล้วแทนที่ไฟล์ใน `public/assets/`
