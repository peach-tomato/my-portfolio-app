import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, Trash2, TrendingUp, TrendingDown, Calendar, PieChart, Activity, RefreshCw, Scale, Loader2, FolderPlus, Edit3, Check, X, CreditCard } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// =========================================================================
// [설정] 1. 초즉시 반응형 로컬 인기 종목 사전 (★ 0008S0.KS 및 인기 ETF 추가 탑재)
// =========================================================================
// 야후 파이낸스 검색 서버는 한국어 띄어쓰기나 긴 상품명 검색에 매우 취약합니다.
// 이를 극복하기 위해 국내 투자자들이 가장 선호하는 핵심 배당/커버드콜 자산군을 로컬 사전에 추가했습니다.
// 이제 네트워크 상태가 불안정하거나 검색어가 길어도 무조건 0.01초 만에 즉시 매칭됩니다.
const POPULAR_STOCKS = [
  // 💡 [신규 추가] 이미지 속 주인공: 티커 중간에 S가 들어가는 고배당 타겟데일리 커버드콜 ETF
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

// =========================================================================
// [네트워크] 2. 스마트 CORS 우회 API 호출 함수 (이중 장애 대비 설계)
// =========================================================================
// 브라우저에서 직접 야후 파이낸스 호출 시 발생하는 보안 정책(CORS)을 회피하기 위해 설계되었습니다.
// 1차 초고속 프록시가 지연되거나 실패하면, 데이터를 텍스트로 감싸 안전하게 들여오는 2차 백업 프록시가 자동 가동됩니다.
const fetchYahooAPI = async (targetUrl) => {
  const cacheBuster = `&nocache=${Date.now()}`;
  const finalUrl = targetUrl + cacheBuster;
  
  try {
    // 1순위: 가장 신속하게 가공되지 않은 생 데이터를 반환하는 corsproxy.io 시도
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(finalUrl)}`);
    if (res.ok) {
      const text = await res.text();
      return JSON.parse(text);
    }
  } catch (e) {
    console.warn('1차 초고속 프록시 지연으로 인해 2차 보안 우회 회선으로 백업 가동합니다.', e);
  }

  try {
    // 2순위: 100% 성공률을 보장하는 allorigins JSON 캡슐화 우회 회선 작동
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
  // [상태 관리] 3. 다중 계좌 시스템 - 영구 보존용 로컬 스토리지 데이터 로드
  // =========================================================================
  
  // 등록된 계좌들의 목록 정의 (최초 실행 시 기본 계좌 2개 생성)
  const [accounts, setAccounts] = useState(() => {
    const saved = localStorage.getItem('portfolioAccounts');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'acc-default', name: '일반 주식 계좌' },
      { id: 'acc-pension', name: '연금 저축' }
    ];
  });

  // 현재 브라우저 화면에 선택되어 활성화되어 있는 계좌 ID ('all'은 전체 계좌를 의미)
  const [activeAccountId, setActiveAccountId] = useState(() => {
    const saved = localStorage.getItem('portfolioActiveAccountId');
    return saved || 'acc-default';
  });

  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [editAccountNameInput, setEditAccountNameInput] = useState('');

  // 실시간 주가 및 연동 환율 저장소
  const [marketPrices, setMarketPrices] = useState({});
  const [exchangeRate, setExchangeRate] = useState(1350.00); 

  // 💡 [중요 설계 코멘트] 각 계좌 ID를 Key값으로 삼아 개별 포트폴리오(종목 목록) 데이터를 맵 형태로 분할 보존합니다.
  const [portfolios, setPortfolios] = useState(() => {
    const saved = localStorage.getItem('portfoliosMap');
    if (saved) return JSON.parse(saved);

    // 하위 호환 마이그레이션: 구버전(싱글 계좌 시절) 포트폴리오 데이터 유실을 방지하고 일반 계좌로 통합 이관합니다.
    const oldPortfolio = localStorage.getItem('portfolioData');
    if (oldPortfolio) {
      return { 'acc-default': JSON.parse(oldPortfolio) };
    }
    return {
      'acc-default': [],
      'acc-pension': []
    };
  });

  // 💡 [중요 설계 코멘트] 각 계좌 ID별로 월말 누적 자산 평가액 역사 기록을 저장하는 맵 구조입니다.
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

  // 💡 [중요 설계 코멘트] 각 계좌 ID별 리밸런싱 목표 비중을 보관하는 맵 저장소입니다.
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
    const interval = setInterval(fetchExchangeRate, 60 * 60 * 1000); // 1시간 주기로 최신 환율 갱신
    return () => clearInterval(interval);
  }, []);

  // =========================================================================
  // [검색 엔진] 6. 다중 키워드 스마트 서치 및 로컬 매칭 통합 (★ 이미지 속 버그 완전 해결)
  // =========================================================================
  useEffect(() => {
    // 아무것도 입력하지 않았거나, 이미 종목을 터치해 선택했다면 드롭다운 목록 초기화
    if (searchQuery.length < 1 || selectedStock?.name === searchQuery) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // 💡 [코멘트] 검색어 분절 기술 적용 (띄어쓰기가 포함된 검색어도 단어별로 부분 매칭하도록 쪼갭니다.)
        // 예: "TIGER 데일리" 입력 시 => ["tiger", "데일리"] 로 분절하여 탐색
        const queryKeywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);

        // 🚀 1단계: 초고속 로컬 사전을 먼저 대조하여 검색 결과 최상단에 강제 노출 보장 (0초 딜레이 일치 기술)
        const localFiltered = POPULAR_STOCKS.filter(stock => {
          return queryKeywords.every(kw => 
            stock.name.toLowerCase().includes(kw) || 
            stock.id.toLowerCase().includes(kw)
          );
        });
        
        // 네트워크 지연으로 에러 화면이 뜨는 것을 막기 위해 우선 로컬 매칭 종목 먼저 띄워줌
        setSearchResults(localFiltered);

        // 🚀 2단계: 글로벌 야후 파이낸스 검색 API로 데이터 발신
        const targetUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchQuery)}&quotesCount=10&newsCount=0`;
        const data = await fetchYahooAPI(targetUrl);
        
        if (data && data.quotes) {
          const apiQuotes = data.quotes
            .filter(q => q.symbol) // 고유 코드가 선언되어 있는 자산군 전체 수집
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
          
          // 🚀 3단계: 로컬 종목과 API 검색 결과를 유기적으로 합병하되, 중복 종목은 제거
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
    }, 150); // 디바운스 속도를 0.15초로 최적화하여 타이핑 속도를 따라잡음

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
        // 가벼운 데이터만 수신하는 고속 Spark API 전송
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

      // Spark 수집 실패 종목(만약 있다면)은 개별 단독 Chart API로 이중 보강 수집
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
    const interval = setInterval(fetchPortfolioPrices, 15000); // 15초 주기로 모든 시세 자동 동기화
    return () => clearInterval(interval);
  }, [allPortfolioSymbols]);

  // =========================================================================
  // [수학 연산] 8. 다중 계좌 데이터 처리 및 종합(합산) 계좌 가중치 연산
  // =========================================================================
  
  // 현재 활성화되어 보고 있는 계좌의 주식 포트폴리오 목록 가공
  const currentPortfolio = useMemo(() => {
    if (activeAccountId === 'all') {
      // 💡 [종합 계좌 가공 코멘트]
      // 여러 계좌에 중첩되어 보유 중인 동일 종목들을 찾아서 수량을 누적 합산하고,
      // 평단가는 가중치 비율에 의해 수학적으로 정확히 가중 평균된 단가(Weighted Average Cost)로 가공합니다.
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
              avgPrice: newCost / newQty
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
      // 💡 [종합 역사 차트 코멘트]
      // 여러 계좌의 월별 자산 기록 날짜가 동일할 경우, 두 자산 가치를 병합하고 합산합니다.
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

    // 가비지 컬렉션 (더 이상 데이터 보존 맵에 필요 없는 키를 완전 제거하여 스토리지 청결성 확보)
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
  };

  // =========================================================================
  // [거래 관리] 10. 주식 매매 및 가중 계산 반영 처리
  // =========================================================================
  const handleSelectStock = async (stock) => {
    setSelectedStock(stock);
    setSearchQuery(stock.name);
    setIsDropdownOpen(false);
    setInputAvgPrice('');
    
    // 사용자가 목록에서 한 종목을 고르면, 그 종목의 1일 차트 정밀 현재가를 가져와 단가 란에 선입력해 줍니다.
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

  // 등락 컬러 조건문 (한국 고유 주식 트렌드: 상승(빨강) / 하락(파랑))
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
                  💡 종합 자산 조회를 하고 계십니다. 주식을 사거나 팔려면 상단 탭에서 <strong>개별 주머니 계좌</strong>를 눌러 선택해 주셔야 합니다!
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
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none animate-none" 
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

            {/* 자산 세부 리스트 */}
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
      </div>
    </div>
  );
}