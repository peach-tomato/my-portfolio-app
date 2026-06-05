export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // CORS Preflight OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const urlParam = req.query?.url;
  if (!urlParam) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }

  // 보안 설정: Yahoo Finance 주소만 프록시 허용 (SSRF 공격 방지)
  if (!urlParam.startsWith('https://query2.finance.yahoo.com/') && !urlParam.startsWith('https://query1.finance.yahoo.com/')) {
    return res.status(403).json({ error: 'Forbidden target URL. Only Yahoo Finance API is allowed.' });
  }

  try {
    const yahooRes = await fetch(urlParam, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!yahooRes.ok) {
      return res.status(yahooRes.status).json({ error: `Yahoo API responded with status ${yahooRes.status}` });
    }

    const data = await yahooRes.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Yahoo Proxy Serverless Error:', error);
    return res.status(500).json({ error: error.message || 'Internal proxy error' });
  }
}
