'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { io: ioClient } = require('socket.io-client');

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(),'vrmatch-v1818-test-'));
process.env.NODE_ENV = 'test';
process.env.VR_STORAGE_DIR = TEST_DIR;
process.env.VR_DB_PATH = path.join(TEST_DIR,'data','vrmatch-test.db');
process.env.VR_APP_BASE_URL = 'http://127.0.0.1';
process.env.VR_ALLOWED_ORIGINS = 'http://127.0.0.1';
process.env.VR_REQUIRE_EMAIL_VERIFICATION = 'false';
process.env.VR_ADMIN_EMAILS = 'admin@test.local';
process.env.VR_LAUNCH_MODE = 'development';
process.env.VR_MATCH_EMAIL_ENABLED = 'false';
process.env.VR_RETENTION_EMAIL_ENABLED = 'false';
delete process.env.SMTP_HOST;
delete process.env.SMTP_PORT;
delete process.env.SMTP_FROM;

const appModule = require('../server.js');
const { server, db, startServer, APP_VERSION, runBackupSelfTest, recordServerError } = appModule;
let baseUrl = '';

async function api(route,{method='GET',token,body}={}){
  const headers={};
  if(token)headers.Authorization=`Bearer ${token}`;
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(`${baseUrl}${route}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();
  let data={};
  try{data=text?JSON.parse(text):{};}catch{data={raw:text};}
  return {status:response.status,headers:response.headers,data};
}

async function register(email,password='Clave-Segura-1816'){
  const res=await api('/api/auth/register',{method:'POST',body:{email,password,confirmAdult:true,acceptTerms:true,acquisition:{sessionId:`test-${email}`}}});
  assert.equal(res.status,200,res.data?.error||`registro ${email}`);
  assert.equal(res.data.ok,true);
  assert.ok(res.data.token);
  return {...res.data,password};
}

async function setCity(token,city='Valencia'){
  const res=await api('/api/community/me',{method:'PUT',token,body:{city}});
  assert.equal(res.status,200,res.data?.error);
  assert.equal(res.data.city.name,city);
}

async function setProfile(token,{name,age=30,city='Valencia'}={}){
  const res=await api('/api/profile',{method:'PUT',token,body:{
    nombre:name,edad:age,gender:'other',ciudad:city,bio:'Perfil automático de prueba',intereses:['cine','viajes'],fotos:[],
    preferences:{ageMin:18,ageMax:60,lookingFor:'all',city:'',interest:'',radiusKm:50},
    privacy:{discoverable:true,showOnline:true,allowGameInvites:true}
  }});
  assert.equal(res.status,200,res.data?.error);
  assert.equal(res.data.profile.nombre,name);
  return res.data.profile;
}

function connect(token){
  return new Promise((resolve,reject)=>{
    const socket=ioClient(baseUrl,{auth:{token},transports:['websocket'],forceNew:true,reconnection:false,timeout:4000});
    const timer=setTimeout(()=>{socket.close();reject(new Error('Timeout conectando Socket.IO'));},5000);
    socket.once('connect',()=>{clearTimeout(timer);resolve(socket);});
    socket.once('connect_error',err=>{clearTimeout(timer);reject(err);});
  });
}

function emitAck(socket,event,payload,timeout=4000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`Timeout ack ${event}`)),timeout);
    socket.emit(event,payload,(reply)=>{clearTimeout(timer);resolve(reply||{});});
  });
}

test.before(async()=>{
  startServer(0,'127.0.0.1');
  if(!server.listening)await once(server,'listening');
  const address=server.address();
  baseUrl=`http://127.0.0.1:${address.port}`;
});

test.after(async()=>{
  try{await new Promise(resolve=>server.close(()=>resolve()));}catch{}
  try{db.close();}catch{}
  try{fs.rmSync(TEST_DIR,{recursive:true,force:true});}catch{}
});

test('healthz comprueba SQLite, almacenamiento y versión', async()=>{
  const res=await api('/healthz');
  assert.equal(res.status,200);
  assert.equal(res.data.ok,true);
  assert.equal(res.data.db,true);
  assert.equal(res.data.storage,true);
  assert.equal(res.data.version,APP_VERSION);
  assert.equal(APP_VERSION,'18.19.0');
  assert.ok(res.headers.get('x-request-id'));
});

test('flujo crítico: registro → ciudad → perfil → match → mensaje → juego → bloqueo', async()=>{
  const a=await register('admin@test.local');
  const b=await register('persona-b@test.local');
  await setCity(a.token,'Valencia');
  await setCity(b.token,'Valencia');
  await setProfile(a.token,{name:'Admin Test',age:31});
  await setProfile(b.token,{name:'Persona B',age:29});

  const activationStart=await api('/api/activation/me',{token:a.token});
  assert.equal(activationStart.status,200);
  assert.equal(activationStart.data.activation.steps.find(x=>x.key==='city').complete,true);
  assert.equal(activationStart.data.activation.steps.find(x=>x.key==='profile').complete,true);
  assert.equal(activationStart.data.activation.steps.find(x=>x.key==='photo').complete,false);
  assert.equal(activationStart.data.activation.steps.find(x=>x.key==='like').complete,false);

  const sa=await connect(a.token), sb=await connect(b.token);
  try{
    const like1=await emitAck(sa,'dating_like',{oponenteID:b.user.id});
    assert.equal(like1.ok,true);
    assert.equal(like1.match,false);
    const activationLike=await api('/api/activation/me',{token:a.token});
    assert.equal(activationLike.data.activation.steps.find(x=>x.key==='like').complete,true);
    const like2=await emitAck(sb,'dating_like',{oponenteID:a.user.id});
    assert.equal(like2.ok,true);
    assert.equal(like2.match,true);
    const activationMatch=await api('/api/activation/me',{token:a.token});
    assert.equal(activationMatch.data.activation.steps.find(x=>x.key==='match').complete,true);

    const matches=await api('/api/matches',{token:a.token});
    assert.equal(matches.status,200);
    assert.equal(matches.data.matches.length,1);

    const message=await emitAck(sa,'dating_chat_send',{oponenteID:b.user.id,texto:'Hola desde el test automático'});
    assert.equal(message.ok,true);
    assert.ok(message.id);
    const activationMessage=await api('/api/activation/me',{token:a.token});
    assert.equal(activationMessage.data.activation.steps.find(x=>x.key==='message').complete,true);

    const invite=await emitAck(sa,'dating_game_invite',{oponenteID:b.user.id,mazo:'rompehielos'});
    assert.equal(invite.ok,true);
    assert.equal(invite.offline,false);
    const accept=await emitAck(sb,'dating_game_accept',{oponenteID:a.user.id});
    assert.equal(accept.ok,true);
    assert.ok(accept.salaID);
    const gameRow=db.prepare('SELECT status,match_id FROM game_sessions ORDER BY started_at DESC LIMIT 1').get();
    assert.equal(gameRow.status,'active');
    assert.ok(gameRow.match_id);

    const block=await api('/api/block',{method:'POST',token:a.token,body:{userId:b.user.id}});
    assert.equal(block.status,200);
    const chatAfterBlock=await emitAck(sb,'dating_chat_send',{oponenteID:a.user.id,texto:'Esto no debe enviarse'});
    assert.equal(chatAfterBlock.ok,false);
    assert.match(chatAfterBlock.error,/match|disponible/i);
    const activeMatch=db.prepare('SELECT active FROM matches LIMIT 1').get();
    assert.equal(activeMatch.active,0);
  } finally { sa.close(); sb.close(); }
});

test('referidos atribuyen el alta y la eliminación de cuenta funciona', async()=>{
  const adminLogin=await api('/api/auth/login',{method:'POST',body:{email:'admin@test.local',password:'Clave-Segura-1816'}});
  assert.equal(adminLogin.status,200);
  const adminToken=adminLogin.data.token;
  const ref=await api('/api/referrals/me',{token:adminToken});
  assert.equal(ref.status,200);
  assert.ok(ref.data.referral.code);

  const email='referido@test.local', password='Otra-Clave-1816';
  const signup=await api('/api/auth/register',{method:'POST',body:{email,password,confirmAdult:true,acceptTerms:true,referralCode:ref.data.referral.code,acquisition:{sessionId:'test-referral',source:'referral',medium:'member'}}});
  assert.equal(signup.status,200,signup.data?.error);
  const refAfter=await api('/api/referrals/me',{token:adminToken});
  assert.equal(refAfter.status,200);
  assert.ok(Number(refAfter.data.referral.signups||0)>=1);

  const del=await api('/api/account/delete',{method:'POST',token:signup.data.token,body:{password}});
  assert.equal(del.status,200,del.data?.error);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE email=?').get(email).n,0);
});


test('matching inteligente ordena por afinidad y explica señales sin saltarse filtros', async()=>{
  const me=await register('ranking-me@test.local');
  const high=await register('ranking-high@test.local');
  const low=await register('ranking-low@test.local');
  await setCity(me.token,'Valencia');await setCity(high.token,'Valencia');await setCity(low.token,'Castellón');
  const profileBody=(name,city,intereses)=>({
    nombre:name,edad:30,gender:'other',ciudad:city,bio:'Perfil suficientemente completo para probar el ranking inteligente de VRMatch.',intereses,
    fotos:['data:image/png;base64,iVBORw0KGgo='],preferences:{ageMin:18,ageMax:60,lookingFor:'all',city:'',interest:'',radiusKm:50},privacy:{discoverable:true,showOnline:true,allowGameInvites:true}
  });
  let r=await api('/api/profile',{method:'PUT',token:me.token,body:profileBody('Ranking Me','Valencia',['cine','viajes','música'])});assert.equal(r.status,200,r.data?.error);
  r=await api('/api/profile',{method:'PUT',token:high.token,body:profileBody('Ranking High','Valencia',['cine','viajes','música','fotografía'])});assert.equal(r.status,200,r.data?.error);
  r=await api('/api/profile',{method:'PUT',token:low.token,body:profileBody('Ranking Low','Castellón',['running'])});assert.equal(r.status,200,r.data?.error);
  db.prepare('UPDATE profiles SET profile_verified=1,profile_verified_at=? WHERE user_id=?').run(Date.now(),high.user.id);
  const discover=await api('/api/discover',{token:me.token});
  assert.equal(discover.status,200);
  const ids=discover.data.profiles.map(x=>x.id);
  assert.ok(ids.includes(high.user.id));assert.ok(ids.includes(low.user.id));
  assert.ok(ids.indexOf(high.user.id)<ids.indexOf(low.user.id),'el perfil con más señales de afinidad debe aparecer antes');
  const hp=discover.data.profiles.find(x=>x.id===high.user.id), lp=discover.data.profiles.find(x=>x.id===low.user.id);
  assert.ok(Number(hp.affinityScore)>Number(lp.affinityScore));
  assert.ok(Array.isArray(hp.matchReasons));
  assert.ok(hp.matchReasons.some(x=>/inter[eé]s|ciudad|verificado/i.test(x)));
  assert.ok(!('components' in hp),'no se exponen componentes internos del ranking');
});


test('viralidad 2.0: códigos de creador, ranking de ciudades y recompensa de Boost', async()=>{
  const login=await api('/api/auth/login',{method:'POST',body:{email:'admin@test.local',password:'Clave-Segura-1816'}});
  assert.equal(login.status,200);const adminToken=login.data.token;
  const creator=await api('/api/admin/creator-codes',{method:'POST',token:adminToken,body:{code:'TESTCREATOR',displayName:'Creator Test',campaign:'AUTOMATIC_TEST'}});
  assert.equal(creator.status,201,creator.data?.error);
  const visit=await api('/api/creators/visit',{method:'POST',body:{code:'TESTCREATOR',sessionId:'creator-test-session'}});
  assert.equal(visit.status,200);
  const cr=await register('creator-attributed@test.local');
  // La ayuda register() no añade creatorCode; la atribución se prueba con una segunda cuenta explícita.
  const attributed=await api('/api/auth/register',{method:'POST',body:{email:'creator-two@test.local',password:'Clave-Segura-1816',confirmAdult:true,acceptTerms:true,creatorCode:'TESTCREATOR',acquisition:{sessionId:'creator-two'}}});
  assert.equal(attributed.status,200,attributed.data?.error);
  const stats=await api('/api/admin/creator-codes?days=30',{token:adminToken});
  assert.equal(stats.status,200);const row=stats.data.creators.find(x=>x.code==='TESTCREATOR');assert.ok(row);assert.ok(row.visits>=1);assert.ok(row.signups>=1);
  const board=await api('/api/community/leaderboard?days=7');assert.equal(board.status,200);assert.ok(Array.isArray(board.data.cities));

  const ref=await api('/api/referrals/me',{token:adminToken});assert.equal(ref.status,200);const code=ref.data.referral.code;
  // Se insertan cinco invitados activos directamente en la BD de test para no consumir
  // el rate-limit público de registro mientras comprobamos la concesión idempotente del premio.
  const adminId=login.data.user.id,ts=Date.now();
  for(let i=0;i<5;i++){
    const id=`viral-active-${i}`;
    db.prepare('INSERT INTO users(id,email,password_hash,created_at,last_seen_at,status) VALUES(?,?,?,?,?,?)').run(id,`active-ref-${i}@test.local`,'test-hash',ts+i,ts+i,'active');
    db.prepare("INSERT INTO profiles(user_id,name,age,city,bio,interests_json,photos_json,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(id,`Activo ${i}`,25+i,'Valencia','Perfil activo de prueba','[\"cine\",\"viajes\"]','[\"/uploads/test.jpg\"]',ts+i);
    db.prepare('INSERT INTO community_city_memberships(user_id,city_slug,joined_at,updated_at) VALUES(?,?,?,?)').run(id,'valencia',ts+i,ts+i);
    db.prepare('INSERT INTO likes(from_user,to_user,created_at) VALUES(?,?,?)').run(id,cr.user.id,ts+i);
    db.prepare('INSERT INTO user_referral_attributions(invitee_user_id,referrer_user_id,referral_code,attributed_at) VALUES(?,?,?,?)').run(id,adminId,code,ts+i);
  }
  const rewarded=await api('/api/referrals/me',{token:adminToken});assert.equal(rewarded.status,200);assert.ok(rewarded.data.referral.activeReferrals>=5);assert.ok(rewarded.data.referral.boostCredits>=1);
  const boost=await api('/api/referrals/boost',{method:'POST',token:adminToken,body:{}});assert.equal(boost.status,200,boost.data?.error);assert.ok(boost.data.activeUntil>Date.now());assert.equal(boost.data.referral.boostCredits,rewarded.data.referral.boostCredits-1);
});

test('backup restaurable, errores de servidor y diagnóstico admin', async()=>{
  const login=await api('/api/auth/login',{method:'POST',body:{email:'admin@test.local',password:'Clave-Segura-1816'}});
  const token=login.data.token;

  const restore=await runBackupSelfTest(login.data.user.id);
  assert.equal(restore.ok,true,restore.message);
  assert.equal(restore.integrity,'ok');

  recordServerError('automatic-test',new Error('Error controlado para observabilidad'),{method:'TEST',path:'/tests/smoke'});
  const errors=await api('/api/admin/system/errors?limit=10',{token});
  assert.equal(errors.status,200);
  assert.ok(errors.data.errors.some(x=>x.context==='automatic-test'));

  const system=await api('/api/admin/system',{token});
  assert.equal(system.status,200);
  assert.equal(system.data.system.integrity.ok,true);
  assert.equal(system.data.system.diagnostics.checks.some(x=>x.key==='backupRestore'&&x.ok),true);

  const smtp=await api('/api/admin/system/smtp-test',{method:'POST',token,body:{password:'Clave-Segura-1816'}});
  assert.equal(smtp.status,503);
  assert.match(smtp.data.error,/SMTP/i);
});
