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
    const interval = setInterval(fetchExchangeRate, 60 * 60 * 1000); // 1시간마다 갱신
    return () => clearInterval(interval);
  }, []);

  // --- 2. 야후 파이낸스 종목 검색 API ---
  useEffect(() => {
    if (searchQuery.length < 2 || selectedStock?.name === searchQuery) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // 브라우저 CORS