import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, Trash2, TrendingUp, TrendingDown, Calendar, PieChart, Activity, RefreshCw, Scale, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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

// 🌟 초경량 스마트 패치 함수: 빠른 프록시를 우선 시도하고 캐싱 방지 필터 적용
const fetchYahooAPI = async (targetUrl) => {
  const cacheBuster = `&nocache=${Date.now()}`;
  const finalUrl = targetUrl + cacheBuster;
  
  try {
    // 1순위: 가장 신속하게 데이터를 반환하는 corsproxy.io 직접 호출
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(finalUrl)}`);
    if (res.ok) {
      const text = await res.text();
      return JSON.parse(text);
    }
  } catch (e) {
    console.warn('Primary fast proxy failed, switching to backup...', e);
  }

  try {
    // 2순위: 100% 신뢰할 수 있는 allorigins 우회 처리
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(finalUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.contents) {
        return JSON.parse(data.contents);
      }
    }
  } catch (err) {
    console.error('모든 프록시 호출에 실패했습니다.', err);
    return null;
  }
};

export default function App() {
  // --- 상태 관리 ---
  const [marketPrices, setMarketPrices] = useState({});
  const [exchangeRate, setExchangeRate] = useState(1350.00); 
  
  // 데이터 불러오기 (Local Storage)
  const [portfolio, setPortfolio] = useState(() => {
    const saved = localStorage.getItem('portfolioData');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('portfolioHistory');
    return saved ? JSON.parse(saved) : [];
  });

  const [targetWeights, setTargetWeights] = useState(() => {
    const saved = localStorage.getItem('portfolioTargetWeights');
    return saved ? JSON.parse(saved) : {};
  });

  // 검색 관련 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  
  // 폼 입력 상태
  const [transactionType, setTransactionType] = useState('buy'); 
  const [inputQuantity, setInputQuantity] = useState('');
  const [inputAvgPrice, setInputAvgPrice] = useState('');
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 7)); 
  const isFirstRender = useRef(true);

  // --- 자동 저장 (Local Storage) ---
  useEffect(() => {
    localStorage.setItem('portfolioData', JSON.stringify(portfolio));
  }, [portfolio]);

  useEffect(() => {
    localStorage.setItem('portfolioHistory', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('portfolioTargetWeights', JSON.stringify(targetWeights));
  }, [targetWeights]);

  // --- 1. 실제 환율 데이터 가져오기 API ---
  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await response.json();
        if (data && data.rates && data.rates.KRW) {
          setExchangeRate(data.rates.KRW);
        }
      } catch (error) {
        console.error('환율 가져오기 실패:', error);
      }
    };
    fetchExchangeRate();
    const interval = setInterval(fetchExchangeRate, 60 * 60 * 1000); 
    return () => clearInterval(interval);
  }, []);

  // --- 2. 야후 파이낸스 종목 검색 API (티커 검색 강화 및 딜레이 단축) ---
  useEffect(() => {
    // 최소 검색 글자수를 1글자로 낮추어 단일 문자 티커(T, F 등)도 즉시 검색 가능하게 수정
    if (searchQuery.length < 1 || selectedStock?.name === searchQuery) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const targetUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchQuery)}&quotesCount=10&newsCount=0`;
        const data = await fetchYahooAPI(targetUrl);
        
        if (data && data.quotes) {
          const validQuotes = data.quotes
            // 필터링 완화: quoteType 제한을 완전히 없애서 Symbol이 있는 모든 상품(ETF, 펀드 등)이 무조건 검색되도록 수정
            .filter(q => q.symbol)
            .map(q => {
              let currency = 'USD';
              if (q.symbol.endsWith('.KS') || q.symbol.endsWith('.KQ')) currency = 'KRW';
              
              return {
                id: q.symbol,
                name: q.shortname || q.longname || q.symbol,
                currency: currency,
                exchange: q.exchDisp
              };
            });
          setSearchResults(validQuotes);
        }
      } catch (err) {
        console.error('종목 검색 실패:', err);
      } finally {
        setIsSearching(false);
      }
    }, 150); // 반응 대기시간을 150ms로 단축하여 극적인 타자 반응 속도 구현

    return () => clearTimeout(timer);
  }, [searchQuery, selectedStock]);

  // --- 3. 보유 종목 실제 주가 불러오기 API (초고속 Spark API 적용) ---
  useEffect(() => {
    const fetchPortfolioPrices = async () => {
      if (portfolio.length === 0) return;
      
      let newPrices = {};
      const symbols = portfolio.map(p => p.id).join(',');

      try {
        const sparkUrl = `https://query2.finance.yahoo.com/v7/finance/spark?symbols=${symbols}&range=1d&interval=5m`;
        const data = await fetchYahooAPI(sparkUrl);
        
        if (data && data.spark && data.spark.result) {
          data.spark.result.forEach(item => {
            const price = item.response?.[0]?.meta?.regularMarketPrice;
            if (price) {
              newPrices[item.symbol] = price;
            }
          });
        }
      } catch(e) {
        console.warn('Spark API 호출 실패, 예비 로직(Chart API)으로 전환합니다.');
      }

      const missingSymbols = portfolio.filter(p => !newPrices[p.id]);
      
      if (missingSymbols.length > 0) {
        await Promise.all(missingSymbols.map(async (stock) => {
          try {
            const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${stock.id}?interval=1d&range=1d`;
            const chartData = await fetchYahooAPI(chartUrl);
            const price = chartData?.chart?.result?.[0]?.meta?.regularMarketPrice;
            if (price) newPrices[stock.id] = price;
          } catch(err) {
            console.error(`${stock.id} 최종 조회 실패`, err);
          }
        }));
      }

      if (Object.keys(newPrices).length > 0) {
        setMarketPrices(prev => ({ ...prev, ...newPrices }));
      }
    };

    fetchPortfolioPrices(); 
    const interval = setInterval(fetchPortfolioPrices, 15000); 
    return () => clearInterval(interval);
  }, [portfolio]);

  // --- 파생 데이터 계산 ---
  const { totalInvested, totalAssets, totalProfit } = useMemo(() => {
    let invested = 0;
    let assets = 0;
    portfolio.forEach(item => {
      const currentPrice = marketPrices[item.id] || item.avgPrice;
      const rate = item.currency === 'USD' ? exchangeRate : 1;
      
      invested += (item.quantity * item.avgPrice * rate);
      assets += (item.quantity * currentPrice * rate);
    });
    return { totalInvested: invested, totalAssets: assets, totalProfit: assets - invested };
  }, [portfolio, marketPrices, exchangeRate]);

  const totalROI = totalInvested > 0 ? totalProfit / totalInvested : 0;

  // --- 리밸런싱 ---
  const setWeightsToCurrent = () => {
    const newWeights = {};
    portfolio.forEach(item => {
      const currentPrice = marketPrices[item.id] || item.avgPrice;
      const rate = item.currency === 'USD' ? exchangeRate : 1;
      const currentValueKRW = item.quantity * currentPrice * rate;
      newWeights[item.id] = totalAssets > 0 ? Number(((currentValueKRW / totalAssets) * 100).toFixed(1)) : 0;
    });
    setTargetWeights(newWeights);
  };

  useEffect(() => {
    if (isFirstRender.current && portfolio.length > 0 && totalAssets > 0) {
      if (Object.keys(targetWeights).length === 0) setWeightsToCurrent();
      isFirstRender.current = false;
    }
  }, [totalAssets, portfolio, targetWeights]);

  const handleTargetWeightChange = (id, value) => {
    setTargetWeights(prev => ({ ...prev, [id]: Number(value) }));
  };

  const totalTargetWeight = portfolio.reduce((acc, stock) => acc + (targetWeights[stock.id] || 0), 0);

  // --- 핸들러 ---
  const handleSelectStock = async (stock) => {
    setSelectedStock(stock);
    setSearchQuery(stock.name);
    setIsDropdownOpen(false);
    setInputAvgPrice('');
    
    try {
      const targetUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${stock.id}?interval=1d&range=1d`;
      const data = await fetchYahooAPI(targetUrl);
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) {
        setInputAvgPrice(price.toString());
      }
    } catch(e) {
      console.error('단가 자동입력 실패', e);
    }
  };

  const handleAddPortfolio = () => {
    if (!selectedStock || !inputQuantity || !inputAvgPrice) return;
    const qty = parseFloat(inputQuantity);
    const avg = parseFloat(inputAvgPrice);
    
    if (qty <= 0 || avg <= 0) {
      alert("수량과 단가는 0보다 커야 합니다.");
      return;
    }

    const existingIndex = portfolio.findIndex(p => p.id === selectedStock.id);
    
    if (transactionType === 'buy') {
      if (existingIndex >= 0) {
        const existing = portfolio[existingIndex];
        const totalCost = (existing.quantity * existing.avgPrice) + (qty * avg);
        const newQuantity = existing.quantity + qty;
        const newPortfolio = [...portfolio];
        newPortfolio[existingIndex] = { ...existing, quantity: newQuantity, avgPrice: totalCost / newQuantity };
        setPortfolio(newPortfolio);
      } else {
        setPortfolio([...portfolio, { id: selectedStock.id, name: selectedStock.name, quantity: qty, avgPrice: avg, currency: selectedStock.currency }]);
      }
    } else {
      if (existingIndex >= 0) {
        const existing = portfolio[existingIndex];
        if (existing.quantity < qty) {
          alert("보유 수량보다 많이 매도할 수 없습니다."); return;
        }
        const newQuantity = existing.quantity - qty;
        const newPortfolio = [...portfolio];
        if (newQuantity === 0) {
          newPortfolio.splice(existingIndex, 1);
          const newTargetWeights = { ...targetWeights };
          delete newTargetWeights[existing.id];
          setTargetWeights(newTargetWeights);
        } else {
          newPortfolio[existingIndex] = { ...existing, quantity: newQuantity };
        }
        setPortfolio(newPortfolio);
      } else {
        alert("현재 보유하지 않은 종목입니다."); return;
      }
    }
    setSelectedStock(null); setSearchQuery(''); setInputQuantity(''); setInputAvgPrice('');
  };

  const handleRemovePortfolio = (id) => {
    setPortfolio(portfolio.filter(p => p.id !== id));
    const newTargetWeights = { ...targetWeights };
    delete newTargetWeights[id];
    setTargetWeights(newTargetWeights);
  };

  const handleRecordAssets = () => {
    if (!recordDate) return;
    const existingIndex = history.findIndex(h => h.date === recordDate);
    const newRecord = { date: recordDate, totalAssets, invested: totalInvested };
    const newHistory = existingIndex >= 0 ? [...history] : [...history, newRecord];
    if (existingIndex >= 0) newHistory[existingIndex] = newRecord;
    newHistory.sort((a, b) => a.date.localeCompare(b.date));
    setHistory(newHistory);
  };

  const getProfitColor = (value) => value > 0 ? 'text-red-500' : value < 0 ? 'text-blue-500' : 'text-gray-600';

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center space-x-3">
            <Activity className="w-8 h-8 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">내 자산 포트폴리오</h1>
          </div>
          <div className="flex items-center space-x-2 bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100 shadow-sm">
            <RefreshCw className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-medium text-indigo-700">실시간 환율: 1$ = {formatCurrency(exchangeRate)}</span>
          </div>
        </header>

        {/* 대시보드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <span className="text-gray-500 text-sm font-medium mb-1 block">총 자산</span>
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
            <span className="text-gray-500 text-sm font-medium mb-1 block">총 수익률</span>
            <span className={`text-2xl font-bold ${getProfitColor(totalROI)}`}>
              {totalROI > 0 ? '+' : ''}{formatPercent(totalROI)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            
            {/* 거래 입력 폼 */}
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
                  
                  {/* 검색 결과 드롭다운 */}
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

            {/* 보유 종목 리스트 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center"><PieChart className="w-5 h-5 mr-2 text-indigo-500" /> 보유 종목 현황</h2>
                <div className="text-xs text-gray-400 font-medium text-indigo-600">실시간 데이터 갱신 중</div>
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
                    {portfolio.length === 0 ? <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400">보유 종목이 없습니다.</td></tr> : portfolio.map(stock => {
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
                          <td className="px-4 py-4 text-right">{stock.quantity}주</td>
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
                                <span className="font-semibold bg-gray-100 px-2 py-1 rounded">{isUSD ? formatUSD(currentPrice) : formatCurrency(currentPrice)}</span>
                                {isUSD && <div className="text-[11px] text-gray-400 mt-1">({formatCurrency(currentPrice * rate)})</div>}
                              </>
                            )}
                          </td>
                          <td className={`px-4 py-4 text-right font-bold ${getProfitColor(profitKRW)}`}>
                            {profitKRW > 0 ? '+' : ''}{formatCurrency(profitKRW)}
                            <span className="block text-xs font-normal">({profitKRW > 0 ? '+' : ''}{formatPercent(roi)})</span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <button onClick={() => handleRemovePortfolio(stock.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-5 h-5 mx-auto" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 리밸런싱 계산기 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center"><Scale className="w-5 h-5 mr-2 text-indigo-500" /> 리밸런싱 계산기</h2>
                <button onClick={setWeightsToCurrent} className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md">현재 비중 불러오기</button>
              </div>
              
              {portfolio.length > 0 && (
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
                      {portfolio.map(stock => {
                        const currentPrice = marketPrices[stock.id] || stock.avgPrice;
                        const rate = stock.currency === 'USD' ? exchangeRate : 1;
                        const currentValueKRW = stock.quantity * currentPrice * rate;
                        const targetWeight = targetWeights[stock.id] || 0;
                        const targetValueKRW = totalAssets * (targetWeight / 100);
                        const diffKRW = targetValueKRW - currentValueKRW;
                        const diffQty = currentPrice * rate > 0 ? diffKRW / (currentPrice * rate) : 0;
                        const roundedDiffQty = Math.round(diffQty);
                        
                        return (
                          <tr key={`rebal-${stock.id}`} className="border-b border-gray-100">
                            {/* 리밸런싱 계산기 종목명 아래에 티커(ID) 표시 */}
                            <td className="px-4 py-3 font-medium text-gray-900">
                              <div className="flex flex-col">
                                <span>{stock.name}</span>
                                <span className="text-[10px] text-gray-400 font-normal mt-0.5">
                                  {stock.id.replace('.KS', '').replace('.KQ', '')}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input type="number" className="w-20 px-2 py-1 border border-gray-200 rounded text-center focus:ring-1 focus:ring-indigo-500 outline-none" value={targetWeights[stock.id] ?? ''} onChange={(e) => handleTargetWeightChange(stock.id, e.target.value)} min="0" max="100" />
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
          </div>

          <div className="space-y-6">
            {/* 자산 기록 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center"><Calendar className="w-5 h-5 mr-2 text-indigo-500" /> 자산 기록하기</h2>
              <div className="flex gap-3">
                <input type="month" className="flex-1 px-4 py-2 border border-gray-200 rounded-lg outline-none" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
                <button onClick={handleRecordAssets} className="px-4 py-2 bg-gray-900 text-white font-medium rounded-lg">기록</button>
              </div>
            </div>

            {/* 자산 추이 차트 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px] flex flex-col">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center"><TrendingUp className="w-5 h-5 mr-2 text-indigo-500" /> 자산 등락 추이</h2>
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
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
      </div>
    </div>
  );
}