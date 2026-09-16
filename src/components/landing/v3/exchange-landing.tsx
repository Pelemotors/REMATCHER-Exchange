"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BrandMark } from "@/components/brand/brand-mark";
import { LANDING_ASSETS, LANDING_COPY } from "./landing-copy";
import styles from "./landing.module.css";

function ProductPhonePreview() {
  return (
    <div className={styles.phoneShell} aria-hidden>
      <div className={styles.phoneNotch}>
        <span className={styles.phoneNotchBar} />
      </div>
      <div className={styles.phoneScreen}>
        <BrandMark size={28} variant="gold" preferPng />
        <p className={styles.phoneHello}>בוקר טוב, דני</p>
        <p className={styles.phoneTitle}>
          יש 3 הזדמנויות שכדאי לבדוק היום
        </p>
        <div className={styles.phoneCapture}>
          <span aria-hidden>📷</span>
          <div>
            <p className={styles.phoneCaptureTitle}>שתף רכב או בקשת לקוח</p>
            <p className={styles.phoneCaptureSub}>תמונה · WhatsApp · טקסט</p>
          </div>
        </div>
        <div className={styles.phoneJobs}>
          <div className={styles.phoneJob}>יש לי רכב</div>
          <div className={styles.phoneJob}>יש לי לקוח</div>
          <div className={styles.phoneJob}>מה ברשת?</div>
        </div>
        <div className={styles.phoneOpp}>
          <p className={styles.phoneOppLabel}>הזדמנות</p>
          <p className={styles.phoneOppBody}>
            נמצאה התאמה חדשה לרכב מהמלאי שלך
          </p>
        </div>
      </div>
    </div>
  );
}

function MarketingHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.lockup}>
          <BrandMark size={36} variant="gold" preferPng />
          <div className={styles.lockupText}>
            <p className={styles.lockupParent}>REMATCHER</p>
            <p className={styles.lockupProduct}>Exchange</p>
          </div>
        </Link>
        <nav className={styles.nav} aria-label="ניווט ראשי">
          {LANDING_COPY.nav.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <Link href="/login" className={styles.btnGhost}>
            כניסה
          </Link>
          <Link href="/signup" className={styles.btnGold}>
            התחל עכשיו
          </Link>
          <button
            type="button"
            className={styles.menuBtn}
            aria-expanded={open}
            aria-label={open ? "סגור תפריט" : "פתח תפריט"}
            onClick={() => setOpen((v) => !v)}
          >
            ☰
          </button>
        </div>
      </div>
      {open && (
        <nav className={styles.mobileMenu} aria-label="תפריט מובייל">
          {LANDING_COPY.nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

export function ExchangeLanding() {
  const heroBg = {
    ["--hero-photo" as string]: `url(${LANDING_ASSETS.heroShowroom})`,
  };
  const ctaBg = {
    ["--cta-photo" as string]: `url(${LANDING_ASSETS.ctaHeadlights})`,
  };

  return (
    <div className={styles.root} data-landing="v3">
      <MarketingHeader />

      <section className={styles.hero} style={heroBg} aria-label="Hero">
        <div className={styles.heroBg} aria-hidden />
        <div className={`${styles.shell} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <h1 className={styles.heroH1}>
              {LANDING_COPY.hero.h1Line1}
              <br />
              {LANDING_COPY.hero.h1Line2Before}
              <span className={styles.heroGold}>{LANDING_COPY.hero.h1Gold}</span>
              {LANDING_COPY.hero.h1Line2After}
            </h1>
            <p className={styles.heroSupport}>{LANDING_COPY.hero.support}</p>
            <div className={styles.heroCtas}>
              <Link href="/signup" className={styles.btnGoldLg}>
                {LANDING_COPY.hero.primaryCta}
              </Link>
              <a href="#how" className={styles.btnGhostLg}>
                ▶ {LANDING_COPY.hero.secondaryCta}
              </a>
            </div>
            <ul className={styles.trustRow}>
              {LANDING_COPY.hero.trust.map((t) => (
                <li key={t}>
                  <span className={styles.trustCheck} aria-hidden>
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.heroVisual}>
            <ProductPhonePreview />
            <div className={styles.floatTag}>
              MORE CARS
              <br />
              BETTER BUSINESS
            </div>
          </div>
        </div>
      </section>

      <section id="why" className={styles.section}>
        <div className={styles.shell}>
          <h2 className={styles.sectionH2}>מה עובר אצלך היום?</h2>
          <p className={styles.sectionLead}>
            שלושה מצבים מוכרים. פתרון אחד חכם.
          </p>
          <div className={styles.cards3}>
            <article className={styles.card}>
              <div className={`${styles.iconCircle} ${styles.iconBlue}`}>👤</div>
              <h3 className={styles.cardH}>יש לי לקוח</h3>
              <p className={styles.cardP}>
                <strong>שתף מה הוא מחפש.</strong> REMATCHER מבינה את הבקשה
                ומחפשת עבורך רכבים מתאימים ברשת.
              </p>
            </article>
            <article className={styles.card}>
              <div className={`${styles.iconCircle} ${styles.iconGold}`}>🚗</div>
              <h3 className={styles.cardH}>יש לי רכב</h3>
              <p className={styles.cardP}>
                <strong>העלה אותו פעם אחת.</strong> REMATCHER מחפשת ביקושים
                רלוונטיים ומציפה הזדמנויות כשהן נוצרות.
              </p>
            </article>
            <article className={styles.card}>
              <div className={`${styles.iconCircle} ${styles.iconBlue}`}>↻</div>
              <h3 className={styles.cardH}>מציעים לי רכב</h3>
              <p className={styles.cardP}>
                <strong>שתף ושאל &quot;מה יש לי עליו?&quot;</strong> בדוק התאמה
                ללקוחות שלך ואת רמת הביקוש ברשת — בלי לפרסם את הרכב.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.sectionTight}>
        <div className={styles.shell}>
          <h2 className={styles.sectionH2}>
            כבר קיבלת את המידע. למה להקליד אותו שוב?
          </h2>
          <p className={styles.sectionLead}>
            צילום מסך, הודעת WhatsApp, תמונות רכב או טקסט — פשוט משתפים
            ל־REMATCHER. היא מחלצת את מה שכבר קיים, מבינה אם מדובר בלקוח,
            חיפוש, רכב או טרייד ומבקשת ממך רק את מה שבאמת חסר.
          </p>
          <div className={styles.flowGrid}>
            <div className={styles.sourceCard}>
              <p className={styles.sourceLabel}>שיתוף מהיום</p>
              <p className={styles.chatBubble}>
                אחמד מחפש טוסון או ספורטאז׳ מ־2021, עד 125 אלף, עדיף היברידי.
                יש לי גם את ה־WhatsApp שלו.
              </p>
            </div>
            <div className={styles.flowCenter}>
              <BrandMark size={48} variant="gold" preferPng />
              <span className={styles.flowArrow} aria-hidden>
                ←
              </span>
              <span style={{ fontSize: "0.75rem", color: "rgba(235,237,239,0.5)" }}>
                REMATCHER מבינה
              </span>
            </div>
            <div className={styles.resultCard}>
              <p className={styles.resultTitle}>תוצאת הבנה</p>
              <div className={styles.resultRow}>
                <span>לקוח</span>
                <span>אחמד</span>
              </div>
              <div className={styles.resultRow}>
                <span>מחפש</span>
                <span>Tucson / Sportage</span>
              </div>
              <div className={styles.resultRow}>
                <span>שנתון</span>
                <span>2021+</span>
              </div>
              <div className={styles.resultRow}>
                <span>תקציב</span>
                <span>עד ₪125,000</span>
              </div>
              <Link
                href="/signup"
                className={styles.btnGold}
                style={{ width: "100%", marginTop: "1rem" }}
              >
                הפעל חיפוש ברשת
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className={styles.section}>
        <div className={styles.shell}>
          <h2 className={styles.sectionH2}>איך REMATCHER עובדת?</h2>
          <p className={styles.sectionLead}>
            ארבעה שלבים פשוטים שמחליפים הרבה עבודה ידנית.
          </p>
          <div className={styles.steps}>
            {[
              {
                n: "01",
                icon: "📷",
                h: "משתפים",
                p: "לקוח, רכב, טרייד, צילום מסך או הודעה.",
              },
              {
                n: "02",
                icon: "◈",
                h: "REMATCHER מבינה",
                p: "מחלצת ומארגנת את המידע בלי לבקש להקליד הכול מחדש.",
              },
              {
                n: "03",
                icon: "◎",
                h: "הרשת עובדת",
                p: "מחפשת התאמות והזדמנויות באופן אנונימי.",
              },
              {
                n: "04",
                icon: "🤝",
                h: "מתחברים כשזה רלוונטי",
                p: "רק כששני הצדדים מעוניינים מגיעים ל־Mutual Interest ולחשיפה.",
              },
            ].map((s) => (
              <div key={s.n} className={styles.step}>
                <div className={styles.stepIcon}>{s.icon}</div>
                <p className={styles.stepNum}>{s.n}</p>
                <h3 className={styles.stepH}>{s.h}</h3>
                <p className={styles.stepP}>{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.sectionTight}>
        <div className={styles.shell}>
          <h2 className={styles.sectionH2}>
            הרשת יודעת. הסוחרים לא צריכים לדעת.
          </h2>
          <p className={styles.sectionLead}>
            REMATCHER יכולה לבדוק התאמות בין סוחרים בלי לחשוף מי מחזיק ברכב או
            מי מחפש אותו.
          </p>
          <div className={styles.privacyGrid}>
            <div className={styles.networkDiagram} aria-hidden>
              <div className={styles.nodeA}>
                <p className={styles.nodeTitle}>סוחר א׳</p>
                <p className={styles.nodeSub}>רכב במלאי</p>
              </div>
              <div className={styles.nodeB}>
                <p className={styles.nodeTitle}>סוחר ב׳</p>
                <p className={styles.nodeSub}>לקוח מחפש</p>
              </div>
              <div className={styles.hub}>
                <BrandMark size={40} variant="gold" preferPng />
                <p className={styles.hubLabel}>התאמה אנונימית</p>
              </div>
              <div className={styles.mutual}>🔒 MUTUAL INTEREST → REVEAL</div>
            </div>
            <div>
              <p className={styles.sectionLead} style={{ marginTop: 0 }}>
                זהויות נחשפות רק כשהגיע הזמן לדבר.
              </p>
              <ul className={styles.privacyList}>
                <li>התאמות אנונימיות עד עניין הדדי</li>
                <li>שליטה מלאה על חשיפה ופרסום</li>
                <li>Ownership ≠ Visibility — רכב פרטי נשאר פרטי</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="capabilities" className={styles.section}>
        <div className={styles.shell}>
          <h2 className={styles.sectionH2}>
            לא רק למצוא התאמה. להבין מה קורה ברשת.
          </h2>
          <p className={styles.sectionLead}>
            שאלות שעולות כל יום — עם תשובה אנונימית ובטוחה.
          </p>
          <div className={styles.intelGrid}>
            <article className={styles.intelCard}>
              <h3 className={styles.cardH}>כמה מחפשים רכב כזה?</h3>
              <div className={styles.intelDemo}>
                <span className={styles.demoTag}>דוגמת UI</span>
                <div>7 חיפושים רלוונטיים</div>
                <div>3 בהתאמה גבוהה</div>
              </div>
            </article>
            <article className={styles.intelCard}>
              <h3 className={styles.cardH}>מה יש ברשת שמתאים ללקוח?</h3>
              <div className={styles.intelDemo}>
                <span className={styles.demoTag}>דוגמת UI</span>
                <div>6 רכבים קרובים</div>
                <div>4 — מחיר · 1 — שנתון · 1 — ק״מ</div>
              </div>
            </article>
            <article className={styles.intelCard}>
              <h3 className={styles.cardH}>למה אין לי התאמות?</h3>
              <p className={styles.cardP}>
                REMATCHER מציגה פערים משמעותיים — לא רק &quot;0 Matches&quot; —
                בלי זהויות ובלי נתונים מזהים.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.sectionTight}>
        <div className={styles.shell}>
          <div className={styles.catalogGrid}>
            <div className={styles.browserFrame} aria-hidden>
              <div className={styles.browserBar}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
                <div className={styles.urlBar}>
                  your-dealer.rematcher.co.il
                </div>
              </div>
              <div className={styles.catalogBody}>
                <p className={styles.catalogBrand}>GALERIA MOTORS</p>
                <div className={styles.vehicleGrid}>
                  {[
                    ["RAV4", "2022 · 48,000 ק״מ", "₪189,000"],
                    ["BMW 330e", "2021 · 62,000 ק״מ", "₪215,000"],
                    ["Tucson", "2023 · 21,000 ק״מ", "₪168,000"],
                  ].map(([name, spec, price]) => (
                    <div key={name} className={styles.vehicleTile}>
                      <div className={styles.vehiclePhoto} />
                      <div className={styles.vehicleMeta}>
                        <p className={styles.vehicleName}>{name}</p>
                        <p className={styles.vehicleSpec}>{spec}</p>
                        <p className={styles.vehicleSpec}>{price}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <h2 className={styles.sectionH2}>
                המלאי שלך כבר בפנים. עכשיו הוא גם מוכן ללקוחות שלך.
              </h2>
              <p className={styles.sectionLead}>
                העלית את המלאי והתמונות ל־REMATCHER? בלחיצה אחת אפשר להפוך אותו
                לקטלוג דיגיטלי של הסוכנות — בלי להעלות את אותם רכבים שוב.
              </p>
              <ul className={styles.benefits}>
                <li>עדכון אוטומטי מהמלאי</li>
                <li>קישור מוכן לשיתוף</li>
                <li>מותאם לנייד</li>
                <li>Powered by REMATCHER Exchange</li>
              </ul>
              <Link href="/signup?intent=catalog" className={styles.btnGoldLg}>
                הפעל את הקטלוג שלי
              </Link>
              <p className={styles.comingNote}>
                קטלוג ציבורי — יכולת מוצרית מתוכננת. ההרשמה פותחת גישה ל־Exchange;
                הפעלת הקטלוג תושלם כשהערוץ יהיה זמין בחשבון.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <h2 className={styles.sectionH2}>פשוט תשאל את REMATCHER.</h2>
          <p className={styles.sectionLead}>
            לא עוד מערכת שצריך ללמוד לנהל. אפשר פשוט לדבר איתה.
          </p>
          <div className={styles.agentDemo}>
            <div className={styles.bubbleUser}>
              מציעים לי את הקשקאי הזה. מה יש לי עליו?
            </div>
            <div className={styles.bubbleAgent}>
              <span className={styles.demoTag}>דוגמת UI</span>
              יש לך לקוח אחד שמתאים. ברשת קיימים חיפושים רלוונטיים לרכב כזה —
              בלי לפרסם ובלי זהויות.
            </div>
          </div>
          <div className={styles.agentChips}>
            <span className={styles.chip}>״מכרתי את הטוסון.״</span>
            <span className={styles.chip}>״אחמד יכול גם 2020.״</span>
            <span className={styles.chip}>״למה אין לו התאמות?״</span>
            <span className={styles.chip}>״מה אני מפספס?״</span>
          </div>
        </div>
      </section>

      <section className={styles.sectionTight}>
        <div className={styles.shell}>
          <h2 className={styles.sectionH2}>
            גם כשאתה לא מחפש — REMATCHER ממשיכה לעבוד.
          </h2>
          <div className={styles.cards3} style={{ marginTop: "2rem" }}>
            <article className={styles.card}>
              <h3 className={styles.cardH}>התאמה חדשה</h3>
              <p className={styles.cardP}>
                נכנס רכב שמתאים לחיפוש פעיל שלך.
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardH}>שינוי שפתח הזדמנות</h3>
              <p className={styles.cardP}>
                שינוי במחיר או בדרישות יצר התאמה חדשה.
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardH}>עניין שמחכה לך</h3>
              <p className={styles.cardP}>
                יש פעולה רלוונטית שממתינה לתגובה.
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardH}>ביקוש ללא מענה</h3>
              <p className={styles.cardP}>
                הרשת מזהה קטגוריות שבהן יש ביקוש ללא היצע מתאים.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.finalCta} style={ctaBg}>
        <div className={styles.finalBg} aria-hidden />
        <div className={styles.shell}>
          <h2 className={styles.finalH2}>
            המלאי שלך. הלקוחות שלך.
            <br />
            עכשיו גם הרשת עובדת בשבילך.
          </h2>
          <p className={styles.finalLead}>
            הצטרף ל־REMATCHER Exchange ותן להזדמנויות למצוא אותך.
          </p>
          <div className={styles.finalActions}>
            <Link href="/signup" className={styles.btnGoldLg}>
              התחל עכשיו
            </Link>
            <Link href="/login" className={styles.btnGhostLg}>
              כניסה
            </Link>
          </div>
          <p className={styles.tagline}>More Cars. Better Business.</p>
          <div style={{ marginTop: "2rem" }}>
            <BrandMark size={72} variant="gold" preferPng />
          </div>
        </div>
      </section>

      <footer id="faq" className={styles.footer}>
        <div className={`${styles.shell} ${styles.footerGrid}`}>
          <div className={styles.footerBrand}>
            <Link href="/" className={styles.lockup}>
              <BrandMark size={32} variant="gold" preferPng />
              <div className={styles.lockupText}>
                <p className={styles.lockupParent}>REMATCHER</p>
                <p className={styles.lockupProduct}>Exchange</p>
              </div>
            </Link>
            <p>רשת הזדמנויות פרטית לסוחרי רכב.</p>
          </div>
          <nav className={styles.footerLinks} aria-label="קישורים">
            <Link href="/terms">תנאי שימוש</Link>
            <Link href="/privacy">מדיניות פרטיות</Link>
            <a href="mailto:privacy@rematcher.co.il">צור קשר</a>
            <Link href="/login">כניסה</Link>
            <Link href="/signup">הצטרפות</Link>
          </nav>
          <div className={styles.storeBadges} aria-label="אפליקציות — בקרוב">
            <span className={styles.storeBadge}>App Store — בקרוב</span>
            <span className={styles.storeBadge}>Google Play — בקרוב</span>
          </div>
        </div>
        <div className={`${styles.shell} ${styles.footerBottom}`}>
          © {new Date().getFullYear()} REMATCHER Exchange
        </div>
      </footer>

      {/* Preload critical hero photo for LCP */}
      <Image
        src={LANDING_ASSETS.heroShowroom}
        alt=""
        width={1}
        height={1}
        priority
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
      />
    </div>
  );
}
