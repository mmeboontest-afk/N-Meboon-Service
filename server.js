// Simple Express server for hosting the N'Meboon link site as a Render Web Service.
// Serves everything inside /public as static files.
//
// This is intentionally plain so you can bolt on other things later
// (a Discord bot client, an API route, a webhook receiver, etc.)
// right inside this same file/project — see the notes at the bottom.

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Fallback: unknown routes go back to the home page.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`N'Meboon site is running on port ${PORT}`);
});

// ---------------------------------------------------------------
// ต่อยอดทำบอท (เช่น Discord bot) ในโปรเจกต์เดียวกัน:
//
// 1) ติดตั้งไลบรารีที่ต้องใช้ เช่น  npm install discord.js
// 2) สร้างไฟล์ bot.js แยกไว้ต่างหาก แล้วมา require ตรงนี้:
//        require('./bot.js');
//    เพื่อให้บอทเริ่มทำงานพร้อมกับตอนเว็บเซิร์ฟเวอร์ start ขึ้นมา
//
// หมายเหตุ: ถ้าบอทมีงานหนักหรืออยากแยกความรับผิดชอบชัดเจน
// แนะนำให้สร้างเป็น Render service แยกต่างหากชนิด "Background Worker"
// (ไม่ต้องเปิดพอร์ต ไม่ต้องเสิร์ฟเว็บ) แล้วรันบอทอยู่ในนั้นแทน
// จะเสถียรกว่าการฝังไว้ในเว็บเซิร์ฟเวอร์ตัวเดียวกัน
// ---------------------------------------------------------------
