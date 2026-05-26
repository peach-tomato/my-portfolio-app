import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, Trash2, TrendingUp, TrendingDown, Calendar, PieChart, Activity, RefreshCw, Scale, Loader2, FolderPlus, Edit3, Check, X, CreditCard, Coins, CheckCircle2, DollarSign } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// =========================================================================
// [설정] 1. 초즉시 반응형 로컬 인기 종목 사전
// =========================================================================
const POPULAR_STOCKS = [
  { id: '465640.KS', name: 'ACE 미국하이일드액티브(H)', currency: 'KRW', exchange: 'KSC' }, 
  { id: '0008S0.KS', name: 'TIGER 미국배당다우존스타겟데일리커버드콜', currency: 'KRW', exchange: 'KSC' },
  { id: '482730.KS', name: 'TIGER 미국30년국채코액티브(H)', currency: 'KRW', exchange: 'KSC' },
  { id: '479010.KS', name: 'SOL 미국배당다우존스', currency: 'KRW', exchange: 'KSC' },
  { id: '379780.KS', name: 'KBSTAR 미국S&P500', currency: 'KRW', exchange: 'KSC' },
  { id: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF (VWO)', currency: 'USD', exchange: 'NYSE Arca' },
  { id: 'IEF', name: 'iShares 7-10 Year Treasury Bond ETF (IEF)', currency: 'USD', exchange: 'NASDAQ' },
  { id: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF (TLT)', currency: 'USD', exchange: 'NASDAQ' },
  { id: 'SPY', name: 'SPDR S&P 500 ETF Trust (SPY)', currency: 'USD', exchange: 'NYSE Arca' },
  { id: 'QQQ', name: 'Invesco QQQ Trust (QQQ)', currency: 'USD', exchange: 'NASDAQ' },
  { id: '005930.KS', name: '삼성전자', currency: 'KRW', exchange: 'KSC' },
  { id: '000660.KS', name: 'SK하이닉스', currency: 'KRW', exchange: 'KSC' },
  { id: '035420.KS', name: 'NAVER', currency: 'KRW', exchange: 'KSC' },
  { id: '035720.KS', name: '카카오', currency: 'KRW', exchange: 'KSC' }
];

// =========================================================================
// [설정] 2. 기초 종목별 연간 디폴트 주당 배당금 정의 데이터베이스
// =========================================================================
const getDefaultDividend = (symbol) => {
  if (symbol.startsWith('465640')) return 800; 
  if (symbol.startsWith('0008S0')) return 1020; 
  if (symbol.startsWith('005930')) return 1440; 
  if (symbol.startsWith('000660')) return 1200; 
  if (symbol.startsWith('479010')) return 400;  
  if (symbol.startsWith('482730')) return 660;  
  if (symbol.startsWith('AAPL')) return 1.04;    
  if (symbol.startsWith('TSLA')) return 0;       
  if (symbol.startsWith('MSFT')) return 3.00;    
  if (symbol.startsWith('NVDA')) return 0.04;    
  if (symbol.startsWith('TLT')) return 4.52;     
  if (symbol.startsWith('IEF')) return 3.12;     
  if (symbol.startsWith('VWO')) return 1.45;     
  if (symbol.startsWith('SPY')) return 7.15;     
  if (symbol.startsWith('QQQ')) return 2.70;     
  return symbol.endsWith('.KS') || symbol.endsWith('.KQ') ? 100 : 0.50; 
};

const formatCurrency = (value) => {
  if (value === undefined || value === null) return '0원';
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value) + '원';
};

const formatUSD = (value) => {
  if (value === undefined || value === null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const formatPercent = (value) => {
  return (value * 100).toFixed(2) + '%';
};

const fetchYahooAPI = async (targetUrl) => {
  const cacheBuster = targetUrl.includes('?') ? `&nocache=${Date.now()}` : `?nocache=${Date.now()}`;
  const finalUrl = targetUrl + cacheBuster;
  
  try {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(finalUrl)}`);
    if (res.ok) {
      const text = await res.text();
      return JSON.parse(text);
    }
  } catch (e) {
    console.warn('1차 프록시 지연으로 백업 가동');
  }

  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(finalUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.contents) return JSON.parse(data.contents);
    }
  } catch (err) {
    console.error('프록시 호출 실패', err);
    return null;
  }
};

export default function App() {
  const [accounts, setAccounts] = useState(() => JSON.parse(localStorage.getItem('portfolioAccounts')) || [{ id: 'acc-default', name: '일반 주식 계좌' }, { id: 'acc-pension', name: '연금 저축' }]);
  const [activeAccountId, setActiveAccountId] = useState(() => localStorage.getItem('portfolioActiveAccountId') || 'acc-default');
  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [editAccountNameInput, setEditAccountNameInput] = useState('');
  const [subViewMode, setSubViewMode] = useState('portfolio');
  const [marketPrices, setMarketPrices] = useState({});
  const [exchangeRate, setExchangeRate] = useState(1350.00); 

  const [portfolios, setPortfolios] = useState(() => JSON.parse(localStorage.getItem('portfoliosMap')) || { 'acc-default': [], 'acc-pension': [] });
  const [histories, setHistories] = useState(() => JSON.parse(localStorage.getItem('historiesMap')) || { 'acc-default': [], 'acc-pension': [] });
  const [targetWeightsMap, setTargetWeightsMap] = useState(() => JSON.parse(localStorage.getItem('targetWeightsMap')) || { 'acc-default': {}, 'acc-pension': {} });
  const [dividendsMap, setDividendsMap] = useState(() => JSON.parse(localStorage.getItem('dividendsMap')) || { 'acc-default': [], 'acc-pension': [] });

  const [isSyncingDividends, setIsSyncingDividends] = useState(false);
  const [lastDividendSync, setLastDividendSync] = useState(() => localStorage.getItem('lastDividendSync') || '미실행');

  const [modalAlert, setModalAlert] = useState(null); 
  const [modalConfirm, setModalConfirm] = useState(null); 

  const [editingDividendId, setEditingDividendId] = useState(null);
  const [editingDividendValue, setEditingDividendValue] = useState('');

  const [dividendInputStockId, setDividendInputStockId] = useState('');
  const [dividendInputAmount, setDividendInputAmount] = useState('');
  const [dividendInputDate, setDividendInputDate] = useState(new Date().toISOString().slice(0, 10)); 

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  
  const [transactionType, setTransactionType] = useState('buy'); 
  const [inputQuantity, setInputQuantity] = useState('');
  const [inputAvgPrice, setInputAvgPrice] = useState('');
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 7)); 
  const isFirstRender = useRef(true);

  // 🌟 [신규 상태] 사용자가 추가로 입금하려는 투자금액을 저장하는 상태입니다.
  // 이 금액이 입력되면, 리밸런싱 계산기가 이 금액을 포함하여 목표 매수 수량을 계산합니다.
  const [additionalDeposit, setAdditionalDeposit] = useState('');

  useEffect(() => { localStorage.setItem('portfolioAccounts', JSON.stringify(accounts)); }, [accounts]);
  useEffect(() => { localStorage.setItem('portfolioActiveAccountId', activeAccountId); }, [activeAccountId]);
  useEffect(() => { localStorage.setItem('portfoliosMap', JSON.stringify(portfolios)); }, [portfolios]);
  useEffect(() => { localStorage.setItem('historiesMap', JSON.stringify(histories)); }, [histories]);
  useEffect(() => { localStorage.setItem('targetWeightsMap', JSON.stringify(targetWeightsMap)); }, [targetWeightsMap]);
  useEffect(() => { localStorage.setItem('dividendsMap', JSON.stringify(dividendsMap)); }, [dividendsMap]);

  // 🌟 [버그 방지 코멘트] 계좌를 전환할 때마다 이전 계좌에서 입력해 둔 '추가 입금액'을 0으로 초기화합니다.
  // 다른 계좌에 엉뚱하게 돈이 합산되어 계산되는 것을 막기 위함입니다.
  useEffect(() => {
    setAdditionalDeposit('');
  }, [activeAccountId]);

  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await response.json();
        if (data?.rates?.KRW) setExchangeRate(data.rates.KRW);
      } catch (error) {}
    };
    fetchExchangeRate();
    const interval = setInterval(fetchExchangeRate, 60 * 60 * 1000); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (searchQuery.length < 1 || selectedStock?.name === searchQuery) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const queryKeywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
        const localFiltered = POPULAR_STOCKS.filter(stock => queryKeywords.every(kw => stock.name.toLowerCase().includes(kw) || stock.id.toLowerCase().includes(kw)));
        setSearchResults(localFiltered);

        const targetUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchQuery)}&quotesCount=10&newsCount=0`;
        const data = await fetchYahooAPI(targetUrl);
        if (data && data.quotes) {
          const apiQuotes = data.quotes.filter(q => q.symbol).map(q => {
            let currency = 'USD';
            if (q.symbol.endsWith('.KS') || q.symbol.endsWith('.KQ')) currency = 'KRW';
            return { id: q.symbol, name: q.shortname || q.longname || q.symbol, currency, exchange: q.exchDisp };
          });
          setSearchResults(prev => {
            const combined = [...prev];
            apiQuotes.forEach(apiStock => { if (!combined.some(s => s.id === apiStock.id)) combined.push(apiStock); });
            return combined;
          });
        }
      } catch (err) {} finally { setIsSearching(false); }
    }, 150); 
    return () => clearTimeout(timer);
  }, [searchQuery, selectedStock]);

  const allPortfolioSymbols = useMemo(() => {
    const symbols = new Set();
    Object.values(portfolios).forEach(port => port.forEach(item => symbols.add(item.id)));
    return Array.from(symbols);
  }, [portfolios]);

  useEffect(() => {
    const fetchPortfolioPrices = async () => {
      if (allPortfolioSymbols.length === 0) return;
      let newPrices = {};
      const symbols = allPortfolioSymbols.join(',');

      try {
        const sparkUrl = `https://query2.finance.yahoo.com/v7/finance/spark?symbols=${symbols}&range=1d&interval=5m`;
        const data = await fetchYahooAPI(sparkUrl);
        if (data && data.spark && data.spark.result) {
          data.spark.result.forEach(item => {
            const price = item.response?.[0]?.meta?.regularMarketPrice;
            if (price) newPrices[item.symbol] = price;
          });
        }
      } catch(e) {}

      const missingSymbols = allPortfolioSymbols.filter(sym => !newPrices[sym]);
      if (missingSymbols.length > 0) {
        await Promise.all(missingSymbols.map(async (sym) => {
          try {
            const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`;
            const chartData = await fetchYahooAPI(chartUrl);
            const price = chartData?.chart?.result?.[0]?.meta?.regularMarketPrice;
            if (price) newPrices[sym] = price;
          } catch(err) {}
        }));
      }
      if (Object.keys(newPrices).length > 0) setMarketPrices(prev => ({ ...prev, ...newPrices }));
    };
    fetchPortfolioPrices(); 
    const interval = setInterval(fetchPortfolioPrices, 15000); 
    return () => clearInterval(interval);
  }, [allPortfolioSymbols]);

  const currentPortfolio = useMemo(() => {
    if (activeAccountId === 'all') {
      const combined = {};
      Object.values(portfolios).forEach(port => {
        port.forEach(item => {
          if (combined[item.id]) {
            const existing = combined[item.id];
            const newQty = existing.quantity + item.quantity;
            const newCost = (existing.quantity * existing.avgPrice) + (item.quantity * item.avgPrice);
            combined[item.id] = { ...existing, quantity: newQty, avgPrice: newCost / newQty, dividendPerShare: item.dividendPerShare !== undefined ? item.dividendPerShare : existing.dividendPerShare, addedAt: item.addedAt || existing.addedAt };
          } else {
            combined[item.id] = { ...item };
          }
        });
      });
      return Object.values(combined);
    }
    return portfolios[activeAccountId] || [];
  }, [portfolios, activeAccountId]);

  const currentHistory = useMemo(() => {
    if (activeAccountId === 'all') {
      const dateMap = {};
      Object.values(histories).forEach(histList => {
        histList.forEach(h => {
          if (dateMap[h.date]) { dateMap[h.date].totalAssets += h.totalAssets; dateMap[h.date].invested += h.invested; } 
          else { dateMap[h.date] = { date: h.date, totalAssets: h.totalAssets, invested: h.invested }; }
        });
      });
      return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
    }
    return histories[activeAccountId] || [];
  }, [histories, activeAccountId]);

  const currentTargetWeights = useMemo(() => activeAccountId === 'all' ? {} : targetWeightsMap[activeAccountId] || {}, [targetWeightsMap, activeAccountId]);

  const currentDividends = useMemo(() => {
    if (activeAccountId === 'all') {
      const combined = [];
      Object.entries(dividendsMap).forEach(([accId, divList]) => {
        const accName = accounts.find(a => a.id === accId)?.name || '기타 계좌';
        if (Array.isArray(divList)) divList.forEach(d => combined.push({ ...d, accName, accId }));
      });
      return combined.sort((a, b) => b.date.localeCompare(a.date));
    }
    return Array.isArray(dividendsMap[activeAccountId]) ? dividendsMap[activeAccountId] : [];
  }, [dividendsMap, activeAccountId, accounts]);

  const { totalInvested, totalAssets, totalProfit } = useMemo(() => {
    let invested = 0, assets = 0;
    currentPortfolio.forEach(item => {
      const currentPrice = marketPrices[item.id] || item.avgPrice;
      const rate = item.currency === 'USD' ? exchangeRate : 1;
      invested += (item.quantity * item.avgPrice * rate);
      assets += (item.quantity * currentPrice * rate);
    });
    return { totalInvested: invested, totalAssets: assets, totalProfit: assets - invested };
  }, [currentPortfolio, marketPrices, exchangeRate]);

  const totalROI = totalInvested > 0 ? totalProfit / totalInvested : 0;

  const dividendSummary = useMemo(() => {
    let estAnnualDividendKRW = 0;
    currentPortfolio.forEach(item => {
      const divPerShare = item.dividendPerShare !== undefined ? item.dividendPerShare : getDefaultDividend(item.id);
      const rate = item.currency === 'USD' ? exchangeRate : 1;
      estAnnualDividendKRW += (item.quantity * divPerShare * rate);
    });
    const netAnnualDividendKRW = estAnnualDividendKRW * 0.846; 
    const monthlyAverageDividendKRW = estAnnualDividendKRW / 12;
    const portfolioYield = totalAssets > 0 ? (estAnnualDividendKRW / totalAssets) : 0;

    return { grossAnnual: estAnnualDividendKRW, netAnnual: netAnnualDividendKRW, monthlyAverage: monthlyAverageDividendKRW, portfolioYield };
  }, [currentPortfolio, marketPrices, exchangeRate, totalAssets]);

  const monthlyReceivedChartData = useMemo(() => {
    const monthlyMap = {};
    currentDividends.forEach(d => {
      const monthStr = d.date.slice(0, 7);
      monthlyMap[monthStr] = (monthlyMap[monthStr] || 0) + d.amount;
    });
    return Object.entries(monthlyMap).map(([month, amount]) => ({ month, '수령 배당금': amount })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12); 
  }, [currentDividends]);

  const setWeightsToCurrent = () => {
    if (activeAccountId === 'all') return;
    const newWeights = {};
    currentPortfolio.forEach(item => {
      const currentPrice = marketPrices[item.id] || item.avgPrice;
      const rate = item.currency === 'USD' ? exchangeRate : 1;
      const currentValueKRW = item.quantity * currentPrice * rate;
      newWeights[item.id] = totalAssets > 0 ? Number(((currentValueKRW / totalAssets) * 100).toFixed(1)) : 0;
    });
    setTargetWeightsMap(prev => ({ ...prev, [activeAccountId]: newWeights }));
  };

  useEffect(() => {
    if (isFirstRender.current && currentPortfolio.length > 0 && totalAssets > 0 && activeAccountId !== 'all') {
      if (Object.keys(currentTargetWeights).length === 0) setWeightsToCurrent();
      isFirstRender.current = false;
    }
  }, [totalAssets, currentPortfolio, currentTargetWeights, activeAccountId]);

  const handleTargetWeightChange = (id, value) => {
    if (activeAccountId === 'all') return;
    setTargetWeightsMap(prev => {
      const activeWeights = prev[activeAccountId] || {};
      return { ...prev, [activeAccountId]: { ...activeWeights, [id]: Number(value) } };
    });
  };

  const totalTargetWeight = currentPortfolio.reduce((acc, stock) => acc + (currentTargetWeights[stock.id] || 0), 0);

  const syncAutoDividends = async () => {
    if (isSyncingDividends) return;
    setIsSyncingDividends(true);
    
    const updatedDividendsMap = { ...dividendsMap };
    const updatedPortfolios = { ...portfolios };
    let anyChanges = false;
    const SYSTEM_START_DATE = '2026-05-01';

    for (const [accId, portList] of Object.entries(updatedPortfolios)) {
      if (!Array.isArray(portList) || portList.length === 0) continue;
      
      for (const stock of portList) {
        try {
          let annualDiv = 0;
          try {
            const summaryData = await fetchYahooAPI(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${stock.id}?modules=summaryDetail`);
            annualDiv = summaryData?.quoteSummary?.result?.[0]?.summaryDetail?.trailingAnnualDividendRate?.raw || 0;
          } catch(e) {}

          const chartData = await fetchYahooAPI(`https://query2.finance.yahoo.com/v8/finance/chart/${stock.id}?events=div&interval=1d&range=1y`);
          const dividendsObj = chartData?.chart?.result?.[0]?.events?.dividends;
          
          if (dividendsObj) {
            if (!annualDiv || annualDiv === 0) {
               annualDiv = Object.values(dividendsObj).reduce((sum, d) => sum + d.amount, 0);
            }

            const stockAddedDate = stock.addedAt || SYSTEM_START_DATE; 
            
            Object.values(dividendsObj).forEach(divEvent => {
              const eventDateStr = new Date(divEvent.date * 1000).toISOString().slice(0, 10);
              const todayStr = new Date().toISOString().slice(0, 10);
              
              if (eventDateStr >= SYSTEM_START_DATE && eventDateStr >= stockAddedDate && eventDateStr <= todayStr) {
                const uniqueKey = `auto-${accId}-${stock.id}-${eventDateStr}`;
                const accDivs = updatedDividendsMap[accId] || [];
                const isAlreadyRecorded = accDivs.some(d => d.id === uniqueKey || d.uniqueKey === uniqueKey);
                
                if (!isAlreadyRecorded) {
                  const amountPerShare = divEvent.amount;
                  const totalAmountOriginal = stock.quantity * amountPerShare;
                  const rate = stock.currency === 'USD' ? exchangeRate : 1;
                  const totalAmountKRW = totalAmountOriginal * rate;
                  
                  accDivs.unshift({
                    id: uniqueKey, uniqueKey: uniqueKey, stockId: stock.id, stockName: stock.name,
                    date: eventDateStr, amount: totalAmountKRW, displayAmount: totalAmountOriginal,
                    currency: stock.currency, lockedQuantity: stock.quantity, isAuto: true 
                  });
                  updatedDividendsMap[accId] = accDivs;
                  anyChanges = true;
                }
              }
            });
          }

          if (annualDiv > 0 && stock.dividendPerShare !== annualDiv) {
             stock.dividendPerShare = annualDiv;
             anyChanges = true;
          }
        } catch (e) {
          console.error(`${stock.id} 배당 딥스캔 예외 발생:`, e);
        }
      }
    }

    if (anyChanges) {
      setDividendsMap(updatedDividendsMap);
      setPortfolios(updatedPortfolios);
    }
    
    const nowStr = new Date().toLocaleString('ko-KR');
    setLastDividendSync(nowStr);
    localStorage.setItem('lastDividendSync', nowStr);
    setIsSyncingDividends(false);
  };

  useEffect(() => {
    if (allPortfolioSymbols.length > 0 && exchangeRate > 0) {
      const timer = setTimeout(() => { syncAutoDividends(); }, 2000); 
      return () => clearTimeout(timer);
    }
  }, [allPortfolioSymbols.length, exchangeRate]);

  const handleAddAccount = () => {
    const name = prompt('새로운 투자 주머니(계좌)의 이름을 지어주세요:');
    if (!name || name.trim() === '') return;
    const newId = `acc-${Date.now()}`;
    setAccounts([...accounts, { id: newId, name: name.trim() }]);
    setPortfolios(prev => ({ ...prev, [newId]: [] }));
    setHistories(prev => ({ ...prev, [newId]: [] }));
    setTargetWeightsMap(prev => ({ ...prev, [newId]: {} }));
    setDividendsMap(prev => ({ ...prev, [newId]: [] }));
    setActiveAccountId(newId);
  };

  const handleRenameAccount = () => {
    if (activeAccountId === 'all') return;
    const activeAcc = accounts.find(a => a.id === activeAccountId);
    if (!activeAcc) return;
    setIsEditingAccountName(true);
    setEditAccountNameInput(activeAcc.name);
  };

  const handleSaveAccountName = () => {
    if (!editAccountNameInput.trim()) return;
    setAccounts(accounts.map(a => a.id === activeAccountId ? { ...a, name: editAccountNameInput.trim() } : a));
    setIsEditingAccountName(false);
  };

  const handleDeleteAccount = () => {
    if (activeAccountId === 'all') return;
    if (accounts.length <= 1) {
      setModalAlert({ title: '삭제 차단', message: '최소 1개의 독립 계좌는 유지되어야 합니다.' });
      return;
    }
    setModalConfirm({
      title: '계좌 영구 삭제',
      message: `"${accounts.find(a => a.id === activeAccountId)?.name}" 계좌와 기록이 영구 파괴됩니다. 지우시겠습니까?`,
      onConfirm: () => {
        const remainingAccounts = accounts.filter(a => a.id !== activeAccountId);
        setAccounts(remainingAccounts);
        setActiveAccountId(remainingAccounts[0].id);
        setPortfolios(prev => { const copy = { ...prev }; delete copy[activeAccountId]; return copy; });
        setHistories(prev => { const copy = { ...prev }; delete copy[activeAccountId]; return copy; });
        setTargetWeightsMap(prev => { const copy = { ...prev }; delete copy[activeAccountId]; return copy; });
        setDividendsMap(prev => { const copy = { ...prev }; delete copy[activeAccountId]; return copy; });
      }
    });
  };

  const handleEditDividendClick = (stock) => {
    if (activeAccountId === 'all') return;
    setEditingDividendId(stock.id);
    setEditingDividendValue((stock.dividendPerShare !== undefined ? stock.dividendPerShare : getDefaultDividend(stock.id)).toString());
  };

  const handleSaveDividendRate = (stockId) => {
    if (activeAccountId === 'all') return;
    const value = parseFloat(editingDividendValue);
    if (isNaN(value) || value < 0) {
      setModalAlert({ title: '오류', message: '배당금 수치는 0 이상의 양수만 입력할 수 있습니다.' });
      return;
    }
    setPortfolios(prev => ({ ...prev, [activeAccountId]: portfolios[activeAccountId].map(item => item.id === stockId ? { ...item, dividendPerShare: value } : item) }));
    setEditingDividendId(null);
  };

  const handleAddReceivedDividend = () => {
    if (activeAccountId === 'all') {
      setModalAlert({ title: '입력 오류', message: '종합 화면에서는 수동 기록 불가합니다.' });
      return;
    }
    if (!dividendInputStockId || !dividendInputAmount || !dividendInputDate) {
      setModalAlert({ title: '미기입', message: '종목, 금액 및 수령 날짜를 입력하세요.' });
      return;
    }
    const amount = parseFloat(dividendInputAmount);
    if (isNaN(amount) || amount <= 0) return;
    const matchedStock = currentPortfolio.find(p => p.id === dividendInputStockId);
    if (!matchedStock) return;

    const isUSD = matchedStock.currency === 'USD';
    const finalAmountKRW = isUSD ? amount * exchangeRate : amount;
    const newRecord = {
      id: `div-${Date.now()}`, stockId: matchedStock.id, stockName: matchedStock.name,
      date: dividendInputDate, amount: finalAmountKRW, displayAmount: amount,  
      currency: matchedStock.currency, isAuto: false 
    };

    setDividendsMap(prev => ({ ...prev, [activeAccountId]: [newRecord, ...(prev[activeAccountId] || [])] }));
    setDividendInputAmount('');
  };

  const handleRemoveReceivedDividend = (recordId, accId = activeAccountId) => {
    const targetKey = activeAccountId === 'all' ? accId : activeAccountId;
    setModalConfirm({
      title: '배당 삭제',
      message: '수령 기록을 삭제하시겠습니까?',
      onConfirm: () => setDividendsMap(prev => ({ ...prev, [targetKey]: (prev[targetKey] || []).filter(d => d.id !== recordId) }))
    });
  };

  const handleSelectStock = async (stock) => {
    setSelectedStock(stock);
    setSearchQuery(stock.name);
    setIsDropdownOpen(false);
    setInputAvgPrice('');
    try {
      const data = await fetchYahooAPI(`https://query2.finance.yahoo.com/v8/finance/chart/${stock.id}?interval=1d&range=1d`);
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) setInputAvgPrice(price.toString());
    } catch(e) {}
  };

  const handleAddPortfolio = () => {
    if (activeAccountId === 'all') {
      setModalAlert({ title: '거래 거부', message: '종합 화면에서는 매매 불가합니다. 개별 계좌를 선택하세요.' });
      return;
    }
    if (!selectedStock || !inputQuantity || !inputAvgPrice) return;
    const qty = parseFloat(inputQuantity);
    const avg = parseFloat(inputAvgPrice);
    if (qty <= 0 || avg <= 0) return;

    const activePort = portfolios[activeAccountId] || [];
    const existingIndex = activePort.findIndex(p => p.id === selectedStock.id);
    let updatedPort = [...activePort];
    
    if (transactionType === 'buy') {
      if (existingIndex >= 0) {
        const existing = activePort[existingIndex];
        const totalCost = (existing.quantity * existing.avgPrice) + (qty * avg);
        const newQuantity = existing.quantity + qty;
        updatedPort[existingIndex] = { ...existing, quantity: newQuantity, avgPrice: totalCost / newQuantity, addedAt: existing.addedAt || new Date().toISOString().slice(0, 10) };
      } else {
        updatedPort.push({ id: selectedStock.id, name: selectedStock.name, quantity: qty, avgPrice: avg, currency: selectedStock.currency, addedAt: new Date().toISOString().slice(0, 10) });
      }
    } else {
      if (existingIndex >= 0) {
        const existing = activePort[existingIndex];
        if (existing.quantity < qty) return;
        const newQuantity = existing.quantity - qty;
        if (newQuantity === 0) {
          updatedPort.splice(existingIndex, 1);
          const activeWeights = { ...(targetWeightsMap[activeAccountId] || {}) };
          delete activeWeights[existing.id];
          setTargetWeightsMap(prev => ({ ...prev, [activeAccountId]: activeWeights }));
        } else {
          updatedPort[existingIndex] = { ...existing, quantity: newQuantity };
        }
      } else return;
    }

    setPortfolios(prev => ({ ...prev, [activeAccountId]: updatedPort }));
    setSelectedStock(null); setSearchQuery(''); setInputQuantity(''); setInputAvgPrice('');
  };

  const handleRemovePortfolio = (id) => {
    if (activeAccountId === 'all') {
      setModalAlert({ title: '삭제 차단', message: '종합 화면에서는 삭제 불가합니다.' });
      return;
    }
    setModalConfirm({
      title: '종목 포트폴리오 제거',
      message: '보유 자산에서 해당 종목을 즉시 제거하시겠습니까?',
      onConfirm: () => {
        setPortfolios(prev => ({ ...prev, [activeAccountId]: (prev[activeAccountId] || []).filter(p => p.id !== id) }));
        const activeWeights = { ...(targetWeightsMap[activeAccountId] || {}) };
        delete activeWeights[id];
        setTargetWeightsMap(prev => ({ ...prev, [activeAccountId]: activeWeights }));
      }
    });
  };

  const handleRecordAssets = () => {
    if (activeAccountId === 'all') return;
    if (!recordDate) return;
    const activeHist = histories[activeAccountId] || [];
    const existingIndex = activeHist.findIndex(h => h.date === recordDate);
    const newRecord = { date: recordDate, totalAssets, invested: totalInvested };
    
    let updatedHist = [...activeHist];
    if (existingIndex >= 0) updatedHist[existingIndex] = newRecord;
    else updatedHist.push(newRecord);
    updatedHist.sort((a, b) => a.date.localeCompare(b.date));
    
    setHistories(prev => ({ ...prev, [activeAccountId]: updatedHist }));
  };

  const getProfitColor = (value) => value > 0 ? 'text-red-500' : value < 0 ? 'text-blue-500' : 'text-gray-600';

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* 헤더 */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-4">
          <div className="flex items-center space-x-3">
            <Activity className="w-8 h-8 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">내 자산 포트폴리오</h1>
          </div>
          <div className="flex items-center space-x-2 bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100 shadow-sm">
            <RefreshCw className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-medium text-indigo-700">실시간 환율: 1$ = {formatCurrency(exchangeRate)}</span>
          </div>
        </header>

        {/* 🌟 다중 계좌 통합 이동 탭 메뉴 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setActiveAccountId('all'); setIsEditingAccountName(false); }}
                className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeAccountId === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                <CreditCard className="w-4 h-4" />
                <span>📊 전체 종합 자산</span>
              </button>
              
              <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block"></div>

              {accounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => { setActiveAccountId(acc.id); setIsEditingAccountName(false); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeAccountId === acc.id ? 'bg-indigo-50 text-indigo-600 border border-indigo-200 font-bold' : 'bg-white text-gray-500 hover:text-gray-900 border border-gray-100 hover:border-gray-200'}`}
                >
                  {acc.name}
                </button>
              ))}

              <button
                onClick={handleAddAccount}
                className="flex items-center space-x-1 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="새 계좌 만들기"
              >
                <FolderPlus className="w-4 h-4" />
                <span>계좌 추가</span>
              </button>
            </div>

            {activeAccountId !== 'all' && (
              <div className="flex items-center space-x-2 border-t md:border-t-0 pt-3 md:pt-0 border-gray-100">
                {isEditingAccountName ? (
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={editAccountNameInput}
                      onChange={(e) => setEditAccountNameInput(e.target.value)}
                    />
                    <button onClick={handleSaveAccountName} className="p-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setIsEditingAccountName(false)} className="p-1.5 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleRenameAccount}
                      className="flex items-center space-x-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>이름 수정</span>
                    </button>
                    <button
                      onClick={handleDeleteAccount} 
                      className="flex items-center space-x-1 px-2.5 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>계좌 삭제</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 서브 뷰 탐색 메뉴 */}
        <div className="flex border-b border-gray-200 bg-white rounded-xl shadow-sm overflow-hidden">
          <button 
            onClick={() => setSubViewMode('portfolio')} 
            className={`flex-1 py-3.5 text-center text-sm font-semibold border-b-2 transition-all flex items-center justify-center space-x-2 ${subViewMode === 'portfolio' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            <PieChart className="w-4 h-4" />
            <span>📋 포트폴리오 & 리밸런싱</span>
          </button>
          <button 
            onClick={() => setSubViewMode('dividend')} 
            className={`flex-1 py-3.5 text-center text-sm font-semibold border-b-2 transition-all flex items-center justify-center space-x-2 ${subViewMode === 'dividend' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            <Coins className="w-4 h-4" />
            <span>💰 배당금 분석 & 기록</span>
          </button>
        </div>

        {/* [서브 뷰: 1] 포트폴리오 & 리밸런싱 메뉴 */}
        {subViewMode === 'portfolio' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <span className="text-gray-500 text-sm font-medium mb-1 block">
                  {activeAccountId === 'all' ? '합산 총 자산' : '계좌 총 자산'}
                </span>
                <span className="text-2xl font-bold text-gray-900">{formatCurrency(totalAssets)}</span>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <span className="text-gray-500 text-sm font-medium mb-1 block">투자 원금</span>
                <span className="text-xl font-semibold text-gray-700">{formatCurrency(totalInvested)}</span>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <span className="text-gray-500 text-sm font-medium mb-1 block">평가 손익</span>
                <span className={`text-xl font-bold flex items-center ${getProfitColor(totalProfit)}`}>
                  {totalProfit > 0 ? <TrendingUp className="w-5 h-5 mr-1" /> : totalProfit < 0 ? <TrendingDown className="w-5 h-5 mr-1" /> : null}
                  {formatCurrency(totalProfit)}
                </span>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <span className="text-gray-500 text-sm font-medium mb-1 block">수익률</span>
                <span className={`text-2xl font-bold ${getProfitColor(totalROI)}`}>
                  {totalROI > 0 ? '+' : ''}{formatPercent(totalROI)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                
                {/* 거래 입력 */}
                {activeAccountId === 'all' ? (
                  <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 text-center">
                    <p className="text-sm font-medium text-indigo-700">
                      💡 종합 자산 조회 하고 계십니다. 주식을 사거나 팔려면 상단 탭에서 <strong>개별 주머니 계좌</strong>를 눌러 선택해 주셔야 합니다!
                    </p>
                  </div>
                ) : (
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-bold text-gray-900 flex items-center">
                        <Plus className="w-5 h-5 mr-2 text-indigo-500" /> 거래 입력
                      </h2>
                      <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button onClick={() => setTransactionType('buy')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${transactionType === 'buy' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>매수</button>
                        <button onClick={() => setTransactionType('sell')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${transactionType === 'sell' ? 'bg-white text-blue-500 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>매도</button>
                      </div>
                    </div>
                    
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1 relative">
                        <label className="block text-xs text-gray-500 mb-1">실제 주식 종목 검색</label>
                        <div className="relative">
                          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                          <input 
                            type="text" 
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                            placeholder="삼성전자, AAPL, TLT, VWO 검색" 
                            value={searchQuery} 
                            onChange={(e) => { 
                              setSearchQuery(e.target.value); 
                              setIsDropdownOpen(true); 
                              setSelectedStock(null);
                            }} 
                            onFocus={() => setIsDropdownOpen(true)} 
                          />
                        </div>
                        
                        {isDropdownOpen && searchQuery.length >= 1 && (
                          <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {isSearching ? (
                              <li className="px-4 py-6 text-sm text-gray-500 flex justify-center items-center">
                                <Loader2 className="w-5 h-5 animate-spin mr-2" /> 검색중...
                              </li>
                            ) : searchResults.length > 0 ? (
                              searchResults.map(stock => (
                                <li key={stock.id} className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex flex-col border-b border-gray-50 last:border-0" onClick={() => handleSelectStock(stock)}>
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium text-sm text-gray-900">{stock.name}</span>
                                    <span className="text-xs font-semibold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">{stock.id.replace('.KS', '').replace('.KQ', '')}</span>
                                  </div>
                                  <span className="text-xs text-gray-400 mt-1">{stock.exchange}</span>
                                </li>
                              ))
                            ) : (
                              <li className="px-4 py-4 text-sm text-gray-500 text-center">검색 결과가 없습니다.</li>
                            )}
                          </ul>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">{transactionType === 'buy' ? '매수 수량' : '매도 수량'}</label>
                        <input type="number" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="예: 10" value={inputQuantity} onChange={(e) => setInputQuantity(e.target.value)} />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">{transactionType === 'buy' ? '매수 단가' : '매도 단가'}{selectedStock?.currency === 'USD' ? ' ($)' : ' (원)'}</label>
                        <input type="number" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder={selectedStock?.currency === 'USD' ? "달러(USD)" : "원화(KRW)"} value={inputAvgPrice} onChange={(e) => setInputAvgPrice(e.target.value)} />
                      </div>
                      <div className="flex items-end">
                        <button onClick={handleAddPortfolio} className={`w-full md:w-auto px-6 py-2 text-white font-medium rounded-lg shadow-sm transition-colors ${transactionType === 'buy' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}>
                          {transactionType === 'buy' ? '매수' : '매도'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 보유 종목 리스트 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center"><PieChart className="w-5 h-5 mr-2 text-indigo-500" /> 보유 종목 현황</h2>
                    <div className="text-xs text-gray-400 font-medium text-indigo-600">실시간 데이터 갱신 중 (15초)</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-y border-gray-200">
                        <tr>
                          <th className="px-4 py-3">종목명</th>
                          <th className="px-4 py-3 text-right">수량</th>
                          <th className="px-4 py-3 text-right">비중</th>
                          <th className="px-4 py-3 text-right">평단가</th>
                          <th className="px-4 py-3 text-right">현재가</th>
                          <th className="px-4 py-3 text-right">평가 손익</th>
                          <th className="px-4 py-3 text-center">관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentPortfolio.length === 0 ? (
                          <tr>
                            <td colSpan="7" className="px-4 py-8 text-center text-gray-400">
                              {activeAccountId === 'all' ? '등록된 계좌에 보유 중인 자산이 없습니다.' : '보유 중인 종목이 없습니다.'}
                            </td>
                          </tr>
                        ) : (
                          currentPortfolio.map(stock => {
                            const isPriceLoaded = marketPrices[stock.id] !== undefined;
                            const currentPrice = marketPrices[stock.id] || stock.avgPrice;
                            const isUSD = stock.currency === 'USD';
                            const rate = isUSD ? exchangeRate : 1;
                            
                            const totalCostKRW = stock.quantity * stock.avgPrice * rate;
                            const currentValueKRW = stock.quantity * currentPrice * rate;
                            const profitKRW = currentValueKRW - totalCostKRW;
                            const roi = totalCostKRW > 0 ? profitKRW / totalCostKRW : 0;
                            const currentWeight = totalAssets > 0 ? (currentValueKRW / totalAssets) * 100 : 0;
                            
                            return (
                              <tr key={stock.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-4 py-4 font-medium text-gray-900">
                                  <div className="flex flex-col">
                                    <span>{stock.name}</span>
                                    <span className="text-[10px] text-gray-400">{stock.id.replace('.KS', '').replace('.KQ', '')} {isUSD && <span className="ml-1 text-blue-500 font-semibold">미국</span>}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-right">{stock.quantity.toFixed(2).replace(/\.00$/, '')}주</td>
                                <td className="px-4 py-4 text-right font-medium text-indigo-600">{currentWeight.toFixed(1)}%</td>
                                <td className="px-4 py-4 text-right">
                                  {isUSD ? formatUSD(stock.avgPrice) : formatCurrency(stock.avgPrice)}
                                  {isUSD && <div className="text-[11px] text-gray-400 mt-0.5">({formatCurrency(stock.avgPrice * rate)})</div>}
                                </td>
                                <td className="px-4 py-4 text-right">
                                  {!isPriceLoaded ? (
                                   <span className="text-xs text-gray-400 flex justify-end items-center"><Loader2 className="w-3 h-3 animate-spin mr-1"/>조회중</span>
                                  ) : (
                                    <>
                                      <span className="font-semibold bg-gray-100 px-2 py-1 rounded">
                                        {isUSD ? formatUSD(currentPrice) : formatCurrency(currentPrice)}
                                      </span>
                                      {isUSD && <div className="text-[11px] text-gray-400 mt-1">({formatCurrency(currentPrice * rate)})</div>}
                                    </>
                                  )}
                                </td>
                                <td className={`px-4 py-4 text-right font-bold ${getProfitColor(profitKRW)}`}>
                                  {profitKRW > 0 ? '+' : ''}{formatCurrency(profitKRW)}
                                  <span className="block text-xs font-normal">({profitKRW > 0 ? '+' : ''}{formatPercent(roi)})</span>
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <button 
                                    onClick={() => handleRemovePortfolio(stock.id)} 
                                    disabled={activeAccountId === 'all'}
                                    className={`transition-colors ${activeAccountId === 'all' ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-red-500'}`}
                                  >
                                    <Trash2 className="w-5 h-5 mx-auto" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 리밸런싱 계산기 */}
                {activeAccountId === 'all' ? (
                  <div className="bg-gray-100 p-6 rounded-2xl text-center border border-gray-200 text-gray-500 text-sm">
                    📌 리밸런싱 계산 기능은 개별 계좌에서 독립된 목표에 도달하도록 보조합니다. 위의 개별 계좌 탭 중 하나를 선택해 주세요.
                  </div>
                ) : (
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-bold text-gray-900 flex items-center"><Scale className="w-5 h-5 mr-2 text-indigo-500" /> 리밸런싱 계산기</h2>
                      <button onClick={setWeightsToCurrent} className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md">현재 비중 불러오기</button>
                    </div>

                    {/* 🌟 [신규 UI] 추가 입금액(투자금액)을 입력받는 모듈 영역 */}
                    {currentPortfolio.length > 0 && (
                      <div className="flex items-center space-x-2 mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                        <DollarSign className="w-5 h-5 text-indigo-600" />
                        <span className="text-sm font-semibold text-indigo-900">추가 투자금 배분:</span>
                        <input
                          type="number"
                          className="flex-1 max-w-[200px] px-3 py-1.5 text-sm border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-right"
                          placeholder="입금액 (원)"
                          value={additionalDeposit}
                          onChange={(e) => setAdditionalDeposit(e.target.value)}
                        />
                        <span className="text-sm text-indigo-700 font-medium">원</span>
                      </div>
                    )}
                    
                    {currentPortfolio.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left mb-4 whitespace-nowrap">
                          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-y border-gray-200">
                            <tr>
                              <th className="px-4 py-3">종목명</th>
                              <th className="px-4 py-3 text-center">목표 비중 (%)</th>
                              <th className="px-4 py-3 text-right">리밸런싱 수량</th>
                              <th className="px-4 py-3 text-right">예상 금액 (원화)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentPortfolio.map(stock => {
                              // 🌟 [핵심 계산 로직 코멘트]
                              // 사용자가 입력한 추가 입금액이 있다면, 이를 파싱하여 총 자산에 합산시킵니다.
                              // 이렇게 부풀려진 새로운 '목표 총 자산(targetTotalAssets)'을 기준으로
                              // 기존에 설정해둔 % 비율에 맞게 각각의 주식을 몇 주 더 사야할지 역산해냅니다.
                              const depositAmt = Number(additionalDeposit) || 0;
                              const targetTotalAssets = totalAssets + depositAmt;

                              const currentPrice = marketPrices[stock.id] || stock.avgPrice;
                              const rate = stock.currency === 'USD' ? exchangeRate : 1;
                              const currentValueKRW = stock.quantity * currentPrice * rate;
                              
                              const targetWeight = currentTargetWeights[stock.id] || 0;
                              // 부풀려진 목표 자산금액을 바탕으로 해당 종목이 도달해야 할 원화 가치 추출
                              const targetValueKRW = targetTotalAssets * (targetWeight / 100);
                              
                              const diffKRW = targetValueKRW - currentValueKRW;
                              const diffQty = currentPrice * rate > 0 ? diffKRW / (currentPrice * rate) : 0;
                              const roundedDiffQty = Math.round(diffQty);
                              
                              return (
                                <tr key={`rebal-${stock.id}`} className="border-b border-gray-100">
                                  <td className="px-4 py-3 font-medium text-gray-900">
                                    <div className="flex flex-col">
                                      <span>{stock.name}</span>
                                      <span className="text-[10px] text-gray-400 font-normal mt-0.5">
                                        {stock.id.replace('.KS', '').replace('.KQ', '')}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <input type="number" className="w-20 px-2 py-1 border border-gray-200 rounded text-center focus:ring-1 focus:ring-indigo-500 outline-none" value={currentTargetWeights[stock.id] ?? ''} onChange={(e) => handleTargetWeightChange(stock.id, e.target.value)} min="0" max="100" />
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold">
                                    {roundedDiffQty > 0 ? <span className="text-red-500">매수 {roundedDiffQty}주</span> : roundedDiffQty < 0 ? <span className="text-blue-500">매도 {Math.abs(roundedDiffQty)}주</span> : <span className="text-gray-400">유지</span>}
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs text-gray-500">{roundedDiffQty !== 0 ? formatCurrency(Math.abs(roundedDiffQty * currentPrice * rate)) : '-'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div className="flex justify-between items-center px-4 py-3 bg-gray-50 rounded-lg">
                          <span className="font-medium text-gray-700">목표 비중 총합</span>
                          <span className={`font-bold text-lg ${totalTargetWeight === 100 ? 'text-green-600' : 'text-red-500'}`}>{totalTargetWeight.toFixed(1)}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {/* 자산 수동 기록 */}
                {activeAccountId === 'all' ? (
                  <div className="bg-gray-100 p-6 rounded-2xl text-center border border-gray-200 text-gray-500 text-sm">
                    📉 종합 계좌 상태에서는 자산 기록이 불가능합니다. 개별 계좌에서 기록을 적립하시면 종합 그래프가 자동 합산 설계되어 나타납니다.
                  </div>
                ) : (
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center"><Calendar className="w-5 h-5 mr-2 text-indigo-500" /> 자산 기록하기</h2>
                    <div className="flex gap-3">
                      <input type="month" className="flex-1 px-4 py-2 border border-gray-200 rounded-lg outline-none" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
                      <button onClick={handleRecordAssets} className="px-4 py-2 bg-gray-900 text-white font-medium rounded-lg">기록</button>
                    </div>
                  </div>
                )}

                {/* 자산 등락 추이 시계열 차트 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px] flex flex-col">
                  <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-indigo-500" /> 
                    {activeAccountId === 'all' ? '전체 종합 자산 추이' : '자산 등락 추이'}
                  </h2>
                  <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={currentHistory} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} tickFormatter={(value) => `${(value / 10000).toFixed(0)}만`} dx={-10} />
                        <Tooltip formatter={(value) => formatCurrency(value)} labelStyle={{ color: '#374151', fontWeight: 'bold', marginBottom: '4px' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                        <Line type="monotone" name="총 자산" dataKey="totalAssets" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" name="투자 원금" dataKey="invested" stroke="#9CA3AF" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ==========================================================
            [서브 뷰: 2] 🌟 배당금 분석 & 기록 메뉴
            ========================================================== */}
        {subViewMode === 'dividend' && (
          <>
            {/* 배당금 전용 대시보드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <span className="text-gray-500 text-sm font-medium mb-1 block">예상 연 배당금 (세전)</span>
                <span className="text-2xl font-bold text-gray-900 text-green-600">{formatCurrency(dividendSummary.grossAnnual)}</span>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <span className="text-gray-500 text-sm font-medium mb-1 block">세후 예상 연 배당금 (15.4%)</span>
                <span className="text-xl font-bold text-gray-700">{formatCurrency(dividendSummary.netAnnual)}</span>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <span className="text-gray-500 text-sm font-medium mb-1 block">월 평균 예상 배당 수령액</span>
                <span className="text-xl font-semibold text-gray-700">{formatCurrency(dividendSummary.monthlyAverage)}</span>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <span className="text-gray-500 text-sm font-medium mb-1 block">포트폴리오 배당수익률</span>
                <span className="text-2xl font-bold text-indigo-600">{(dividendSummary.portfolioYield * 100).toFixed(2)}%</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                
                {/* 0. 자동 배당금 동기화 상태 패널 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      <h3 className="text-md font-bold text-gray-900">배당금 실시간 전체 동기화</h3>
                    </div>
                    <p className="text-xs text-gray-500">야후 파이낸스망 및 차트 딥스캔 기술을 가동하여 연 배당금 갱신 및 최근 배당락 내역을 자동 생성합니다.</p>
                    <div className="text-xs font-semibold text-indigo-600 mt-1">마지막 연동 일시: {lastDividendSync}</div>
                  </div>
                  <button 
                    onClick={syncAutoDividends}
                    disabled={isSyncingDividends}
                    className={`flex items-center justify-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all ${isSyncingDividends ? 'opacity-70 cursor-wait' : ''}`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDividends ? 'animate-spin' : ''}`} />
                    <span>{isSyncingDividends ? '딥스캔 동기화 중...' : '지금 전체 동기화하기'}</span>
                  </button>
                </div>

                {/* 1. 주당 배당금(연간) 설정 테이블 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center">
                      <Coins className="w-5 h-5 mr-2 text-indigo-500" /> 주당 배당 설정 & 예상치
                    </h2>
                    <span className="text-xs text-gray-400">배당 수치를 더블클릭 하거나 편집하여 최적화하세요.</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="text-xs text-gray-500 bg-gray-50 border-y border-gray-200">
                        <tr>
                          <th className="px-4 py-3">종목명</th>
                          <th className="px-4 py-3 text-right">보유량</th>
                          <th className="px-4 py-3 text-center">연 주당 배당금 (통화 기준)</th>
                          <th className="px-4 py-3 text-right">예상 연 배당액 (원화)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentPortfolio.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="px-4 py-6 text-center text-gray-400">보유 종목이 없어 예상 배당을 계산할 수 없습니다.</td>
                          </tr>
                        ) : (
                          currentPortfolio.map(stock => {
                            const isUSD = stock.currency === 'USD';
                            const rate = isUSD ? exchangeRate : 1;
                            const customDiv = stock.dividendPerShare !== undefined ? stock.dividendPerShare : getDefaultDividend(stock.id);
                            const estAnnualKRW = stock.quantity * customDiv * rate;
                            
                            return (
                              <tr key={`div-setting-${stock.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-4 py-4 font-medium text-gray-900">
                                  <div className="flex flex-col">
                                    <span>{stock.name}</span>
                                    <span className="text-[10px] text-gray-400">{stock.id.replace('.KS', '').replace('.KQ', '')}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-right">{stock.quantity.toFixed(2).replace(/\.00$/, '')}주</td>
                                <td className="px-4 py-4 text-center">
                                  {editingDividendId === stock.id ? (
                                    <div className="flex items-center justify-center space-x-1">
                                      <input
                                        type="number"
                                        step="any"
                                        className="w-20 px-1.5 py-0.5 border border-indigo-500 rounded text-center text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        value={editingDividendValue}
                                        onChange={(e) => setEditingDividendValue(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveDividendRate(stock.id)}
                                      />
                                      <button onClick={() => handleSaveDividendRate(stock.id)} className="p-1 bg-green-500 text-white rounded hover:bg-green-600">
                                        <Check className="w-3 h-3" />
                                      </button>
                                      <button onClick={() => setEditingDividendId(null)} className="p-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div 
                                      onClick={() => handleEditDividendClick(stock)}
                                      className={`inline-flex items-center space-x-1 px-3 py-1 rounded-lg border border-dashed text-sm font-semibold cursor-pointer ${activeAccountId === 'all' ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed' : 'border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 text-indigo-600'}`}
                                      title={activeAccountId === 'all' ? "개별 계좌 탭에서 편집이 가능합니다." : "클릭하여 주당 배당금 직접 수정"}
                                    >
                                      <span>{isUSD ? formatUSD(customDiv) : formatCurrency(customDiv)}</span>
                                      {activeAccountId !== 'all' && <Edit3 className="w-3 h-3 text-gray-400" />}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-4 text-right font-bold text-gray-900">
                                  {formatCurrency(estAnnualKRW)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. 실제 배당금 수령 기록 입력 폼 */}
                {activeAccountId === 'all' ? (
                  <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 text-center">
                    <p className="text-sm font-medium text-indigo-700">
                      💡 종합 자산 보기 상태입니다. 수동으로 배당금을 직접 기입하시려면 상단에서 <strong>개별 계좌</strong>를 선택해 주세요.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                      <Plus className="w-5 h-5 mr-2 text-indigo-500" /> 수동 배당 수령 수기 입력
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">수령 종목 선택</label>
                        <select 
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                          value={dividendInputStockId}
                          onChange={(e) => setDividendInputStockId(e.target.value)}
                        >
                          <option value="">-- 종목 선택 --</option>
                          {currentPortfolio.map(s => (
                            <option key={`opt-${s.id}`} value={s.id}>{s.name} ({s.id.replace('.KS','').replace('.KQ','')})</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">
                          수령 금액
                          {dividendInputStockId && ` (${currentPortfolio.find(s => s.id === dividendInputStockId)?.currency})`}
                        </label>
                        <input
                          type="number"
                          step="any"
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="배당 입금액"
                          value={dividendInputAmount}
                          onChange={(e) => setDividendInputAmount(e.target.value)}
                        />
                      </div>

                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">수령 날짜</label>
                        <input
                          type="date"
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={dividendInputDate}
                          onChange={(e) => setDividendInputDate(e.target.value)}
                        />
                      </div>

                      <button 
                        onClick={handleAddReceivedDividend}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors"
                      >
                        기록 추가
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. 최근 배당 수령 내역 리스트 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <Calendar className="w-5 h-5 mr-2 text-indigo-500" /> 최근 배당금 수령 내역
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="text-xs text-gray-500 bg-gray-50 border-y border-gray-200">
                        <tr>
                          {activeAccountId === 'all' && <th className="px-4 py-3">계좌명</th>}
                          <th className="px-4 py-3">수령일</th>
                          <th className="px-4 py-3">종목명</th>
                          <th className="px-4 py-3 text-right">수령액 (원본)</th>
                          <th className="px-4 py-3 text-right">환산 수령액 (원화)</th>
                          <th className="px-4 py-3 text-center">관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentDividends.length === 0 ? (
                          <tr>
                            <td colSpan={activeAccountId === 'all' ? 6 : 5} className="px-4 py-8 text-center text-gray-400">수령된 배당 내역이 존재하지 않습니다.</td>
                          </tr>
                        ) : (
                          currentDividends.map(div => {
                            const isUSD = div.currency === 'USD';
                            return (
                              <tr key={div.id} className="border-b border-gray-100 hover:bg-gray-50">
                                {activeAccountId === 'all' && (
                                  <td className="px-4 py-4 font-semibold text-indigo-600">{div.accName}</td>
                                )}
                                <td className="px-4 py-4 text-gray-600">{div.date}</td>
                                <td className="px-4 py-4 font-medium text-gray-900">
                                  <div className="flex items-center space-x-1.5">
                                    <span>{div.stockName}</span>
                                    {div.isAuto && (
                                      <span className="flex items-center space-x-0.5 text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-bold border border-green-200">
                                        <CheckCircle2 className="w-2.5 h-2.5" />
                                        <span>자동</span>
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-right font-medium">
                                  {isUSD ? formatUSD(div.displayAmount) : formatCurrency(div.displayAmount)}
                                </td>
                                <td className="px-4 py-4 text-right font-bold text-green-600">
                                  {formatCurrency(div.amount)}
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <button 
                                    onClick={() => handleRemoveReceivedDividend(div.id, div.accId)}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4 mx-auto" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 오른쪽 차트 섹션 */}
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px] flex flex-col">
                  <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-indigo-500" /> 월별 배당금 수령 현황
                  </h2>
                  <div className="flex-1 w-full min-h-0">
                    {monthlyReceivedChartData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-sm text-gray-400">차트를 출력할 배당 수령 데이터가 없습니다.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyReceivedChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7280' }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(value) => `${(value / 10000).toFixed(0)}만`} dx={-5} />
                          <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Bar dataKey="수령 배당금" fill="#10B981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        
      </div>

      {/* ==========================================================
          [CORS / 이프레임 가드] 11. 🌟 리액트 커스텀 모달 알림창
          ========================================================== */}
      {modalAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">{modalAlert.title}</h3>
            <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{modalAlert.message}</p>
            <button 
              onClick={() => setModalAlert(null)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors text-sm"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {modalConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 text-red-600">{modalConfirm.title}</h3>
            <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{modalConfirm.message}</p>
            <div className="flex space-x-2">
              <button 
                onClick={() => setModalConfirm(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors text-sm"
              >
                취소
              </button>
              <button 
                onClick={() => {
                  modalConfirm.onConfirm();
                  setModalConfirm(null);
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors text-sm"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}