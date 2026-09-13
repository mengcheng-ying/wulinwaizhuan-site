/**
 * 百度链接逐条推送脚本（武林外传：十年之约站 wulin.fmbly.com 专用）
 * -------------------------------------------------
 * 与主站一致：把收录链接【一条一条】投递给百度 API，
 * 每推一条检查配额，over quota 即停止，把当日配额用满。
 * 依赖 GitHub Secret: BAIDU_PUSH_TOKEN（百度资源平台「普通收录-API推送」token）
 */
const fs = require('fs');

const SITE = 'https://wulin.fmbly.com';
const TOKEN = process.env.BAIDU_TOKEN;

if (!TOKEN) {
  console.log('⏭ 未配置 BAIDU_PUSH_TOKEN，跳过。');
  process.exit(0);
}

// ===== 读取 sitemap 规范 URL + 补充收录清单中的页面 =====
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
let urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(Boolean);

// 收录清单中额外页面（sitemap 未包含但页面存在）
const EXTRA = [
  'https://wulin.fmbly.com/wulinwaizhuan-site'
];
urls = urls.concat(EXTRA.filter(u => !urls.includes(u)));

const unique = [...new Set(urls)];
console.log('待逐条推送链接（去重后）共 ' + unique.length + ' 条：');
unique.forEach((u, i) => console.log('  ' + (i + 1) + '. ' + u));

const ENDPOINT = 'http://data.zz.baidu.com/urls?site=' + SITE + '&token=' + TOKEN;

function pushOne(url) {
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: url
  }).then(async res => {
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { http: res.status, text: text, json: json };
  });
}

(async () => {
  let success = 0, remain = null, quotaHit = false;
  const failReasons = {};

  for (let i = 0; i < unique.length; i++) {
    const url = unique[i];
    let r;
    try {
      r = await pushOne(url);
    } catch (err) {
      console.log(`✖ [${i + 1}/${unique.length}] ${url} -> 请求失败: ${err.message}`);
      failReasons['network_error'] = (failReasons['network_error'] || 0) + 1;
      continue;
    }
    const msg = (r.json && r.json.message) || '';
    if (msg.includes('over quota')) {
      console.log(`⏹ [${i + 1}/${unique.length}] ${url} -> 今日配额已用完(over quota)，停止推送。`);
      quotaHit = true;
      break;
    }
    if (r.json && typeof r.json.success === 'number') {
      success += r.json.success;
      if (typeof r.json.remain === 'number') remain = r.json.remain;
      console.log(`✔ [${i + 1}/${unique.length}] ${url} -> success=${r.json.success} remain=${r.json.remain}`);
    } else if (r.json && r.json.error) {
      console.log(`✖ [${i + 1}/${unique.length}] ${url} -> 错误码 ${r.json.error}: ${r.json.message || ''}`);
      failReasons[r.json.error] = (failReasons[r.json.error] || 0) + 1;
    } else {
      console.log(`? [${i + 1}/${unique.length}] ${url} -> 非预期响应: ${r.text}`);
      failReasons['unknown'] = (failReasons['unknown'] || 0) + 1;
    }
  }

  console.log('\n========== 汇总 ==========');
  console.log('成功推送: ' + success + ' 条');
  if (remain !== null) console.log('剩余今日配额(remain): ' + remain);
  console.log(quotaHit ? '状态: 触发今日配额上限而停止' : '状态: 全部链接遍历完毕');
  if (Object.keys(failReasons).length) console.log('错误分类: ' + JSON.stringify(failReasons));
})();
