import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Clock, MapPin, User, Trash2, Plus, AlertTriangle, Building, Coffee, Calendar, ArrowUp, ArrowDown, Printer, Upload, Download, X, Check, Share2, Link as LinkIcon, Copy } from 'lucide-react';

// --- 定数データ定義 ---

const LECTURERS = [
  { id: 'pres', name: '社長', role: '講義', department: '' },
  { id: 'ichiyama', name: '市山 取締役', role: '講義', department: '経営企画' },
  { id: 'inaka', name: '伊中 取締役', role: '講義', department: '安全環境部' },
  { id: 'nishioka', name: '西岡 部長', role: '講義', department: '都市創造セクション' },
  { id: 'kato', name: '加藤 部長', role: '講義', department: 'ソリューション事業部' },
  { id: 'shirai', name: '白井 部長', role: '講義', department: 'インフラクリエイト事業部' },
  { id: 'ishikawa', name: '石川 部長', role: '講義', department: '経理部' },
  { id: 'shimizu', name: '清水 室長', role: '講義', department: '業務推進室' },
  { id: 'miyazawa', name: '宮澤 局長', role: '講義', department: '' },
  { id: 'onoda', name: '小野田 部長', role: '講義', department: '不動産部' },
];

const SPECIAL_PROGRAMS = [
  { id: 'group_tour', name: 'グループ見学（半田・常滑エリア）', duration: 180, type: 'tour' }, 
];

const LOCATIONS = [
  '役員会議室',
  'ミーティングルームA',
  '大会議室',
  '外部（見学）'
];

const BREAK_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const PIXELS_PER_MINUTE = 1.8; 
const START_LIMIT = 8 * 60; // 08:00
const END_LIMIT = 18 * 60; // 18:00 (以前は17:00だったが表示領域を確保)
const CRITICAL_LIMIT = 17 * 60; // 17:00警告用

// --- ヘルパー関数 ---

const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const getDayOfWeek = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const days = ['(日)', '(月)', '(火)', '(水)', '(木)', '(金)', '(土)'];
  return days[date.getDay()];
};

const getRelativePosition = (timeStr) => {
  const mins = timeToMinutes(timeStr);
  return Math.max(0, mins - START_LIMIT) * PIXELS_PER_MINUTE;
};

// URL共有用のエンコード/デコード関数
const encodeScheduleToUrl = (scheduleData) => {
  try {
    const jsonStr = JSON.stringify(scheduleData);
    return btoa(unescape(encodeURIComponent(jsonStr)));
  } catch (e) {
    console.error("Encoding error:", e);
    return "";
  }
};

const decodeScheduleFromUrl = (encodedData) => {
  try {
    const rawData = JSON.parse(atob(decodeURIComponent(encodedData)));
    // 下位互換性とデータ正規化のための処理
    return rawData.map(day => ({
      ...day,
      // 15分単位に丸める処理を追加してノイズを排除
      startTime: day.startTime || '09:00',
      items: (day.items || []).map(item => ({
        ...item,
        duration: Math.max(1, parseInt(item.duration, 10) || 0)
      }))
    }));
  } catch (e) {
    console.error('Failed to decode schedule from URL', e);
    return null;
  }
};

export default function App() {
  const fileInputRef = useRef(null);
  
  // --- 1. 状態管理 (Hooks) ---
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  
  const initialDays = [1, 2, 3].map((dayNum) => ({
    day: dayNum,
    date: '', 
    startTime: '09:00',
    items: [] 
  }));
  const [schedule, setSchedule] = useState(initialDays);
  
  const [draggedItem, setDraggedItem] = useState(null); // { dayIndex, itemIndex }
  const [dragOverDay, setDragOverDay] = useState(null); // dayIndex
  const [dragOverItem, setDragOverItem] = useState(null); // { dayIndex, itemIndex }
  const [resizingItem, setResizingItem] = useState(null); // { dayIndex, itemIndex, startY, startDuration }

  // --- 2. 副作用・メモ (Hooks) ---
  
  // URLパラメータからの初期ロード
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dataParam = params.get('data');
    if (dataParam) {
      const loadedData = decodeScheduleFromUrl(dataParam);
      if (loadedData && Array.isArray(loadedData)) {
        setSchedule(loadedData);
        setIsPreviewMode(true);
      }
    }
  }, []);

  // 使用済み講師の特定
  const usedLecturerIds = useMemo(() => {
    const used = new Set();
    schedule.forEach(day => {
      day.items.forEach(item => {
        if (item.type === 'lecture' && item.lecturerId) {
          used.add(item.lecturerId);
        }
      });
    });
    return used;
  }, [schedule]);

  // リサイズ操作のグローバルイベント
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!resizingItem) return;
      const deltaY = e.clientY - resizingItem.startY;
      const deltaMins = Math.round(deltaY / PIXELS_PER_MINUTE / 5) * 5;
      const newDuration = Math.max(5, resizingItem.startDuration + deltaMins);
      const newSchedule = [...schedule];
      if (newSchedule[resizingItem.dayIndex].items[resizingItem.itemIndex].duration !== newDuration) {
        newSchedule[resizingItem.dayIndex].items[resizingItem.itemIndex].duration = newDuration;
        setSchedule(newSchedule);
      }
    };
    const handleMouseUp = () => setResizingItem(null);
    if (resizingItem) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingItem, schedule]);

  // --- 3. 操作ハンドラー ---

  const handleStartTimeChange = (dayIndex, newTime) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].startTime = newTime;
    setSchedule(newSchedule);
  };

  const handleDateChange = (dayIndex, newDate) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].date = newDate;
    setSchedule(newSchedule);
  };

  const addItem = (dayIndex, type, duration = 90) => {
    const newSchedule = [...schedule];
    const newItem = {
      id: Date.now().toString() + Math.random().toString(),
      type: type, 
      title: type === 'custom' ? '新規項目' : '',
      lecturerId: type === 'lecture' ? '' : '',
      location: type === 'tour' ? '外部（見学）' : LOCATIONS[0],
      duration: duration,
      tourId: type === 'tour' ? SPECIAL_PROGRAMS[0].id : ''
    };
    if (type === 'lecture') {
      const available = LECTURERS.find(l => !usedLecturerIds.has(l.id));
      newItem.lecturerId = available ? available.id : LECTURERS[0].id;
    }
    newSchedule[dayIndex].items.push(newItem);
    setSchedule(newSchedule);
  };

  const removeItem = (dayIndex, itemIndex) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].items.splice(itemIndex, 1);
    setSchedule(newSchedule);
  };

  const updateItem = (dayIndex, itemIndex, field, value) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].items[itemIndex][field] = value;
    if (field === 'duration') {
       newSchedule[dayIndex].items[itemIndex][field] = Math.max(1, parseInt(value, 10) || 0);
    }
    setSchedule(newSchedule);
  };

  const handleDragStart = (e, dayIndex, itemIndex) => {
    setDraggedItem({ dayIndex, itemIndex });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, dayIndex, itemIndex = null) => {
    e.preventDefault();
    setDragOverDay(dayIndex);
    setDragOverItem(itemIndex !== null ? { dayIndex, itemIndex } : null);
  };

  const handleDrop = (e, dayIndex, targetItemIndex = null) => {
    e.preventDefault();
    if (!draggedItem) return;
    const newSchedule = [...schedule];
    const sourceDayItems = [...newSchedule[draggedItem.dayIndex].items];
    const itemToMove = sourceDayItems.splice(draggedItem.itemIndex, 1)[0];
    if (draggedItem.dayIndex === dayIndex) {
      const actualTargetIndex = targetItemIndex === null ? sourceDayItems.length : targetItemIndex;
      sourceDayItems.splice(actualTargetIndex, 0, itemToMove);
      newSchedule[dayIndex].items = sourceDayItems;
    } else {
      newSchedule[draggedItem.dayIndex].items = sourceDayItems;
      const targetDayItems = [...newSchedule[dayIndex].items];
      const actualTargetIndex = targetItemIndex === null ? targetDayItems.length : targetItemIndex;
      targetDayItems.splice(actualTargetIndex, 0, itemToMove);
      newSchedule[dayIndex].items = targetDayItems;
    }
    setSchedule(newSchedule);
    setDraggedItem(null);
    setDragOverDay(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverDay(null);
    setDragOverItem(null);
  };

  const handleResizeStart = (e, dayIndex, itemIndex, currentDuration) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingItem({
      dayIndex,
      itemIndex,
      startY: e.clientY,
      startDuration: currentDuration
    });
  };

  const moveItem = (dayIndex, itemIndex, direction) => {
    const newSchedule = [...schedule];
    const items = newSchedule[dayIndex].items;
    if (direction === 'up' && itemIndex > 0) {
      [items[itemIndex], items[itemIndex - 1]] = [items[itemIndex - 1], items[itemIndex]];
    } else if (direction === 'down' && itemIndex < items.length - 1) {
      [items[itemIndex], items[itemIndex + 1]] = [items[itemIndex + 1], items[itemIndex]];
    }
    setSchedule(newSchedule);
  };

  const enterPreviewMode = () => {
    setIsPreviewMode(true);
    generateShareUrl();
  };
  
  const exitPreviewMode = () => {
    setIsPreviewMode(false);
    setCopySuccess(false);
    window.history.pushState({}, document.title, window.location.pathname);
  };

  const executePrint = () => setTimeout(() => window.print(), 500);

  const generateShareUrl = () => {
    const encoded = encodeScheduleToUrl(schedule);
    const url = `${window.location.origin}${window.location.pathname}?data=${encoded}`;
    setShareUrl(url);
  };

  const copyToClipboard = () => {
    const text = shareUrl;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
      });
    }
  };

  const handleSaveJSON = () => {
    const dataStr = JSON.stringify(schedule, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `training_curriculum.json`;
    link.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const loadedSchedule = JSON.parse(e.target.result);
        if (Array.isArray(loadedSchedule)) {
          setSchedule(loadedSchedule);
        }
      } catch (error) {
        alert("読み込み失敗");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleLoadJSONClick = () => fileInputRef.current.click();

  // --- 4. 条件付きレンダリング (Early Return) ---
  if (isPreviewMode) {
    // 1ページに収めるためのスケーリング計算
    const maxTotalMinutes = Math.max(...schedule.map(day => 
      day.items.reduce((sum, item) => sum + item.duration, 0)
    ), 1); // 0除算防止
    
    // A4横の有効な高さ（概算）に基づいた1分あたりのピクセル数
    // 印刷時のコンテナ高さをある程度固定（例: 650px程度）し、そこに収める
    const PRINT_AREA_HEIGHT = 600; 
    const printPixelsPerMinute = Math.min(PIXELS_PER_MINUTE, PRINT_AREA_HEIGHT / maxTotalMinutes);

    return (
      <div className="bg-white min-h-screen text-black font-sans overflow-x-hidden">
        {/* コントロールバー (修正版: stickyを使用して崩れを防ぐ) */}
        <div className="sticky top-0 left-0 w-full bg-slate-900 text-white p-4 z-50 flex flex-col md:flex-row items-center justify-between shadow-lg no-print gap-4">
          <div className="font-bold text-lg flex items-center gap-2 whitespace-nowrap">
            <Share2 className="text-blue-400" /> 共有モード
          </div>

          <div className="flex-grow bg-slate-800 rounded-lg p-2 flex items-center gap-2 border border-slate-700 w-full md:mx-4 min-w-0">
            <LinkIcon size={16} className="text-slate-400 ml-2 flex-shrink-0" />
            <input 
              type="text" 
              readOnly 
              value={shareUrl} 
              className="bg-transparent text-slate-300 text-xs w-full focus:outline-none truncate min-w-0"
              onClick={(e) => e.target.select()}
            />
            <button 
              onClick={copyToClipboard}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold transition-all ${copySuccess ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
            >
              {copySuccess ? <Check size={14} /> : <Copy size={14} />}
              <span className="hidden sm:inline">{copySuccess ? '完了' : 'コピー'}</span>
            </button>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <button onClick={exitPreviewMode} className="flex items-center gap-2 px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 border border-slate-600 text-sm">
              <X size={16} /> 編集に戻る
            </button>
            <button onClick={executePrint} className="flex items-center gap-2 px-4 py-2 rounded bg-white text-slate-900 hover:bg-slate-200 font-bold text-sm shadow">
              <Printer size={16} /> 印刷
            </button>
          </div>
        </div>

        {/* 印刷用スタイル定義 */}
        <style>{`
          @media print {
            @page { size: landscape; margin: 5mm; }
            .no-print { display: none !important; }
            body { background: white !important; -webkit-print-color-adjust: exact; }
            .print-container { padding: 0 !important; }
          }
        `}</style>

        {/* コンテンツエリア */}
        <div className="p-4 md:p-8 print-container">
            <div className="mb-4 text-center border-b-2 border-black pb-2">
              <h1 className="text-2xl font-bold">中途研修カリキュラム</h1>
              <p className="text-sm mt-0.5">八洲建設株式会社</p>
            </div>

            {/* グリッドレイアウト (3カラム) */}
            <div className="grid grid-cols-3 gap-2 w-full">
            {schedule.map((dayData, i) => {
                let currentMinutes = timeToMinutes(dayData.startTime);
                return (
                <div key={dayData.day} className="border border-black rounded p-0 flex flex-col h-full bg-slate-50/30">
                    {/* ヘッダー */}
                    <div className="bg-slate-100 border-b border-black p-2 text-center">
                      <h2 className="text-lg font-bold leading-tight">Day {dayData.day}</h2>
                      <div className="text-[10px] font-bold">
                          {dayData.date ? `${dayData.date.replace(/-/g, '/')} ${getDayOfWeek(dayData.date)}` : '日付未定'}
                      </div>
                      <div className="text-[10px] mt-0.5 opacity-70">開始: {dayData.startTime}</div>
                    </div>

                    {/* リスト本体 (時間の長さに応じた高さ) */}
                    <div className="p-1 space-y-0 flex-grow relative">
                    {dayData.items.length === 0 && <div className="text-center text-gray-400 py-20 text-xs">予定なし</div>}
                    
                    {dayData.items.map((item) => {
                        const startStr = minutesToTime(currentMinutes);
                        const endMinutes = currentMinutes + item.duration;
                        const endStr = minutesToTime(endMinutes);
                        const isOverTime = endMinutes > END_LIMIT;
                        
                        // 高さ計算
                        const itemHeight = item.duration * printPixelsPerMinute;
                        currentMinutes = endMinutes;

                        let bgColor = 'bg-white';
                        let borderColor = 'border-l-4 border-l-black';
                        let textColor = 'text-slate-800';
                        
                        if (isOverTime) borderColor = 'border-l-4 border-l-red-600';
                        else if (item.type === 'lunch') { bgColor = 'bg-yellow-50/80'; borderColor = 'border-l-4 border-l-yellow-500'; }
                        else if (item.type === 'tour') { bgColor = 'bg-green-50/80'; borderColor = 'border-l-4 border-l-green-600'; }
                        else if (item.type === 'break') { bgColor = 'bg-gray-100/80'; borderColor = 'border-l-4 border-l-gray-400'; }
                        else { borderColor = 'border-l-4 border-l-blue-600'; }

                        return (
                        <div 
                          key={item.id} 
                          className={`p-1.5 border border-gray-200 mb-0.5 rounded-sm overflow-hidden ${bgColor} ${borderColor} shadow-none flex flex-col justify-center`}
                          style={{ height: `${itemHeight}px`, minHeight: '24px' }}
                        >
                            <div className="flex justify-between items-center font-bold text-gray-500 text-[9px] mb-0.5 leading-none">
                              <span>{startStr}-{endStr}</span>
                              <span>{item.duration}分</span>
                            </div>
                            
                            {item.type === 'lecture' && (
                            <div className="overflow-hidden">
                                <div className="font-bold text-xs truncate leading-tight">
                                {(() => {
                                    const l = LECTURERS.find(x => x.id === item.lecturerId);
                                    return l ? `${l.name}` : '講師未選択';
                                })()}
                                </div>
                                {item.duration >= 30 && (
                                  <>
                                    {(() => {
                                        const l = LECTURERS.find(x => x.id === item.lecturerId);
                                        return l && l.department ? <div className="text-[9px] opacity-70 truncate leading-tight">{l.department}</div> : null;
                                    })()}
                                    <div className="text-[9px] text-gray-400 flex items-center gap-1 mt-0.5 leading-none">
                                      <MapPin size={8} /> {item.location}
                                    </div>
                                  </>
                                )}
                            </div>
                            )}

                            {item.type === 'tour' && (
                            <div className="font-bold text-green-900 text-xs leading-tight">
                                グループ見学
                                {item.duration >= 30 && <div className="text-[9px] font-normal text-green-700 truncate">にじまち常滑・半田他</div>}
                            </div>
                            )}
                            
                            {item.type === 'lunch' && <div className="font-bold text-center text-yellow-800 text-xs">昼休憩</div>}
                            {item.type === 'break' && <div className="text-center text-gray-600 text-xs">休憩</div>}
                            
                            {isOverTime && item.duration >= 15 && <div className="text-red-600 font-bold text-[8px] mt-0.5 italic">※時間超過</div>}
                        </div>
                        );
                    })}
                    </div>
                </div>
                );
            })}
            </div>
        </div>
      </div>
    );
  }

  // --- 通常編集ビュー ---
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-800">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-3">
            <Building className="text-blue-600" /> 中途研修カリキュラム作成
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            八洲建設株式会社 経営企画部 powered by Yashima AI Architect
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleSaveJSON} className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-bold shadow text-sm transition-colors">
            <Download size={18} /> 保存
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
          <button onClick={handleLoadJSONClick} className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-bold shadow text-sm transition-colors">
            <Upload size={18} /> 読込
          </button>
          <div className="h-8 w-px bg-slate-300 mx-2"></div>
          <button onClick={enterPreviewMode} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold shadow-lg transition-colors scale-105">
            <Share2 size={20} /> 共有・プレビュー
          </button>
        </div>
      </header>

      {/* メインエリア: 時間軸と3カラム */}
      <div className="flex gap-4 items-start overflow-x-auto pb-8 bg-white/50 rounded-xl p-4 shadow-inner border border-slate-200">
        
        {/* 時間軸 (Time Ruler) */}
        <div className="mt-[112px] sticky left-0 z-30 bg-white/90 backdrop-blur-sm border-r border-slate-200 pr-2 shrink-0 select-none hidden md:block rounded-l-lg pt-1">
          {Array.from({ length: (END_LIMIT - START_LIMIT) / 30 + 1 }).map((_, i) => {
            const mins = START_LIMIT + i * 30;
            return (
              <div key={mins} className="relative text-[10px] text-slate-400 font-mono text-right" style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}>
                <span className="absolute -top-2.5 right-1">{minutesToTime(mins)}</span>
                <div className="absolute top-0 right-0 w-2 h-px bg-slate-300"></div>
                {i % 2 === 0 && <div className="absolute top-[27px] right-0 w-1 h-px bg-slate-100"></div>}
              </div>
            );
          })}
        </div>

        {schedule.map((dayData, index) => {
            let currentMinutes = timeToMinutes(dayData.startTime);
            return (
                <div key={dayData.day} className="flex-1 min-w-[320px] max-w-[400px] flex flex-col h-full group/day translate-z-0">
                    {/* カラムヘッダー */}
                    <div className="p-4 bg-slate-800 text-white rounded-t-xl mb-1 shadow-md relative z-20">
                        <div className="flex items-center gap-2 mb-3">
                            <Calendar size={18} className="text-blue-300" />
                            <h2 className="text-xl font-bold">Day {dayData.day}</h2>
                            <div className="flex-grow"></div>
                            <div className="flex items-center bg-slate-700/50 rounded px-2 py-1 border border-slate-600 focus-within:border-blue-400 shrink-0">
                                <input
                                    type="date"
                                    className="bg-transparent border-none text-white text-xs w-24 focus:outline-none cursor-pointer [color-scheme:dark]"
                                    value={dayData.date}
                                    onChange={(e) => handleDateChange(index, e.target.value)}
                                />
                                <span className="text-xs font-bold text-blue-200 ml-1">
                                    {getDayOfWeek(dayData.date)}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm justify-between">
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-slate-400" />
                              <span>開始:</span>
                              <select
                                  className="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                  value={dayData.startTime}
                                  onChange={(e) => handleStartTimeChange(index, e.target.value)}
                              >
                                  {Array.from({ length: 17 }).map((_, i) => { 
                                      const m = 8 * 60 + i * 15;
                                      return <option key={m} value={minutesToTime(m)}>{minutesToTime(m)}</option>;
                                  })}
                              </select>
                            </div>
                            {dayData.items.length > 0 && (
                              <div className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                                {minutesToTime(timeToMinutes(dayData.startTime) + dayData.items.reduce((acc, it) => acc + it.duration, 0))} 終了予定
                              </div>
                            )}
                        </div>
                    </div>

                    {/* タイムラインエリア (同期される領域) */}
                    <div className={`relative bg-slate-50/50 border border-slate-200 border-t-0 p-1 min-h-[1000px] rounded-b-xl overflow-hidden transition-colors ${dragOverDay === index && !dragOverItem ? 'bg-blue-50/50' : ''}`}
                         style={{ height: `${(END_LIMIT - START_LIMIT) * PIXELS_PER_MINUTE}px` }}
                         onDragOver={(e) => handleDragOver(e, index)}
                         onDrop={(e) => handleDrop(e, index)}>
                        
                        {/* 背景のグリッド線 */}
                        {Array.from({ length: (END_LIMIT - START_LIMIT) / 60 }).map((_, i) => (
                           <div key={i} className="absolute w-full border-t border-slate-200/50" style={{ top: `${i * 60 * PIXELS_PER_MINUTE}px` }}></div>
                        ))}

                        {/* リストアイテム (絶対配置) */}
                        {dayData.items.map((item, itemIndex) => {
                            const startMins = currentMinutes;
                            const startStr = minutesToTime(startMins);
                            const endMinutes = currentMinutes + item.duration;
                            const endStr = minutesToTime(endMinutes);
                            const isOverTime = endMinutes > CRITICAL_LIMIT;
                            
                            const topPx = getRelativePosition(startStr);
                            const heightPx = item.duration * PIXELS_PER_MINUTE;
                            
                            currentMinutes = endMinutes;
                            const isCompact = heightPx < 45;
                            const isDragging = draggedItem?.dayIndex === index && draggedItem?.itemIndex === itemIndex;
                            const isOver = dragOverItem?.dayIndex === index && dragOverItem?.itemIndex === itemIndex;
                            const isResizing = resizingItem?.dayIndex === index && resizingItem?.itemIndex === itemIndex;

                            let baseClass = "absolute left-1 right-1 rounded-lg border-l-4 shadow-sm group transition-all flex flex-col cursor-grab active:cursor-grabbing ";
                            if (isDragging) baseClass += 'opacity-40 scale-95 ';
                            if (isOver) baseClass += 'ring-2 ring-blue-400 ring-offset-1 z-20 ';
                            
                            if (isOverTime) baseClass += 'border-l-red-500 bg-red-50 ring-1 ring-red-200';
                            else if (item.type === 'lunch') baseClass += 'border-l-yellow-400 bg-yellow-50';
                            else if (item.type === 'tour') baseClass += 'border-l-green-500 bg-green-50';
                            else if (item.type === 'break') baseClass += 'border-l-slate-400 bg-slate-100';
                            else if (item.type === 'custom') baseClass += 'border-l-indigo-500 bg-indigo-50/50';
                            else baseClass += 'border-l-blue-500 bg-white';

                            return (
                                <div 
                                  key={item.id} 
                                  className={baseClass} 
                                  style={{ top: `${topPx}px`, height: `${heightPx}px`, zIndex: isOver ? 30 : 10 }}
                                  draggable={!isResizing} // Disable drag when resizing
                                  onDragStart={(e) => handleDragStart(e, index, itemIndex)}
                                  onDragOver={(e) => handleDragOver(e, index, itemIndex)}
                                  onDrop={(e) => handleDrop(e, index, itemIndex)}
                                  onDragEnd={handleDragEnd}
                                >
                                    {/* ラベルと操作 */}
                                    <div className={`flex justify-between items-start px-2 ${isCompact ? 'h-full items-center py-0' : 'pt-1.5'}`}>
                                        <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 shrink-0">
                                            <span className="font-bold text-slate-700">{startStr}-{endStr}</span>
                                            {!isCompact && <span className="text-[9px]">({item.duration}分)</span>}
                                            {isOverTime && <AlertTriangle size={10} className="text-red-500" />}
                                        </div>
                                        <div className="flex items-center gap-0.5 bg-white/90 rounded border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity p-0.5">
                                            <button onClick={() => moveItem(index, itemIndex, 'up')} disabled={itemIndex === 0} className="p-0.5 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-20"><ArrowUp size={10}/></button>
                                            <button onClick={() => moveItem(index, itemIndex, 'down')} disabled={itemIndex === dayData.items.length-1} className="p-0.5 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-20"><ArrowDown size={10}/></button>
                                            <button onClick={() => removeItem(index, itemIndex)} className="p-0.5 hover:bg-red-50 rounded text-red-500"><Trash2 size={10}/></button>
                                        </div>
                                    </div>

                                    {/* 内容エリア */}
                                    <div className="px-2 pb-1.5 flex-grow flex flex-col justify-center min-w-0">
                                        {item.type === 'lecture' && !isCompact && (
                                            <>
                                                <div className="flex items-center gap-1.5 mb-1 min-w-0">
                                                    <User size={14} className="text-blue-600 shrink-0" />
                                                    <select className="w-full text-xs font-bold border-b border-transparent hover:border-slate-300 bg-transparent focus:outline-none focus:border-blue-500 truncate" value={item.lecturerId} onChange={(e) => updateItem(index, itemIndex, 'lecturerId', e.target.value)}>
                                                        {LECTURERS.map(l => {
                                                            const isUsed = usedLecturerIds.has(l.id) && l.id !== item.lecturerId;
                                                            return <option key={l.id} value={l.id} disabled={isUsed}>{l.name} {l.department ? `(${l.department})` : ''}</option>;
                                                        })}
                                                    </select>
                                                </div>
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <MapPin size={12} className="text-slate-400 shrink-0" />
                                                    <select className="w-full text-[10px] text-slate-600 bg-transparent border-none focus:ring-0 truncate p-0 cursor-pointer" value={item.location} onChange={(e) => updateItem(index, itemIndex, 'location', e.target.value)}>
                                                        {LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                                    </select>
                                                </div>
                                            </>
                                        )}
                                        {item.type === 'custom' && (
                                            <div className="flex flex-col gap-1">
                                              <div className="flex items-center gap-1.5">
                                                <Plus size={14} className="text-indigo-600 shrink-0" />
                                                <input 
                                                  className="w-full text-xs font-bold bg-transparent border-b border-dashed border-indigo-200 focus:border-indigo-500 outline-none p-0"
                                                  value={item.title}
                                                  placeholder="内容を入力..."
                                                  onChange={(e) => updateItem(index, itemIndex, 'title', e.target.value)}
                                                />
                                              </div>
                                              {!isCompact && (
                                                <div className="flex items-center gap-2 mt-1">
                                                  <label className="text-[10px] text-slate-400 whitespace-nowrap">時間:</label>
                                                  <input 
                                                    type="number" 
                                                    className="w-12 text-[10px] bg-white border border-slate-200 rounded px-1 outline-none focus:ring-1 focus:ring-indigo-300"
                                                    value={item.duration}
                                                    onChange={(e) => updateItem(index, itemIndex, 'duration', e.target.value)}
                                                  />
                                                  <span className="text-[10px] text-slate-400">分</span>
                                                </div>
                                              )}
                                            </div>
                                        )}
                                        {item.type === 'tour' && !isCompact && (
                                            <div className="text-xs font-bold text-green-800 flex flex-col justify-center">
                                                <div className="flex items-center gap-1.5"><Building size={14} /> グループ見学</div>
                                                <div className="text-[10px] font-normal opacity-70">常滑・半田エリア</div>
                                            </div>
                                        )}
                                        {item.type === 'lunch' && <div className="text-center font-bold text-yellow-700 text-xs">昼休憩 (60分)</div>}
                                        {item.type === 'break' && (
                                            <div className="flex items-center justify-center gap-1.5">
                                                <Coffee size={14} className="text-slate-500" />
                                                <select className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer p-0" value={item.duration} onChange={(e) => updateItem(index, itemIndex, 'duration', e.target.value)}>
                                                    {BREAK_OPTIONS.map(min => <option key={min} value={min}>{min}分</option>)}
                                                </select>
                                            </div>
                                        )}
                                        {isCompact && (item.type === 'lecture' || item.type === 'tour') && (
                                          <div className="text-[10px] font-bold truncate">
                                            {item.type === 'lecture' ? LECTURERS.find(l => l.id === item.lecturerId)?.name : '見学'}
                                          </div>
                                        )}
                                    </div>

                                    {/* リサイズハンドル (末尾に明示的に配置) */}
                                    <div 
                                      className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize z-50 flex items-end justify-center group/handle pb-1"
                                      onMouseDown={(e) => handleResizeStart(e, index, itemIndex, item.duration)}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="w-12 h-1 bg-slate-400/30 rounded-full group-hover/handle:bg-blue-500/60 transition-colors"></div>
                                    </div>
                                </div>
                            );
                        })}
                        
                        {/* アクションパネル (常に下部に浮遊) */}
                        <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur shadow-xl border border-slate-200 rounded-2xl p-3 space-y-2 z-20 opacity-90 hover:opacity-100 transition-opacity">
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => addItem(index, 'lecture', 90)} className="flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 py-2 rounded-xl text-xs hover:bg-blue-100 font-bold transition-all"><Plus size={14} /> 講義</button>
                                <button onClick={() => addItem(index, 'custom', 30)} className="flex items-center justify-center gap-1.5 bg-indigo-50 text-indigo-700 py-2 rounded-xl text-xs hover:bg-indigo-100 font-bold transition-all"><Plus size={14} /> カスタム</button>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                <button onClick={() => addItem(index, 'break', 10)} className="flex items-center justify-center gap-1 bg-slate-100 text-slate-600 py-1.5 rounded-lg text-[10px] hover:bg-slate-200 font-bold"><Coffee size={12} /> 休憩</button>
                                <button onClick={() => addItem(index, 'lunch', 60)} className="flex items-center justify-center gap-1 bg-yellow-50 text-yellow-700 py-1.5 rounded-lg text-[10px] hover:bg-yellow-100 font-bold">昼食</button>
                                <button onClick={() => addItem(index, 'tour', 180)} className="flex items-center justify-center gap-1 bg-green-50 text-green-700 py-1.5 rounded-lg text-[10px] hover:bg-green-100 font-bold">見学</button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-white rounded-2xl shadow-sm text-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Check size={18} className="text-green-500" /> 実装された新機能
          </h3>
          <ul className="space-y-3">
            <li className="flex gap-3">
              <div className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg h-fit"><Plus size={14} /></div>
              <div>
                <p className="font-bold text-slate-700">カスタム項目</p>
                <p className="text-slate-500 text-xs">自由な内容と時間設定が可能になりました。既存のプリセットにない予定も自由に追加できます。</p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg h-fit"><Clock size={14} /></div>
              <div>
                <p className="font-bold text-slate-700">時間軸同期レイアウト</p>
                <p className="text-slate-500 text-xs">3日間のスケジュールが垂直方向に同期されます。同じ時間の予定が同じ高さに並び、一目で比較可能です。</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="p-6 bg-slate-800 rounded-2xl shadow-sm text-sm text-slate-300 border border-slate-700">
          <h3 className="font-bold text-white mb-2 flex items-center gap-2">
            <Share2 size={18} className="text-blue-400" /> 共有と活用
          </h3>
          <p className="mb-4 leading-relaxed">
            作成したデータはブラウザのURLの中に保存されます。サーバーは不要です。共有リンクをコピーして、そのままSlackやメールで送付してください。
          </p>
          <div className="bg-slate-700/50 p-3 rounded-xl border border-slate-600 text-xs text-slate-400 italic">
            ※URLが長くなりすぎると一部の環境で動作しない場合があります。
          </div>
        </div>
      </div>
    </div>
  );
}
