import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, Trash2, TrendingUp, TrendingDown, Calendar, PieChart, Activity, RefreshCw, Scale, Loader2, FolderPlus, Edit3, Check, X, CreditCard, Coins } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// =========================================================================
// [설정] 1. 초즉시 반응형 로컬 인기 종목 사전 (★ 0008S0.KS 및 인기 ETF 추가 탑재)
// =========================================================================
// 야후 파이낸스 검색 서버는 한국어 띄어쓰기나 긴 상품명 검색에 매우 취약합니다.
// 이를 극복하기 위해 국내 투자자들이 가장 선호하는 핵심 배당/커버드콜 자산군을 로컬 사전에 추가했습니다.
// 이제 네트워크 상태가 불안정하거나 검색어가 길어도 무조건 0.01초 만에 즉시 매칭됩니다.
const POPULAR_STOCKS = [
  // 💡 이미지 속 주인공: 티커 중간에 S가 들어가는 고배당 타겟데일리 커버드콜 ETF
  { id: '0008S0.KS', name: 'TIGER 미국배당다우존스타겟데일리커버드콜', currency: 'KRW', exchange: 'KSC' },
  
  // 기타 초인기 국내/해외 배당 및 커버드콜 ETF 라인업
  { id: '482730.KS', name: 'TIGER 미국30년국채코액티브(H)', currency: 'KRW', exchange: 'KSC' },
  { id: '479010.KS', name: 'SOL 미국배당다우존스', currency: 'KRW', exchange: 'KSC' },
  { id: '379780.KS', name: 'KBSTAR 미국S&P500', currency: 'KRW', exchange: 'KSC' },
  { id: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF (VWO)', currency: 'USD', exchange: 'NYSE Arca' },
  { id: 'IEF', name: 'iShares 7-10 Year Treasury Bond ETF (IEF)', currency: 'USD', exchange: 'NASDAQ' },
  { id: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF (TLT)', currency: 'USD', exchange: 'NASDAQ' },
  { id: 'SPY', name: 'SPDR S&P 500 ETF Trust (SPY)', currency: 'USD', exchange: 'NYSE Arca' },
  { id: 'QQQ', name: 'Invesco QQQ Trust (QQQ)', currency: 'USD', exchange: 'NASDAQ' },
  
  // 국내 주요 대형주
  { id: '005930.KS', name: '삼성전자', currency: 'KRW', exchange: 'KSC' },
  { id: '000660.KS', name: 'SK하이닉스', currency: 'KRW', exchange: 'KSC' },
  { id: '035420.KS', name: 'NAVER', currency: 'KRW', exchange: 'KSC' },
  { id: '035720.KS', name: '카카오', currency: 'KRW', exchange: 'KSC' }
];

// =========================================================================
// [설정] 2. 기초 종목별 연간 디폴트 주당 배당금 정의 데이터베이스
// =========================================================================
// 주당 연간 배당금의 기본 가이드라인 수치입니다. (원화 종목은 원 단위, 미국 종목은 달러 단위)
// 사용자가 포트폴리오 화면에서 배당금을 직접 편집하면 이 기본값 대신 편집한 값으로 자동 변경됩니다.
const getDefaultDividend = (symbol) => {
  if (symbol.startsWith('0008S0')) return 1020; // TIGER 타겟데일리커버드콜 (월 약 85원 분배 기준 연간 약 1,020원)
  if (symbol.startsWith('005930')) return 1440; // 삼성전자
  if (symbol.startsWith('000660')) return 1200; // SK 하이닉스
  if (symbol.startsWith('479010')) return 400;  // SOL 미국배당다우존스
  if (symbol.startsWith('482730')) return 660;  // TIGER 미국30년국채코액티브
  if (symbol.startsWith('AAPL')) return 1.04;    // 애플
  if (symbol.startsWith('TSLA')) return 0;       // 테슬라
  if (symbol.startsWith('MSFT')) return 3.00;    // 마이크로소프트
  if (symbol.startsWith('NVDA')) return 0.04;    // 엔비디아
  if (symbol.startsWith('TLT')) return 4.52;     // TLT
  if (symbol.startsWith('IEF')) return 3.12;     // IEF
  if (symbol.startsWith('VWO')) return 1.45;     // VWO
  if (symbol.startsWith('SPY')) return 7.15;     // SPY
  if (symbol.startsWith('QQQ')) return 2.70;     // QQQ
  return symbol.endsWith('.KS') || symbol.endsWith('.KQ') ? 100 : 0.50; // 그 외 기타 기본값 세팅
};

// 화폐 포맷 유틸 함수 (원화 포맷팅)
const formatCurrency = (value) => {
  if (value === undefined || value === null) return '0원';
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value) + '원';
};

// 화폐 포맷 유틸 함수 (달러 포맷팅)
const formatUSD = (value) => {
  if (value === undefined || value === null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

// 수익률 포맷 유틸 함수
const formatPercent = (value) => {
  return (value * 100).toFixed(2) + '%';
};

// 스마트 CORS 우회 API 호출 함수 (이중 장애 대비 설계)
const fetchYahooAPI = async (targetUrl) => {
  const cacheBuster = `&nocache=${Date.now()}`;
  const finalUrl = targetUrl + cacheBuster;
  
  try {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(finalUrl)}`);
    if (res.ok) {
      const text = await res.text();
      return JSON.parse(text);
    }
  } catch (e) {
    console.warn('1차 초고속 프록시 지연으로 인해 2차 보안 우회 회선으로 백업 가동합니다.', e);
  }

  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(finalUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.contents) {
        return JSON.parse(data.contents);
      }
    }
  } catch (err) {
    console.error('모든 우회 서버가 응답하지 않습니다. 네트워크 확인이 필요합니다.', err);
    return null;
  }
};

export default function App() {
  // =========================================================================
  // [상태 관리] 3. 다중 계좌 시스템 - 로컬 스토리지 데이터 동기화
  // =========================================================================
  
  // 가입된 계좌 목록 정의
  const [accounts, setAccounts] = useState(() => {
    const saved = localStorage.getItem('portfolioAccounts');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'acc-default', name: '일반 주식 계좌' },
      { id: 'acc-pension', name: '연금 저축' }
    ];
  });

  // 현재 브라우저 화면에 선택되어 활성화되어 있는 계좌 ID
  const [activeAccountId, setActiveAccountId] = useState(() => {
    const saved = localStorage.getItem('portfolioActiveAccountId');
    return saved || 'acc-default';
  });

  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [editAccountNameInput, setEditAccountNameInput] = useState('');

  // 🌟 [추가 상태] 전체 앱 뷰 모드 ('portfolio': 포트폴리오&리밸런싱 | 'dividend': 배당금 분석&기록)
  const [subViewMode, setSubViewMode] = useState('portfolio');

  // 실시간 주가 및 연동 환율 저장소
  const [marketPrices, setMarketPrices] = useState({});
  const [exchangeRate, setExchangeRate] = useState(1350.00); 

  // 계좌별 포트폴리오 맵 로드
  const [portfolios, setPortfolios] = useState(() => {
    const saved = localStorage.getItem('portfoliosMap');
    if (saved) return JSON.parse(saved);

    const oldPortfolio = localStorage.getItem('portfolioData');
    if (oldPortfolio) {
      return { 'acc-default': JSON.parse(oldPortfolio) };
    }
    return {
      'acc-default': [],
      'acc-pension': []
    };
  });

  // 계좌별 자산 추이 역사기록 맵 로드
  const [histories, setHistories] = useState(() => {
    const saved = localStorage.getItem('historiesMap');
    if (saved) return JSON.parse(saved);

    const oldHistory = localStorage.getItem('portfolioHistory');
    if (oldHistory) {
      return { 'acc-default': JSON.parse(oldHistory) };
    }
    return {
      'acc-default': [],
      'acc-pension': []
    };
  });

  // 계좌별 리밸런싱 목표 비중 맵 로드
  const [targetWeightsMap, setTargetWeightsMap] = useState(() => {
    const saved = localStorage.getItem('targetWeightsMap');
    if (saved) return JSON.parse(saved);

    const oldWeights = localStorage.getItem('portfolioTargetWeights');
    if (oldWeights) {
      return { 'acc-default': JSON.parse(oldWeights) };
    }
    return {
      'acc-default': {},
      'acc-pension': {}
    };
  });

  // 🌟 [추가 상태] 계좌별 실제 배당금 수령 기록 보관용 맵 데이터베이스
  const [dividendsMap, setDividendsMap] = useState(() => {
    const saved = localStorage.getItem('dividendsMap');
    if (saved) return JSON.parse(saved);
    return {
      'acc-default': [],
      'acc-pension': []
    };
  });

  // 인라인 주당 배당금 편집 임시 상태값
  const [editingDividendId, setEditingDividendId] = useState(null);
  const [editingDividendValue, setEditingDividendValue] = useState('');

  // 배당금 수령 기록 입력 폼 전용 상태값
  const [dividendInputStockId, setDividendInputStockId] = useState('');
  const [dividendInputAmount, setDividendInputAmount] = useState('');
  const [dividendInputDate, setDividendInputDate] = useState(new Date().toISOString().slice(0, 10)); // 기본값 오늘 날짜

  // 화면 검색 및 거래 입력 폼 전용 상태값들
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

  // =========================================================================
  // [동기화] 4. 상태 변화 감지 및 브라우저 로컬 저장 자동 처리
  // =========================================================================
  useEffect(() => {
    localStorage.setItem('portfolioAccounts', JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem('portfolioActiveAccountId', activeAccountId);
  }, [activeAccountId]);

  useEffect(() => {
    localStorage.setItem('portfoliosMap', JSON.stringify(portfolios));
  }, [portfolios]);

  useEffect(() => {
    localStorage.setItem('historiesMap', JSON.stringify(histories));
  }, [histories]);

  useEffect(() => {
    localStorage.setItem('targetWeightsMap', JSON.stringify(targetWeightsMap));
  }, [targetWeightsMap]);

  useEffect(() => {
    localStorage.setItem('dividendsMap', JSON.stringify(dividendsMap));
  }, [dividendsMap]);

  // =========================================================================
  // [네트워크] 5. 실시간 달러 기준가(환율) 동기화 호출
  // =========================================================================
  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await response.json();
        if (data && data.rates && data.rates.KRW) {
          setExchangeRate(data.rates.KRW);
        }
      } catch (error) {
        console.error('실시간 환율 가져오기 실패:', error);
      }
    };
    fetchExchangeRate();
    const interval = setInterval(fetchExchangeRate, 60 * 60 * 1000); 
    return () => clearInterval(interval);
  }, []);

  // =========================================================================
  // [검색 엔진] 6. 다중 키워드 스마트 서치 및 로컬 매칭 통합
  // =========================================================================
  useEffect(() => {
    if (searchQuery.length < 1 || selectedStock?.name === searchQuery) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const queryKeywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);

        const localFiltered = POPULAR_STOCKS.filter(stock => {
          return queryKeywords.every(kw => 
            stock.name.toLowerCase().includes(kw) || 
            stock.id.toLowerCase().includes(kw)
          );
        });
        
        setSearchResults(localFiltered);

        const targetUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchQuery)}&quotesCount=10&newsCount=0`;
        const data = await fetchYahooAPI(targetUrl);
        
        if (data && data.quotes) {
          const apiQuotes = data.quotes
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
          
          setSearchResults(prev => {
            const combined = [...prev];
            apiQuotes.forEach(apiStock => {
              const isAlreadyExist = combined.some(s => s.id === apiStock.id);
              if (!isAlreadyExist) {
                combined.push(apiStock);
              }
            });
            return combined;
          });
        }
      } catch (err) {
        console.error('글로벌 종목 시세 검색 실패:', err);
      } finally {
        setIsSearching(false);
      }
    }, 150); 

    return () => clearTimeout(timer);
  }, [searchQuery, selectedStock]);

  // =========================================================================
  // [시세 감시] 7. 등록된 자산들의 실시간 현재가 초경량 모니터링 (Spark API 가동)
  // =========================================================================
  const allPortfolioSymbols = useMemo(() => {
    const symbols = new Set();
    Object.values(portfolios).forEach(port => {
      port.forEach(item => symbols.add(item.id));
    });
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
            if (price) {
              newPrices[item.symbol] = price;
            }
          });
        }
      } catch(e) {
        console.warn('Spark API 시도 실패, 예비 백업 차트 라인 가동...');
      }

      const missingSymbols = allPortfolioSymbols.filter(sym => !newPrices[sym]);
      if (missingSymbols.length > 0) {
        await Promise.all(missingSymbols.map(async (sym) => {
          try {
            const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`;
            const chartData = await fetchYahooAPI(chartUrl);
            const price = chartData?.chart?.result?.[0]?.meta?.regularMarketPrice;
            if (price) newPrices[sym] = price;
          } catch(err) {
            console.error(`${sym} 현재 시세 로딩 최종 포기`, err);
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
  }, [allPortfolioSymbols]);

  // =========================================================================
  // [수학 연산] 8. 다중 계좌 데이터 처리 및 종합(합산) 계좌 가중치 연산
  // =========================================================================
  
  // 현재 활성화되어 보고 있는 계좌의 주식 포트폴리오 목록 가공
  const currentPortfolio = useMemo(() => {
    if (activeAccountId === 'all') {
      const combined = {};
      Object.values(portfolios).forEach(port => {
        port.forEach(item => {
          if (combined[item.id]) {
            const existing = combined[item.id];
            const newQty = existing.quantity + item.quantity;
            const newCost = (existing.quantity * existing.avgPrice) + (item.quantity * item.avgPrice);
            combined[item.id] = {
              ...existing,
              quantity: newQty,
              avgPrice: newCost / newQty,
              // 배당금도 기존 선언 수치가 있다면 이를 마이그레이션 및 동기화합니다.
              dividendPerShare: item.dividendPerShare !== undefined ? item.dividendPerShare : existing.dividendPerShare
            };
          } else {
            combined[item.id] = { ...item };
          }
        });
      });
      return Object.values(combined);
    }
    return portfolios[activeAccountId] || [];
  }, [portfolios, activeAccountId]);

  // 현재 활성화된 계좌 혹은 전체 종합의 역사 자산 추이 합산 가공
  const currentHistory = useMemo(() => {
    if (activeAccountId === 'all') {
      const dateMap = {};
      Object.values(histories).forEach(histList => {
        histList.forEach(h => {
          if (dateMap[h.date]) {
            dateMap[h.date].totalAssets += h.totalAssets;
            dateMap[h.date].invested += h.invested;
          } else {
            dateMap[h.date] = { date: h.date, totalAssets: h.totalAssets, invested: h.invested };
          }
        });
      });
      return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
    }
    return histories[activeAccountId] || [];
  }, [histories, activeAccountId]);

  // 타깃 계좌의 목표 리밸런싱 비중 목록
  const currentTargetWeights = useMemo(() => {
    if (activeAccountId === 'all') return {};
    return targetWeightsMap[activeAccountId] || {};
  }, [targetWeightsMap, activeAccountId]);

  // 🌟 [추가 연산] 현재 활성화된 계좌의 실제 배당 수령 기록 추출
  const currentDividends = useMemo(() => {
    if (activeAccountId === 'all') {
      const combined = [];
      Object.entries(dividendsMap).forEach(([accId, divList]) => {
        const accName = accounts.find(a => a.id === accId)?.name || '기타 계좌';
        divList.forEach(d => {
          combined.push({ ...d, accName });
        });
      });
      return combined.sort((a, b) => b.date.localeCompare(a.date));
    }
    return dividendsMap[activeAccountId] || [];
  }, [dividendsMap, activeAccountId, accounts]);

  // 🌟 [추가 연산] 예상 연간 배당 현황 통계 연산
  const dividendSummary = useMemo(() => {
    let estAnnualDividendKRW = 0;
    
    currentPortfolio.forEach(item => {
      // 인라인으로 입력된 배당금 우선 사용, 없으면 디폴트 사전 DB값으로 백업 계산
      const divPerShare = item.dividendPerShare !== undefined ? item.dividendPerShare : getDefaultDividend(item.id);
      const rate = item.currency === 'USD' ? exchangeRate : 1;
      estAnnualDividendKRW += (item.quantity * divPerShare * rate);
    });

    const netAnnualDividendKRW = estAnnualDividendKRW * 0.846; // 금융소득 원천징수 일반세율인 15.4%를 공제한 세후 금액
    const monthlyAverageDividendKRW = estAnnualDividendKRW / 12;
    const portfolioYield = totalAssets > 0 ? (estAnnualDividendKRW / totalAssets) : 0;

    return {
      grossAnnual: estAnnualDividendKRW,
      netAnnual: netAnnualDividendKRW,
      monthlyAverage: monthlyAverageDividendKRW,
      portfolioYield: portfolioYield
    };
  }, [currentPortfolio, marketPrices, exchangeRate, totalAssets]);

  // 🌟 [추가 연산] 월별 배당금 수령 통계 데이터 포맷팅 (차트용)
  const monthlyReceivedChartData = useMemo(() => {
    const monthlyMap = {};
    
    currentDividends.forEach(d => {
      // YYYY-MM-DD 형식을 YYYY-MM 형식으로 추출하여 취합
      const monthStr = d.date.slice(0, 7);
      const amountKRW = d.amount; // 수령액은 원화 기준 적립
      monthlyMap[monthStr] = (monthlyMap[monthStr] || 0) + amountKRW;
    });

    return Object.entries(monthlyMap)
      .map(([month, amount]) => ({ month, '수령 배당금': amount }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12); // 최근 최대 12개월 분량만 그래프에 출력
  }, [currentDividends]);

  // 자산 현황 요약용 (원금, 평가액, 손익액 계산)
  const { totalInvested, totalAssets, totalProfit } = useMemo(() => {
    let invested = 0;
    let assets = 0;
    
    currentPortfolio.forEach(item => {
      const currentPrice = marketPrices[item.id] || item.avgPrice;
      const rate = item.currency === 'USD' ? exchangeRate : 1;
      
      invested += (item.quantity * item.avgPrice * rate);
      assets += (item.quantity * currentPrice * rate);
    });
    return { totalInvested: invested, totalAssets: assets, totalProfit: assets - invested };
  }, [currentPortfolio, marketPrices, exchangeRate]);

  const totalROI = totalInvested > 0 ? totalProfit / totalInvested : 0;

  // 리밸런싱 세팅 연산
  const setWeightsToCurrent = () => {
    if (activeAccountId === 'all') return;
    const newWeights = {};
    currentPortfolio.forEach(item => {
      const currentPrice = marketPrices[item.id] || item.avgPrice;
      const rate = item.currency === 'USD' ? exchangeRate : 1;
      const currentValueKRW = item.quantity * currentPrice * rate;
      newWeights[item.id] = totalAssets > 0 ? Number(((currentValueKRW / totalAssets) * 100).toFixed(1)) : 0;
    });
    
    setTargetWeightsMap(prev => ({
      ...prev,
      [activeAccountId]: newWeights
    }));
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
      return {
        ...prev,
        [activeAccountId]: {
          ...activeWeights,
          [id]: Number(value)
        }
      };
    });
  };

  const totalTargetWeight = currentPortfolio.reduce((acc, stock) => acc + (currentTargetWeights[stock.id] || 0), 0);

  // =========================================================================
  // [계좌 제어] 9. 동적 계좌 추가, 수정, 삭제 제어 핸들러
  // =========================================================================
  const handleAddAccount = () => {
    const name = prompt('새로운 투자 주머니(계좌)의 이름을 지어주세요 (예: 개인연금 IRP, ISA 계좌):');
    if (!name || name.trim() === '') return;
    
    const newId = `acc-${Date.now()}`;
    const newAccount = { id: newId, name: name.trim() };
    
    setAccounts([...accounts, newAccount]);
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
      alert('더 이상 삭제할 수 없습니다. 최소 1개의 독립 계좌는 유지되어야 합니다.');
      return;
    }

    const confirmDelete = window.confirm(`⚠️ 경고!\n"${accounts.find(a => a.id === activeAccountId)?.name}" 계좌와 그 안의 포트폴리오, 손익 기록이 전부 파괴됩니다. 정말 지우시겠습니까?`);
    if (!confirmDelete) return;

    const remainingAccounts = accounts.filter(a => a.id !== activeAccountId);
    const nextActiveId = remainingAccounts[0].id;

    setAccounts(remainingAccounts);
    setActiveAccountId(nextActiveId);

    setPortfolios(prev => {
      const copy = { ...prev };
      delete copy[activeAccountId];
      return copy;
    });
    setHistories(prev => {
      const copy = { ...prev };
      delete copy[activeAccountId];
      return copy;
    });
    setTargetWeightsMap(prev => {
      const copy = { ...prev };
      delete copy[activeAccountId];
      return copy;
    });
    setDividendsMap(prev => {
      const copy = { ...prev };
      delete copy[activeAccountId];
      return copy;
    });
  };

  // =========================================================================
  // [거래 및 배당 관리] 10. 주식 매매 및 배당금 처리 핵심 함수들
  // =========================================================================
  
  // 🌟 [배당금 인라인 수정 기능] 주당 배당금(연간) 데이터를 즉각 반영합니다.
  const handleEditDividendClick = (stock) => {
    if (activeAccountId === 'all') return;
    setEditingDividendId(stock.id);
    setEditingDividendValue(
      (stock.dividendPerShare !== undefined ? stock.dividendPerShare : getDefaultDividend(stock.id)).toString()
    );
  };

  const handleSaveDividendRate = (stockId) => {
    if (activeAccountId === 'all') return;
    const value = parseFloat(editingDividendValue);
    if (isNaN(value) || value < 0) {
      alert('배당금 수치는 0 이상의 양수만 입력할 수 있습니다.');
      return;
    }

    const updated = portfolios[activeAccountId].map(item => {
      if (item.id === stockId) {
        return { ...item, dividendPerShare: value };
      }
      return item;
    });

    setPortfolios(prev => ({
      ...prev,
      [activeAccountId]: updated
    }));
    setEditingDividendId(null);
  };

  // 🌟 [배당금 수령 기록 추가 기능]
  const handleAddReceivedDividend = () => {
    if (activeAccountId === 'all') {
      alert('종합 요약 화면에서는 직접 배당 수령 내역을 기록할 수 없습니다. 개별 계좌 중 하나를 선택해 주세요!');
      return;
    }
    if (!dividendInputStockId || !dividendInputAmount || !dividendInputDate) {
      alert('종목, 금액 및 수령 날짜를 모두 충실히 기입해 주셔야 합니다.');
      return;
    }

    const amount = parseFloat(dividendInputAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('배당 수령액은 0보다 큰 수치여야 합니다.');
      return;
    }

    const matchedStock = currentPortfolio.find(p => p.id === dividendInputStockId);
    if (!matchedStock) return;

    // 수령 배당금이 USD일 경우, 현재 고정 환율을 기준 삼아 원화(KRW)로 정밀 변환해 기록합니다.
    const isUSD = matchedStock.currency === 'USD';
    const finalAmountKRW = isUSD ? amount * exchangeRate : amount;

    const newRecord = {
      id: `div-${Date.now()}`,
      stockId: matchedStock.id,
      stockName: matchedStock.name,
      date: dividendInputDate,
      amount: finalAmountKRW, // 원화 합산 기준액
      displayAmount: amount,  // 원화 혹은 USD 원본 기준액
      currency: matchedStock.currency
    };

    setDividendsMap(prev => {
      const activeList = prev[activeAccountId] || [];
      return {
        ...prev,
        [activeAccountId]: [newRecord, ...activeList]
      };
    });

    // 폼 입력 초기화
    setDividendInputAmount('');
  };

  // 🌟 [배당금 수령 기록 삭제 기능]
  const handleRemoveReceivedDividend = (recordId, accId = activeAccountId) => {
    const targetKey = activeAccountId === 'all' ? accId : activeAccountId;
    const confirmDelete = window.confirm('해당 배당 수령 기록을 정말로 영구 소멸시키겠습니까?');
    if (!confirmDelete) return;

    setDividendsMap(prev => {
      const activeList = prev[targetKey] || [];
      return {
        ...prev,
        [targetKey]: activeList.filter(d => d.id !== recordId)
      };
    });
  };

  // 종목 선택 핸들러
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
      console.error('실시간 매수 단가 즉시 연동에 실패했습니다.', e);
    }
  };

  const handleAddPortfolio = () => {
    if (activeAccountId === 'all') {
      alert('종합 요약 화면에서는 직접 종목을 매매할 수 없습니다. 위의 개별 계좌 중 하나를 활성화하고 거래를 진행해 주세요!');
      return;
    }
    if (!selectedStock || !inputQuantity || !inputAvgPrice) return;
    const qty = parseFloat(inputQuantity);
    const avg = parseFloat(inputAvgPrice);
    
    if (qty <= 0 || avg <= 0) {
      alert("거래 수량과 가격은 반드시 0보다 커야 합니다.");
      return;
    }

    const activePort = portfolios[activeAccountId] || [];
    const existingIndex = activePort.findIndex(p => p.id === selectedStock.id);
    let updatedPort = [...activePort];
    
    if (transactionType === 'buy') {
      if (existingIndex >= 0) {
        const existing = activePort[existingIndex];
        const totalCost = (existing.quantity * existing.avgPrice) + (qty * avg);
        const newQuantity = existing.quantity + qty;
        updatedPort[existingIndex] = { ...existing, quantity: newQuantity, avgPrice: totalCost / newQuantity };
      } else {
        updatedPort.push({ id: selectedStock.id, name: selectedStock.name, quantity: qty, avgPrice: avg, currency: selectedStock.currency });
      }
    } else {
      if (existingIndex >= 0) {
        const existing = activePort[existingIndex];
        if (existing.quantity < qty) {
          alert("현재 보유량보다 많은 주식을 매도해 처분할 수 없습니다."); return;
        }
        const newQuantity = existing.quantity - qty;
        if (newQuantity === 0) {
          updatedPort.splice(existingIndex, 1);
          const activeWeights = { ...(targetWeightsMap[activeAccountId] || {}) };
          delete activeWeights[existing.id];
          setTargetWeightsMap(prev => ({ ...prev, [activeAccountId]: activeWeights }));
        } else {
          updatedPort[existingIndex] = { ...existing, quantity: newQuantity };
        }
      } else {
        alert("이 주머니에는 매도할 수 있는 보유 수량이 없습니다."); return;
      }
    }

    setPortfolios(prev => ({ ...prev, [activeAccountId]: updatedPort }));
    setSelectedStock(null); setSearchQuery(''); setInputQuantity(''); setInputAvgPrice('');
  };

  const handleRemovePortfolio = (id) => {
    if (activeAccountId === 'all') {
      alert('종합 화면에서는 임의 삭제가 차단됩니다. 해당 종목을 보유한 계좌로 이동해서 제거해 주세요.');
      return;
    }
    const activePort = portfolios[activeAccountId] || [];
    setPortfolios(prev => ({
      ...prev,
      [activeAccountId]: activePort.filter(p => p.id !== id)
    }));

    const activeWeights = { ...(targetWeightsMap[activeAccountId] || {}) };
    delete activeWeights[id];
    setTargetWeightsMap(prev => ({
      ...prev,
      [activeAccountId]: activeWeights
    }));
  };

  // 매월 축적식 자산 등락 상황 저장 핸들러
  const handleRecordAssets = () => {
    if (activeAccountId === 'all') {
      alert('종합 탭에서는 임의로 합계 데이터를 주입할 수 없습니다. 개별 주머니 계좌에서 각각 기록을 등록해 주시면, 종합 그래프가 알아서 통합 자산을 도출해냅니다.');
      return;
    }
    if (!recordDate) return;
    const activeHist = histories[activeAccountId] || [];
    const existingIndex = activeHist.findIndex(h => h.date === recordDate);
    const newRecord = { date: recordDate, totalAssets, invested: totalInvested };
    
    let updatedHist = [...activeHist];
    if (existingIndex >= 0) {
      updatedHist[existingIndex] = newRecord;
    } else {
      updatedHist.push(newRecord);
    }
    updatedHist.sort((a, b) => a.date.localeCompare(b.date));
    
    setHistories(prev => ({ ...prev, [activeAccountId]: updatedHist }));
  };

  // 등락 컬러 조건문
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
            
            {/* 계좌 이동 리스트 */}
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

            {/* 계좌 이름 편집 및 영구 제거 컨트롤 */}
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
                      onClick={DeleteAccount}
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

        {/* 🌟 서브 뷰 탐색 메뉴 (포트폴리오 vs 배당 분석 탭 전환) */}
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

        {/* ==========================================================
            [서브 뷰: 1] 포트폴리오 & 리밸런싱 메뉴
            ========================================================== */}
        {subViewMode === 'portfolio' && (
          <>
            {/* 종합 평가 대시보드 리포트 */}
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
                
                {/* 거래 입력 인터페이스 */}
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
                              const currentPrice = marketPrices[stock.id] || stock.avgPrice;
                              const rate = stock.currency === 'USD' ? exchangeRate : 1;
                              const currentValueKRW = stock.quantity * currentPrice * rate;
                              const targetWeight = currentTargetWeights[stock.id] || 0;
                              const targetValueKRW = totalAssets * (targetWeight / 100);
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
                {/* 자산 수동 기록 아카이브 */}
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
                      💡 종합 자산 보기 상태입니다. 실제 배당금을 수령하여 장부에 기입하시려면 상단에서 <strong>개별 계좌</strong>를 선택해 주세요.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                      <Plus className="w-5 h-5 mr-2 text-indigo-500" /> 실제 배당 수령 기록 추가
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
                                <td className="px-4 py-4 font-medium text-gray-900">{div.stockName}</td>
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
    </div>
  );
}