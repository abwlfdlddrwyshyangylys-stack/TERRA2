# ATLAS / TERRA2

سایت هولوگرافیک سه‌بعدی: توپوگرافی سیمی چندلایه + نوار موبیوس + ذرات نئونی + بلوم واقعی.
Tailwind کامپایل‌شده (بدون CDN) و Three.js داخل ریپو — بدون هیچ وابستگی بیرونی.

## اجرا
```bash
python3 -m http.server 8080
```
نیاز به سرور دارد (ماژول ES). باز کردن مستقیم فایل کار نمی‌کند.

## بازسازی Tailwind
```bash
npm install
npx tailwindcss -i src/tailwind.css -o css/tailwind.css --minify
```

## ساختار
- `index.html` — رابط گلاسمورفیک با کلاس‌های Tailwind
- `src/tailwind.css` — منبع Tailwind + اجزای سفارشی (glass, hud-corner, neon-text)
- `css/tailwind.css` — خروجی کامپایل‌شده (commit می‌شود، لازم نیست build بگیری)
- `js/main.js` — موتور: ۵ لایه موج، موبیوس، ذرات، بلوم سه‌پاسی
- `vendor/three.module.min.js` — Three.js r170

## عملکرد
- سقف ۴۵fps دسکتاپ / ۳۰fps موبایل
- `prefers-reduced-motion` → یک فریم ثابت
- بدون WebGL → نسخه متنی بی‌سروصدا
