/**
 * Static visual evidence board for Dark Premium migration (mobile viewport).
 * Open docs/visual-evidence/index.html in a browser — not a product route.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const outDir = join(process.cwd(), "docs/visual-evidence");
mkdirSync(outDir, { recursive: true });

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=390, initial-scale=1" />
  <title>REMATCHER Visual Evidence</title>
  <style>
    :root {
      --midnight: #0B1114;
      --surface: #1A2330;
      --gold: #D4AF3B;
      --blue: #2E68F7;
      --text: #EBEDEF;
      --muted: rgba(235,237,239,.55);
      --success: #22A06B;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Heebo, Arial, sans-serif;
      background: #05080a;
      color: var(--text);
      padding: 24px;
    }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p.meta { color: var(--muted); font-size: 13px; margin: 0 0 24px; }
    .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
    .phone {
      width: 280px;
      height: 560px;
      border-radius: 28px;
      border: 1px solid rgba(235,237,239,.12);
      background: var(--midnight);
      padding: 16px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0,0,0,.45);
    }
    .label { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .brand { display:flex; flex-direction:column; align-items:center; gap:10px; margin: 18px 0; }
    .capture {
      display:flex; align-items:center; gap:10px;
      background:#f4f6f8; color:#0B1114; border-radius:999px; padding:10px 12px;
    }
    .cam { width:40px; height:40px; border-radius:999px; background:var(--blue); }
    .tile { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:12px; }
    .tile span {
      background: var(--surface); border-radius: 12px; min-height: 64px;
      display:grid; place-items:center; font-size:10px; border:1px solid rgba(235,237,239,.08);
    }
    .tile .gold { border-color: rgba(212,175,59,.45); color: var(--gold); }
    .attn { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:14px; }
    .attn div {
      background: var(--surface); border-radius: 14px; padding: 12px;
      display:flex; justify-content:space-between; align-items:center;
      font-size:12px;
    }
    .num { font-size:20px; font-weight:700; }
    .num.o { color: #E08A1E; } .num.g { color: var(--success); }
    .nav {
      margin-top: auto; display:flex; justify-content:space-around;
      border-top:1px solid rgba(235,237,239,.08); padding-top:10px; font-size:10px; color:var(--muted);
    }
    .nav .on { color: var(--gold); }
    .proc { text-align:center; margin-top:40px; }
    .pulse { width:72px; height:72px; margin:0 auto 16px; border-radius:999px; background: rgba(46,104,247,.18); display:grid; place-items:center; }
    .steps { text-align:right; margin-top:20px; font-size:13px; }
    .steps li { list-style:none; margin:8px 0; padding:10px; border-radius:12px; background:var(--surface); }
    .ok { color: var(--success); }
    img.r { width: 48px; height: 48px; }
  </style>
</head>
<body>
  <h1>REMATCHER Exchange — Visual Evidence (mobile)</h1>
  <p class="meta">Dark Premium · Gold brand · Exchange Blue interaction · RTL · Composition reference (not fake product data).</p>
  <div class="grid">
    <div>
      <div class="label">Home composition</div>
      <div class="phone" style="display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;gap:8px;align-items:center;">
            <img class="r" src="../../public/brand/rematcher-r-gold.svg" alt="" />
            <div>
              <div style="font-weight:700;font-size:14px;">בוקר טוב</div>
              <div style="font-size:11px;color:var(--muted);">המגרש שלך</div>
            </div>
          </div>
        </div>
        <div class="brand">
          <img class="r" style="width:64px;height:64px" src="../../public/brand/rematcher-r-gold.svg" alt="" />
          <div>מה אפשר לעשות בשבילך עכשיו?</div>
        </div>
        <div class="capture">
          <div class="cam"></div>
          <div>
            <div style="font-weight:700;font-size:13px;">שתף רכב או בקשת לקוח</div>
            <div style="font-size:11px;opacity:.6;">תמונה · WhatsApp · צילום מסך</div>
          </div>
        </div>
        <div class="tile">
          <span>מלאי</span><span>חיפוש</span><span>התאמות</span><span class="gold">Agent</span>
        </div>
        <div class="attn">
          <div><span>הזדמנויות</span><span class="num o">—</span></div>
          <div><span>התאמות</span><span class="num g">—</span></div>
        </div>
        <div class="nav"><span class="on">בית</span><span>מלאי</span><span>חיפושים</span><span>התאמות</span><span>עוד</span></div>
      </div>
    </div>
    <div>
      <div class="label">Capture processing</div>
      <div class="phone">
        <div class="proc">
          <div class="pulse"><img class="r" src="../../public/brand/rematcher-r-gold.svg" alt="" /></div>
          <div style="font-weight:700;">מבינים את החומר…</div>
          <div style="color:var(--muted);font-size:13px;margin-top:6px;">בלי להקליד מחדש</div>
          <ul class="steps">
            <li class="ok">✓ קוראת את החומר</li>
            <li class="ok">✓ מזהה רכב או לקוח</li>
            <li style="color:var(--blue);">… משלימה פרטים</li>
            <li style="color:var(--muted);">· בודקת התאמות</li>
          </ul>
        </div>
      </div>
    </div>
    <div>
      <div class="label">Brand mark variants</div>
      <div class="phone" style="display:grid;place-items:center;gap:20px;">
        <img src="../../public/brand/rematcher-r-gold.svg" width="96" height="96" alt="gold" />
        <img src="../../public/brand/rematcher-r-blue.svg" width="72" height="72" alt="blue" />
        <img src="../../public/brand/rematcher-r-white.svg" width="72" height="72" alt="white" />
        <div style="font-size:12px;color:var(--muted);text-align:center;">Gold primary · Blue interaction · White on dark</div>
      </div>
    </div>
  </div>
</body>
</html>`;

writeFileSync(join(outDir, "index.html"), html);
console.log("Wrote", join(outDir, "index.html"));
