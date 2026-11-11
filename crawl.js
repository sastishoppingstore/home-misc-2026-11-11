const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const url = require('url');

async function crawl(startUrl, outDir) {
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: require('os').homedir() + '/.cache/ms-playwright/chromium-1187/chrome-linux/chrome'
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const visited = new Set();
  const toVisit = [startUrl];
  
  // Set up request interception to save assets
  page.on('response', async response => {
    try {
      const respUrl = response.url();
      const status = response.status();
      if (status >= 200 && status < 400) {
        const parsed = new URL(respUrl);
        if (parsed.hostname === new URL(startUrl).hostname) {
          const pathname = parsed.pathname;
          let filePath;
          if (pathname === '/' || pathname === '') {
            filePath = path.join(outDir, 'index.html');
          } else if (pathname.endsWith('/')) {
            filePath = path.join(outDir, pathname.slice(1), 'index.html');
          } else {
            // Check if it's likely a file with extension
            if (path.extname(pathname)) {
              filePath = path.join(outDir, pathname.slice(1));
            } else {
              // Might be HTML route
              filePath = path.join(outDir, pathname.slice(1) + '.html');
            }
          }
          const dir = path.dirname(filePath);
          fs.mkdirSync(dir, { recursive: true });
          const body = await response.body();
          fs.writeFileSync(filePath, body);
        }
      }
    } catch (e) {
      // ignore
    }
  });
  
  while (toVisit.length > 0) {
    const current = toVisit.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    try {
      await page.goto(current, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      // Extract all links
      const links = await page.$$eval('a[href]', anchors => 
        anchors.map(a => a.href).filter(h => h.startsWith('http'))
      );
      
      for (const link of links) {
        const parsed = new URL(link);
        const startParsed = new URL(startUrl);
        if (parsed.hostname === startParsed.hostname && !visited.has(link)) {
          // Normalize
          const clean = parsed.origin + parsed.pathname + parsed.search;
          if (!visited.has(clean) && !toVisit.includes(clean)) {
            toVisit.push(clean);
          }
        }
      }
    } catch (e) {
      console.error('ERR', current, e.message);
    }
  }
  
  await browser.close();
  console.log('Done, visited:', visited.size);
}

const args = process.argv.slice(2);
crawl(args[0], args[1]);
