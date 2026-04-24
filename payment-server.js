/**
 * Attendance SaaS — Razorpay Payment Server
 * Run: node payment-server.js  (port 3005)
 * Add to .env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 */
import Razorpay from 'razorpay';
import crypto   from 'crypto';
import fs       from 'fs';
import path     from 'path';
import { fileURLToPath } from 'url';
import express  from 'express';
import cors     from 'cors';
import dotenv   from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
app.use(cors());
app.use(express.json());

const KEY_ID     = process.env.RAZORPAY_KEY_ID     || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

let rzp = null;
function getRZP() {
  if (!rzp && KEY_ID && KEY_SECRET) rzp = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
  return rzp;
}

// ── Client storage ────────────────────────────────────────────────────────────
const CLIENTS_FILE = path.join(__dirname, 'data', 'attendance-clients.json');
function loadClients() {
  try {
    if (!fs.existsSync(path.dirname(CLIENTS_FILE))) fs.mkdirSync(path.dirname(CLIENTS_FILE), { recursive: true });
    if (fs.existsSync(CLIENTS_FILE)) return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
  } catch (_) {}
  return {};
}
function saveClients(c) { try { fs.writeFileSync(CLIENTS_FILE, JSON.stringify(c, null, 2)); } catch (_) {} }

// ── Payment page ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const keyId = KEY_ID || 'NOT_CONFIGURED';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Office Attendance SaaS — Pricing</title>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .wrap{max-width:900px;width:100%;padding:40px 20px;text-align:center}
    h1{font-size:2rem;margin-bottom:8px}
    .sub{color:#aaa;margin-bottom:48px}
    .plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;text-align:left}
    .plan{background:#111;border:1px solid #222;border-radius:16px;padding:28px;position:relative}
    .plan.hot{border-color:#6366f1}
    .badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#6366f1;color:#fff;font-size:11px;font-weight:700;padding:4px 14px;border-radius:99px}
    .pname{font-size:1.1rem;font-weight:700;margin-bottom:8px}
    .price{font-size:2.2rem;font-weight:800;color:#6366f1;margin:12px 0 4px}
    .price span{font-size:1rem;color:#aaa;font-weight:400}
    ul{list-style:none;margin:20px 0}
    li{padding:7px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:.9rem}
    li::before{content:'✓ ';color:#6366f1;font-weight:700}
    input{width:100%;padding:10px 14px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:.9rem;margin-bottom:8px;outline:none}
    input:focus{border-color:#6366f1}
    .btn{width:100%;padding:13px;border-radius:8px;border:none;font-size:1rem;font-weight:700;cursor:pointer;background:#6366f1;color:#fff;margin-top:4px}
    .btn:hover{opacity:.85}
    .msg{margin-top:12px;padding:10px;border-radius:8px;font-size:.88rem;display:none}
    .ok{background:#0d1a3a;border:1px solid #6366f1;color:#818cf8;display:block}
    .err{background:#2e0a0a;border:1px solid #e53;color:#e53;display:block}
  </style>
</head>
<body>
<div class="wrap">
  <h1>Office Attendance SaaS</h1>
  <p class="sub">Automated attendance, payroll & HR — for Indian SMBs</p>
  <div class="plans">
    <div class="plan">
      <div class="pname">Starter</div>
      <div class="price">₹1,999<span>/month</span></div>
      <ul>
        <li>Up to 20 employees</li>
        <li>Attendance tracking</li>
        <li>Salary calculation</li>
        <li>Payslip generation</li>
        <li>WhatsApp support</li>
      </ul>
      <input type="text" id="n1" placeholder="Your Name" />
      <input type="tel" id="p1" placeholder="Phone (10 digits)" maxlength="10" />
      <input type="text" id="c1" placeholder="Company Name" />
      <button class="btn" onclick="pay('starter',199900,'n1','p1','c1','m1')">Subscribe ₹1,999/mo</button>
      <div class="msg" id="m1"></div>
    </div>
    <div class="plan hot">
      <div class="badge">BEST VALUE</div>
      <div class="pname">Business</div>
      <div class="price">₹2,999<span>/month</span></div>
      <ul>
        <li>Up to 50 employees</li>
        <li>Advanced payroll rules</li>
        <li>Leave management</li>
        <li>CEO dashboard & reports</li>
        <li>Export to Excel/PDF</li>
        <li>Priority support</li>
      </ul>
      <input type="text" id="n2" placeholder="Your Name" />
      <input type="tel" id="p2" placeholder="Phone (10 digits)" maxlength="10" />
      <input type="text" id="c2" placeholder="Company Name" />
      <button class="btn" onclick="pay('business',299900,'n2','p2','c2','m2')">Subscribe ₹2,999/mo</button>
      <div class="msg" id="m2"></div>
    </div>
    <div class="plan">
      <div class="pname">Enterprise</div>
      <div class="price">₹4,999<span>/month</span></div>
      <ul>
        <li>Unlimited employees</li>
        <li>Multi-branch support</li>
        <li>Custom integrations</li>
        <li>API access</li>
        <li>Dedicated support</li>
        <li>On-site setup</li>
      </ul>
      <input type="text" id="n3" placeholder="Your Name" />
      <input type="tel" id="p3" placeholder="Phone (10 digits)" maxlength="10" />
      <input type="text" id="c3" placeholder="Company Name" />
      <button class="btn" onclick="pay('enterprise',499900,'n3','p3','c3','m3')">Subscribe ₹4,999/mo</button>
      <div class="msg" id="m3"></div>
    </div>
  </div>
</div>
<script>
const RZP_KEY="${keyId}";
function pay(plan,amount,nId,pId,cId,mId){
  const name=document.getElementById(nId).value.trim();
  const phone=document.getElementById(pId).value.trim();
  const company=document.getElementById(cId).value.trim();
  const m=document.getElementById(mId);
  m.className='msg';
  if(!name||!phone||phone.length<10){m.className='msg err';m.textContent='Enter valid name and 10-digit phone';return;}
  fetch('/payment/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone,company,plan,amount})})
  .then(r=>r.json()).then(order=>{
    if(order.error)throw new Error(order.error);
    new Razorpay({key:RZP_KEY,amount:order.amount,currency:'INR',name:'Attendance SaaS',description:plan+' Plan',order_id:order.id,prefill:{name,contact:'91'+phone},theme:{color:'#6366f1'},
      handler:function(resp){
        fetch('/payment/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...resp,name,phone,company,plan})})
        .then(r=>r.json()).then(res=>{
          if(res.success){m.className='msg ok';m.textContent='✅ Subscribed! We will contact you within 24 hours to set up your account.';}
          else{m.className='msg err';m.textContent='Verification failed. Contact piyush.unhive@gmail.com';}
        });
      },
      modal:{ondismiss:()=>{m.className='msg err';m.textContent='Payment cancelled.'}}
    }).open();
  }).catch(e=>{m.className='msg err';m.textContent='Error: '+e.message;});
}
</script>
</body>
</html>`);
});

app.post('/payment/create', async (req, res) => {
  const { name, phone, company, plan, amount } = req.body;
  if (!name || !phone || !amount) return res.status(400).json({ error: 'Missing fields' });
  const r = getRZP();
  if (!r) return res.status(503).json({ error: 'Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env' });
  try {
    const order = await r.orders.create({ amount: Math.round(amount), currency: 'INR', receipt: `att_${phone}_${Date.now()}`, notes: { name, phone, company, plan } });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payment/verify', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, name, phone, company, plan } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.json({ success: false });
  const expected = crypto.createHmac('sha256', KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  if (expected !== razorpay_signature) return res.json({ success: false, error: 'Bad signature' });
  const clients = loadClients();
  clients[phone] = { name, phone, company, plan, paymentId: razorpay_payment_id, activatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
  saveClients(clients);
  res.json({ success: true });
});

app.get('/clients', (_req, res) => res.json(Object.values(loadClients())));

const PORT = process.env.PAYMENT_PORT || 3005;
app.listen(PORT, () => console.log(`\n💳 Attendance Payment Server: http://localhost:${PORT}\n   Share with clients: http://localhost:${PORT}/\n`));
