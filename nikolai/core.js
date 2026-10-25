export const VERSION=1;
export const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function tomorrow(){const d=new Date();d.setDate(d.getDate()+1);return localDate(d)}
export const total=o=>(o.items||[]).reduce((s,i)=>s+Number(i.qty)*Number(i.price),0)+Number(o.labor||0);
export const cost=o=>(o.items||[]).reduce((s,i)=>s+Number(i.qty)*Number(i.cost||0),0)+Number(o.expenses||0);
export const normalizePhone=p=>String(p||'').replace(/\D/g,'').replace(/^8(?=\d{10}$)/,'7');
export const clientKey=o=>normalizePhone(o.phone)||o.name.trim().toLowerCase();
export function initial(){return {version:VERSION,orders:[],catalog:[{id:'mechanic',name:'Механический картридж',price:3000,cost:0,months:3},{id:'carbon',name:'Угольный картридж',price:5000,cost:0,months:6},{id:'membrane',name:'Мембрана',price:15000,cost:0,months:12}],settings:{startLat:'',startLng:'',startTime:'09:00'},routes:{}}}
const finite=(v,min=0,max=1e12)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&localDate(new Date(s+'T12:00:00'))===s;
export function validate(db){if(!db||db.version!==VERSION||!Array.isArray(db.orders)||!Array.isArray(db.catalog)||!db.settings||!db.routes||typeof db.routes!=='object'||Array.isArray(db.routes))throw Error('Неизвестный формат копии');if(db.orders.length>50000||db.catalog.length>1000)throw Error('Слишком большой файл');const ids=new Set();for(const o of db.orders){if(typeof o.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(o.id)||ids.has(o.id)||typeof o.name!=='string'||!o.name.trim()||typeof o.phone!=='string'||typeof o.address!=='string'||!date(o.date)||!['new','done','postponed','noanswer'].includes(o.status)||!Array.isArray(o.items)||!finite(o.labor)||!finite(o.paid)||!finite(o.expenses)||!finite(o.duration,5,600)||(o.status==='done'&&!date(o.completedDate)))throw Error('Повреждена карточка заказа');ids.add(o.id);if(o.lat!==null&&(!finite(o.lat,-90,90)||!finite(o.lng,-180,180)))throw Error('Некорректные координаты');for(const i of o.items)if(typeof i.name!=='string'||!i.name.trim()||!finite(i.qty,1,100000)||!finite(i.price)||!finite(i.cost)||!finite(i.months,0,120))throw Error('Повреждена позиция');}for(const c of db.catalog)if(typeof c.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(c.id)||typeof c.name!=='string'||!c.name.trim()||!finite(c.price)||!finite(c.cost)||!finite(c.months,0,120))throw Error('Повреждён справочник');for(const [day,ids] of Object.entries(db.routes))if(!date(day)||!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw Error('Повреждён маршрут');for(const [key,min,max] of [['startLat',-90,90],['startLng',-180,180]]){const v=db.settings[key];if(v!==''&&!(typeof v==='string'||typeof v==='number')||v!==''&&!finite(Number(v),min,max))throw Error('Повреждена стартовая точка')}delete db._blocked;return db}
export function report(orders,from,to){const rows=orders.filter(o=>o.status==='done'&&o.completedDate>=from&&o.completedDate<=to);return {rows,clients:new Set(rows.map(clientKey)).size,filters:rows.reduce((s,o)=>s+o.items.reduce((a,i)=>a+i.qty,0),0),sales:rows.reduce((s,o)=>s+total(o),0),received:rows.reduce((s,o)=>s+o.paid,0),debt:rows.reduce((s,o)=>s+Math.max(0,total(o)-o.paid),0),margin:rows.reduce((s,o)=>s+total(o)-cost(o),0)}}
export function distance(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng);return 6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2)))}
export function routeOrders(orders,start){let remaining=[...orders].filter(o=>o.lat!==null&&o.lng!==null),missing=orders.filter(o=>o.lat===null||o.lng===null),result=[],pos=start;while(remaining.length){let i=0;if(pos)i=remaining.reduce((best,o,n)=>distance(pos,o)<distance(pos,remaining[best])?n:best,0);const next=remaining.splice(i,1)[0];result.push(next);pos=next;}return {ordered:result.concat(missing),missing:missing.length}}
export function parseSpeech(input){
  const text=String(input||'').replace(/\u00a0/g,' ').trim(),r={};
  if(!text)return r;
  const clean=x=>x.trim().replace(/^[,:;\s]+|[,:;\s.]+$/g,'');
  const take=(key,re)=>{const m=text.match(re);if(m&&clean(m[1]))r[key]=clean(m[1])};
  const boundary='(?=\\s*(?:[,;\\n]|(?:телефон|номер|адрес|сегодня|завтра|послезавтра|после|работа|получил|расходы)(?:\\s|:))|$)';
  take('name',new RegExp('(?:^|[\\s,;])(?:имя|клиент(?:ка)?)\\s*[:=]?\\s+(.+?)'+boundary,'i'));
  // Номер без слова «телефон» тоже распознаётся. Не объединяем цифры адреса с телефоном.
  const pm=text.match(/(?:\+7|[78])(?:[ ()-]*\d){10}(?![ ()-]*\d)/);
  if(pm)r.phone='+'+normalizePhone(pm[0]);
  else take('phone',/(?:телефон|номер)\s*[:=]?\s*([+\d][\d ()-]{5,}[\d])/i);
  take('address',/адрес\s*[:=]?\s*(.+?)(?=\s*(?:[,;]?\s*(?:сегодня|завтра|послезавтра|после|время|работа|получил|расходы|примечание))(?:[\s,:]|$)|[;\n]|$)/i);
  if(!r.name&&!/^(?:работа|стоимость|получил|получено|оплата|расходы|выполнено|адрес|телефон|номер)(?:[\s,:]|$)/i.test(text)){
    const head=clean(text.split(/[,;\n]|(?:\+7|[78])(?=[ ()-]*\d)/)[0]);
    if(/^[А-ЯЁA-ZӘҒҚҢӨҰҮҺІ][А-Яа-яЁёA-Za-zӘәҒғҚқҢңӨөҰұҮүҺһІі -]{1,55}$/.test(head))r.name=head;
  }
  if(!r.address&&pm){
    const tail=text.slice(pm.index+pm[0].length).replace(/^[,;\s]+/,'');
    const m=tail.match(/^(.+?)(?=\s*(?:[,;]?\s*(?:сегодня|завтра|послезавтра|после|время|работа|получил|расходы))(?:[\s,:]|$)|[;\n]|$)/i);
    if(m&&/\d/.test(m[1])&&!/^(?:работа|получил|расходы)/i.test(m[1]))r.address=clean(m[1]);
  }
  if(/послезавтра/i.test(text)){const d=new Date();d.setDate(d.getDate()+2);r.date=localDate(d)}
  else if(/завтра/i.test(text))r.date=tomorrow();else if(/сегодня/i.test(text))r.date=localDate();
  const iso=text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);if(iso&&date(iso[1]))r.date=iso[1];
  const dm=text.match(/(?:дата\s*[:=]?\s*|на\s+)(\d{1,2})[./](\d{1,2})(?:[./](20\d{2}))?/i);
  if(dm){const d=`${dm[3]||new Date().getFullYear()}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`;if(date(d))r.date=d}
  const tm=text.match(/(?:после|время|в)\s*[:=]?\s+(\d{1,2})(?::(\d{2}))?(?:\s|[,.]|$)/i);
  if(tm&&+tm[1]<24&&+(tm[2]||0)<60)r.time=tm[1].padStart(2,'0')+':'+(tm[2]||'00');
  for(const [key,pattern] of [['labor','(?:стоимость работы|работа)'],['paid','(?:получил|оплата|получено)'],['expenses','расходы']]){
    const m=text.match(new RegExp(pattern+'\\s*[:=]?\\s*(\\d[\\d ]*)(?=[,.;]|\\s*(?:тенге|тг|работа|получил|оплата|расходы|выполнено)|$)','i'));
    if(m)r[key]=Number(m[1].replace(/\s/g,''));
  }
  if(/(?:^|[\s,.;])выполнено(?:$|[\s,.;])/i.test(text)){r.status='done';r.completedDate=localDate()}
  return r;
}
export function pendingForDate(orders,day){return orders.filter(o=>o.date===day&&o.status!=='done')}
export function contactLinks(phone,message=''){
  const digits=normalizePhone(phone);
  return {number:digits?'+'+digits:'',tel:digits?'tel:+'+digits:'',whatsapp:digits?'https://wa.me/'+digits+(message?'?text='+encodeURIComponent(message):''):''};
}

export function dueItems(orders,catalog){const latest=new Map();orders.filter(o=>o.status==='done').sort((a,b)=>a.completedDate.localeCompare(b.completedDate)).forEach(o=>o.items.forEach(i=>{const months=i.months??catalog.find(c=>c.id===i.catalogId)?.months;if(!months)return;const d=new Date(o.completedDate+'T12:00:00');const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+months);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));latest.set(clientKey(o)+'|'+i.catalogId,{order:o,item:i,due:localDate(d)})}));return [...latest.values()].sort((a,b)=>a.due.localeCompare(b.due))}

// Coordinates are imported locally: links are parsed as text, never fetched.
export function parseLocation(input){
  const text=String(input||'').trim();let lat,lng;
  try{const u=new URL(text);const pair=u.searchParams.get('ll');if(pair){const a=pair.split(',').map(Number);[lng,lat]=a}else{const a=u.searchParams.get('query')||u.searchParams.get('q')||u.searchParams.get('center');const m=a?.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);if(m)[lat,lng]=[+m[1],+m[2]];const at=u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);if(at&&lat===undefined)[lat,lng]=[+at[1],+at[2]];const hash=u.hash.match(/map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);if(hash)[lat,lng]=[+hash[1],+hash[2]];const geo=u.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);if(geo)[lat,lng]=[+geo[1],+geo[2]];}}catch{}
  if(lat===undefined){const m=text.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);if(m)[lat,lng]=[+m[1],+m[2]]}
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
export function publicAddress(text){return String(text||'').split(/(?:,?\s+(?:кв(?:артира)?\.?|подъезд|этаж|домофон)\s*[:№]?\s*\d)/i)[0].trim()}
