'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(ROOT,name),'utf8');

test('V18.24 declara version y tablas beta',()=>{
  const pkg=JSON.parse(read('package.json'));
  const server=read('server.js');
  assert.equal(pkg.version,'18.24.0');
  assert.match(server,/const APP_VERSION = '18\.24\.0'/);
  assert.match(server,/CREATE TABLE IF NOT EXISTS beta_memberships/);
  assert.match(server,/CREATE TABLE IF NOT EXISTS beta_activity_days/);
  assert.match(server,/CREATE TABLE IF NOT EXISTS beta_feedback/);
});

test('V18.24 expone endpoints de participante y administracion',()=>{
  const server=read('server.js');
  for(const route of ['/api/beta/status','/api/beta/activity','/api/beta/feedback','/api/admin/beta','/api/admin/beta/bulk','/api/admin/beta/export.csv']) assert.ok(server.includes(route),route);
});

test('V18.24 incluye panel beta, feedback y privacidad',()=>{
  const html=read('index.html'),css=read('styles.css'),privacy=read('privacy.html');
  assert.match(html,/id="adminPaneBeta"/);
  assert.match(html,/id="betaParticipantSection"/);
  assert.match(html,/id="betaFeedbackModal"/);
  assert.match(css,/\.beta-admin-stats/);
  assert.match(privacy,/Beta controlada y feedback/);
});
