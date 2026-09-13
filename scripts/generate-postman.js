'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const Converter = require('openapi-to-postmanv2');
const { Collection } = require('postman-collection');
const root = path.resolve(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'openapi.json'), 'utf8'));

function convert() {
  return new Promise((resolve, reject) => Converter.convert({ type:'json', data:spec }, {
    folderStrategy:'Tags', requestParametersResolution:'Example', exampleParametersResolution:'Example',
  }, (err, result) => {
    if (err || !result.result) return reject(err || new Error(result.reason));
    resolve(result.output.find(output => output.type === 'collection').data);
  }));
}
function flatten(items) { return items.flatMap(item => item.item ? flatten(item.item) : [item]); }
function apiPath(url) { return '/' + url.path.join('/').replace(/:([^/]+)/g, '{$1}'); }
const script = (listen, lines) => ({ listen, script:{ type:'text/javascript', exec:lines } });
async function main() {
  const collection = await convert();
  collection.info.name = '花卉電商 API';
  collection.info.description = '由 openapi.json 自動產生。先執行 Auth 登入；JWT 自動儲存。可依序取得商品、加入購物車、建立訂單與查詢。綠界信用卡與 OTP 操作使用 Playwright E2E。';
  collection.variable = [
    { key:'baseUrl', value:'http://localhost:3001', type:'string' },
    { key:'token', value:'', type:'string' },
    { key:'sessionId', value:'', type:'string' },
    ...['productId','cartItemId','orderId'].map(key => ({key,value:'',type:'string'})),
  ];
  collection.auth = { type:'bearer', bearer:[{key:'token', value:'{{token}}', type:'string'}] };
  collection.event = [script('prerequest',[
    'if (!pm.collectionVariables.get("sessionId")) pm.collectionVariables.set("sessionId", pm.variables.replaceIn("{{$guid}}"));',
  ])];
  const requests = flatten(collection.item);
  for(const item of requests) {
    const req = item.request;
    const pathname = apiPath(req.url);
    const operation = spec.paths[pathname]?.[req.method.toLowerCase()];
    assert(operation, 'Missing OpenAPI operation: ' + req.method + ' ' + pathname);
    req.url.host = ['{{baseUrl}}']; delete req.url.protocol; delete req.url.port;
    for(const variable of req.url.variable || []) {
      if(variable.key==='id') variable.value = pathname.startsWith('/api/orders')||pathname.startsWith('/api/admin/orders')?'{{orderId}}':pathname.startsWith('/api/cart')?'{{cartItemId}}':'{{productId}}';
    }
    const query=(req.url.query||[]).filter(q=>!q.disabled).map(q=>q.key+'='+q.value).join('&');
    req.url.raw = '{{baseUrl}}/' + req.url.path.join('/') + (query?'?'+query:'');
    req.header=(req.header||[]).filter(header=>!['authorization','x-session-id'].includes(header.key.toLowerCase()));
    const security = operation.security ?? spec.security ?? [];
    req.auth = security.some(s=>s.bearerAuth) ? {type:'bearer',bearer:[{key:'token',value:'{{token}}',type:'string'}]} : {type:'noauth'};
    if(pathname.startsWith('/api/cart')) req.header.push({key:'X-Session-Id',value:'{{sessionId}}',type:'text'});
    item.event = [script('test', [
      'pm.test("Response is JSON", () => pm.response.to.be.json);',
      'const body = pm.response.json();',
      'pm.test("Response envelope", () => { pm.expect(body).to.have.all.keys("data", "error", "message"); });',
    ])];
    if(pathname==='/api/auth/login' && req.method==='POST') {
      req.body.raw=JSON.stringify({email:'admin@hexschool.com',password:'12345678'},null,2);
      item.event[0].script.exec.push('pm.test("Login succeeded", () => pm.response.to.have.status(200));',
        'if (pm.response.code === 200 && body.data && body.data.token) pm.collectionVariables.set("token", body.data.token);');
    }
    if(pathname==='/api/auth/register' && req.method==='POST') req.body.raw=JSON.stringify({email:'test-{{$guid}}@example.com',password:'password123',name:'Postman Test'},null,2);
    if(pathname==='/api/products' && req.method==='GET') item.event[0].script.exec.push('if (body.data && body.data.products.length) pm.collectionVariables.set("productId", body.data.products[0].id);');
    if(pathname==='/api/cart' && req.method==='POST') req.body.raw=JSON.stringify({productId:'{{productId}}',quantity:1},null,2);
    if(pathname==='/api/cart' && req.method==='GET') item.event[0].script.exec.push('if (body.data && body.data.items.length) pm.collectionVariables.set("cartItemId", body.data.items[0].id);');
    if(pathname==='/api/orders' && req.method==='POST') {
      req.body.raw=JSON.stringify({recipientName:'Postman Test',recipientEmail:'postman@example.com',recipientAddress:'台北市中正區測試路123號',shippingMethod:'home',isRemote:false,isExpress:false},null,2);
      item.event[0].script.exec.push('if (pm.response.code === 201 && body.data) pm.collectionVariables.set("orderId", body.data.id);');
    }
    if(pathname==='/api/orders/{id}/pay') req.body.raw=JSON.stringify({action:'success'},null,2);
    // Examples may contain old generated auth placeholders; use the normalized request.
    for(const response of item.response||[]) response.originalRequest=JSON.parse(JSON.stringify(req));
  }
  const expected=Object.values(spec.paths).reduce((n,item)=>n+Object.keys(item).filter(k=>['get','post','put','patch','delete','head','options'].includes(k)).length,0);
  assert.equal(requests.length,expected);
  for(const item of requests) assert(item.request.url.raw.startsWith('{{baseUrl}}/'));
  const output=JSON.stringify(new Collection(collection).toJSON(),null,2)+'\n';
  JSON.parse(output);
  fs.mkdirSync(path.join(root,'postman'),{recursive:true});
  fs.writeFileSync(path.join(root,'postman/flower-shop.postman_collection.json'),output);
  console.log(`Generated valid Postman v2.1 collection with ${requests.length} requests.`);
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
