/** Deterministic column header / content → vehicle field mapping.
 * Semantic normalization of vehicle features is intentionally NOT done here;
 * raw feature text is forwarded to the Exchange AI brain at persistence time.
 */
import {
  canonicalizeFuelType,
  canonicalizeOwnershipSource,
  canonicalizeVehicleIdentity,
  normalizeEngineDisplacementCc,
} from "@/services/exchange/vehicle-identity";

export type VehicleImportField =
  | "make" | "model" | "trim" | "year" | "mileage" | "color"
  | "b2bPrice" | "retailPrice" | "region" | "ownershipHand" | "ownershipType"
  | "fuelType" | "engineDisplacementCc" | "features" | "dealerRefId" | "licensePlate" | "vin";

const ALIASES: Record<VehicleImportField, string[]> = {
  make:["make","manufacturer","brand","יצרן","יצר","מותג","תוצרת"],
  model:["model","דגם","מודל"],
  trim:["trim","version","variant","גרסה","רמת גימור","גימור","תת דגם"],
  year:["year","model year","שנה","שנתון","שנת ייצור","עליה לכביש","עלייה לכביש"],
  mileage:["mileage","km","kms","kilometers","קמ",'ק"מ',"קילומטר","קילומטרים","קילומטראז","קילומטראז'","נסועה"],
  color:["color","colour","צבע"],
  b2bPrice:["b2b","b2bprice","wholesale","מחיר b2b","מחיר סוחר","מחיר לסוחר","מחיר סיטונאי","נטו"],
  retailPrice:["price","retail","retailprice","asking price","מחיר","מחיר מכירה","מחיר מבוקש","מחיר קמעונאי","מחיר מחירון"],
  region:["region","city","location","branch","אזור","עיר","מיקום","סניף"],
  ownershipHand:["hand","ownership hand","owners","יד","בעלות","מספר יד","יד נוכחית"],
  ownershipType:["ownership type","ownership source","source","originality","מקוריות","מקור","סוג בעלות","בעלות קודמת"],
  fuelType:["fuel","fuel type","powertrain","propulsion","דלק","סוג דלק","הנעה","סוג הנעה"],
  engineDisplacementCc:["engine","engine cc","engine capacity","engine displacement","engine displacement cc","cc","נפח מנוע","סמק",'סמ"ק',"סמ״ק"],
  features:["features","feature","equipment","extras","options","special equipment","אבזור","איבזור","תוספות","פיצרים","פיצ'רים","ציוד","אבזור מיוחד","תוספות מיוחדות","drivetrain","4x4"],
  dealerRefId:["id","ref","code","stock","stock id","מזהה","קוד","מספר פנימי","מס מלאי","מספר מלאי"],
  licensePlate:["plate","license","license plate","registration","מספר רישוי","מס רישוי","מספר רכב","לוחית","רישוי"],
  vin:["vin","chassis","מספר שלדה","מס שלדה","שלדה"],
};

function cleanText(v:unknown){return String(v??"").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"").replace(/\u00a0/g," ").trim()}
function normalizeHeader(h:string){return cleanText(h).toLowerCase().replace(/[._:/\\-]+/g," ").replace(/\s+/g," ")}
function numeric(v:unknown){const s=cleanText(v).replace(/[,₪€$£\s]/g,"");if(!s||!/^\d+(?:\.\d+)?$/.test(s))return null;const n=Number(s);return Number.isFinite(n)?n:null}
function isYear(v:unknown){const n=numeric(v);return n!=null&&Number.isInteger(n)&&n>=1980&&n<=new Date().getFullYear()+2}
function plate(v:unknown){return /^\d{7,8}$/.test(cleanText(v).replace(/[-\s]/g,""))}
function vin(v:unknown){return /^[A-HJ-NPR-Z0-9]{17}$/.test(cleanText(v).replace(/\s/g,"").toUpperCase())}
function price(v:unknown){const s=cleanText(v),n=numeric(v);return n!=null&&n>=5000&&n<=5000000&&(/[₪€$£]/.test(s)||n>=10000)}

export function inferMappingFromRows(rows:unknown[][]):Partial<Record<VehicleImportField,number>>{
  const sample=rows.filter(r=>r.some(v=>cleanText(v)!="")).slice(0,25),m:Partial<Record<VehicleImportField,number>>={};
  if(!sample.length)return m;
  const w=Math.max(...sample.map(r=>r.length)),score=(i:number,fn:(v:unknown)=>boolean)=>sample.reduce((n,r)=>n+(fn(r[i])?1:0),0),need=Math.max(1,Math.ceil(sample.length*.4));
  let yi=-1,ys=0;for(let i=0;i<w;i++){const s=score(i,isYear);if(s>ys){ys=s;yi=i}}
  if(yi>=0&&ys>=need){m.year=yi;if(yi>=2){m.make=yi-2;m.model=yi-1}if(yi+1<w)m.mileage=yi+1;if(yi+2<w)m.color=yi+2}
  for(let i=0;i<w;i++){if(score(i,vin)>=need)m.vin??=i;if(score(i,plate)>=need)m.licensePlate??=i}
  for(let i=w-1;i>=0;i--){if(i===m.mileage||i===m.year||i===m.licensePlate)continue;if(score(i,price)>=need){m.retailPrice=i;break}}
  if(m.retailPrice!=null&&m.retailPrice>0){const i=m.retailPrice-1;if(score(i,v=>/[A-Za-z\u0590-\u05ff]/.test(cleanText(v)))>=need)m.region=i}
  return m;
}

export function hasUsableHeaderMapping(m:Partial<Record<VehicleImportField,number>>){return[m.make,m.model,m.year].filter(v=>v!==undefined).length>=2}

export function mapHeaders(headers:string[]):Partial<Record<VehicleImportField,number>>{
  const m:Partial<Record<VehicleImportField,number>>={},n=headers.map(normalizeHeader);
  for(const[f,aliases]of Object.entries(ALIASES)as[VehicleImportField,string[]][]){
    for(let i=0;i<n.length;i++){
      if(aliases.some(a=>n[i]===normalizeHeader(a)||n[i].includes(normalizeHeader(a)))){if(m[f]===undefined)m[f]=i;break}
    }
  }
  return hasUsableHeaderMapping(m)?m:inferMappingFromRows([headers]);
}

export function parseNumber(v:unknown):number|null{
  if(v==null||v==="")return null;
  if(typeof v==="number"&&!Number.isNaN(v))return Math.round(v);
  const n=numeric(v);return n!=null?Math.round(n):null;
}

export type ParsedImportRow = Record<Exclude<VehicleImportField,"features">,string|number|null> & { features:string[] };

export function parseRow(row:unknown[],m:Partial<Record<VehicleImportField,number>>):ParsedImportRow{
  const get=(f:VehicleImportField)=>{const i=m[f];if(i===undefined)return null;const r=row[i];return r==null||cleanText(r)===""?null:r as string|number};
  const text=(f:VehicleImportField)=>get(f)!=null?cleanText(get(f)):null;
  const canonical=canonicalizeVehicleIdentity({make:text("make"),model:text("model")});
  const featureCell=text("features");
  const features=featureCell?featureCell.split(/[,;|]+/).map(v=>v.trim()).filter(Boolean):[];
  return{
    make:canonical.make,
    model:canonical.model,
    trim:text("trim"),
    year:parseNumber(get("year")),
    mileage:parseNumber(get("mileage")),
    color:text("color"),
    b2bPrice:parseNumber(get("b2bPrice")),
    retailPrice:parseNumber(get("retailPrice")),
    region:text("region"),
    ownershipHand:parseNumber(get("ownershipHand")),
    ownershipType:canonicalizeOwnershipSource(text("ownershipType")),
    fuelType:canonicalizeFuelType(text("fuelType")),
    engineDisplacementCc:normalizeEngineDisplacementCc(get("engineDisplacementCc")),
    features,
    dealerRefId:text("dealerRefId"),
    licensePlate:text("licensePlate")?.replace(/[-\s]/g,"")??null,
    vin:text("vin")?.replace(/\s/g,"").toUpperCase()??null,
  };
}
