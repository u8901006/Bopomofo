import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type } from "@google/genai";

// --- Types ---
interface Question {
  character: string;
  zhuyin: string;
  meaning: string;
  distractors: string[];
}

interface GameState {
  screen: "menu" | "loading" | "playing" | "gameover" | "error";
  score: number;
  streak: number;
  questions: Question[];
  currentIndex: number;
  lastAnswerCorrect: boolean | null;
  selectedOption: string | null;
  errorMessage: string;
}

// --- Icons ---
const VolumeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
);

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
);

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={filled ? "text-yellow-400" : "text-gray-300"}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
);

// --- App Component ---
const App = () => {
  const [state, setState] = useState<GameState>({
    screen: "menu",
    score: 0,
    streak: 0,
    questions: [],
    currentIndex: 0,
    lastAnswerCorrect: null,
    selectedOption: null,
    errorMessage: "",
  });

  const generateQuestions = async (level: string) => {
    setState((prev) => ({ ...prev, screen: "loading", errorMessage: "" }));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const difficultyPrompt = level === "Beginner" 
        ? "Elementary level (Common words)" 
        : level === "Intermediate" 
          ? "Intermediate level" 
          : "Advanced level";

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate 10 unique Traditional Chinese vocabulary quiz items for ${difficultyPrompt}. 
        Return a JSON array where each object has:
        - "character" (the Traditional Chinese word/character)
        - "zhuyin" (correct Bopomofo/Zhuyin with tone marks, e.g., ㄋㄧˇ ㄏㄠˇ)
        - "meaning" (English definition)
        - "distractors" (an array of 3 INCORRECT Bopomofo/Zhuyin strings that look somewhat similar to the correct one).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                character: { type: Type.STRING },
                zhuyin: { type: Type.STRING },
                meaning: { type: Type.STRING },
                distractors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["character", "zhuyin", "meaning", "distractors"],
            },
          },
        },
      });

      const jsonText = response.text;
      if (!jsonText) throw new Error("No data received from AI");
      
      const questions: Question[] = JSON.parse(jsonText);
      
      setState((prev) => ({
        ...prev,
        screen: "playing",
        questions: questions,
        currentIndex: 0,
        score: 0,
        streak: 0,
        lastAnswerCorrect: null,
        selectedOption: null,
      }));

    } catch (error) {
      console.error(error);
      setState((prev) => ({
        ...prev,
        screen: "error",
        errorMessage: "生成題目失敗，請檢查網路連線後重試。",
      }));
    }
  };

  const speakCharacter = (text: string) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-TW"; // Changed to Taiwan locale
      utterance.rate = 0.8; 
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAnswer = (option: string) => {
    if (state.selectedOption) return; // Prevent double clicking

    const currentQ = state.questions[state.currentIndex];
    const isCorrect = option === currentQ.zhuyin;

    // Auto-speak on answer
    if (isCorrect) {
      speakCharacter(currentQ.character);
    }

    setState((prev) => ({
      ...prev,
      selectedOption: option,
      lastAnswerCorrect: isCorrect,
      score: isCorrect ? prev.score + 10 + (prev.streak * 2) : prev.score,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));

    // Auto advance after short delay
    setTimeout(() => {
      if (state.currentIndex < state.questions.length - 1) {
        setState((prev) => ({
          ...prev,
          currentIndex: prev.currentIndex + 1,
          selectedOption: null,
          lastAnswerCorrect: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          screen: "gameover",
        }));
      }
    }, isCorrect ? 1500 : 2500); // Give a bit more time to study mistakes
  };

  // Helper to shuffle options (memoized per question index ideally, but effect works here)
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);

  useEffect(() => {
    if (state.screen === "playing" && state.questions[state.currentIndex]) {
      const q = state.questions[state.currentIndex];
      const all = [...q.distractors, q.zhuyin];
      // Simple shuffle
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      setShuffledOptions(all);
    }
  }, [state.currentIndex, state.questions, state.screen]);

  // --- Render Functions ---

  const renderMenu = () => (
    <div className="flex flex-col items-center justify-center h-full p-6 space-y-8 bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
      <div className="text-center space-y-2">
        <h1 className="text-6xl font-bold tracking-tight">注音大師</h1>
        <p className="text-xl text-indigo-100 opacity-90">挑戰你的注音與聲調！</p>
      </div>
      
      <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl w-full max-w-sm border border-white/20 shadow-xl">
        <p className="mb-4 text-center font-medium">選擇難度</p>
        <div className="space-y-3">
          {[
            { label: "初級", value: "Beginner" },
            { label: "中級", value: "Intermediate" },
            { label: "高級", value: "Advanced" }
          ].map((levelObj) => (
            <button
              key={levelObj.value}
              onClick={() => generateQuestions(levelObj.value)}
              className="w-full py-4 px-6 bg-white text-indigo-600 rounded-xl font-bold shadow-lg hover:bg-indigo-50 hover:scale-105 transition-all duration-200"
            >
              {levelObj.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center h-full space-y-6 bg-slate-50">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-8 border-indigo-100 rounded-full"></div>
        <div className="absolute inset-0 border-8 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
      </div>
      <p className="text-xl text-slate-600 font-medium animate-pulse">正在透過 Gemini AI 生成注音題目...</p>
    </div>
  );

  const renderError = () => (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50">
      <div className="bg-red-100 text-red-600 p-4 rounded-full mb-4">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      </div>
      <h3 className="text-2xl font-bold text-slate-800 mb-2">哎呀！</h3>
      <p className="text-slate-600 mb-6">{state.errorMessage}</p>
      <button 
        onClick={() => setState(prev => ({ ...prev, screen: "menu" }))}
        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-colors"
      >
        重試
      </button>
    </div>
  );

  const renderGame = () => {
    const question = state.questions[state.currentIndex];
    
    return (
      <div className="flex flex-col h-full bg-slate-50 max-w-md mx-auto shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="bg-white p-4 flex justify-between items-center border-b border-slate-100">
          <div className="flex items-center space-x-1 text-yellow-500 font-bold text-lg">
            <StarIcon filled={true} />
            <span>{state.score}</span>
          </div>
          <div className="text-slate-400 font-medium text-sm">
            {state.currentIndex + 1} / {state.questions.length}
          </div>
          <div className={`flex items-center space-x-1 font-bold text-sm ${state.streak > 2 ? 'text-orange-500' : 'text-slate-400'}`}>
            <span>🔥 {state.streak}</span>
          </div>
        </div>

        {/* Card Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
          
          <div className="relative group">
            <div className="w-48 h-48 bg-white rounded-3xl shadow-xl flex items-center justify-center border-2 border-indigo-50 relative overflow-hidden">
               <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-10 transition-opacity"></div>
               <span className="hanzi text-8xl font-bold text-slate-800 select-none">
                 {question.character}
               </span>
            </div>
            <button 
              onClick={() => speakCharacter(question.character)}
              className="absolute -bottom-4 -right-4 bg-indigo-600 text-white p-3 rounded-full shadow-lg hover:bg-indigo-700 transition-colors hover:scale-110 active:scale-90"
              aria-label="Play Audio"
            >
              <VolumeIcon />
            </button>
          </div>

          <div className={`text-center transition-all duration-300 ${state.selectedOption ? 'opacity-100' : 'opacity-0 translate-y-2'}`}>
             <p className="text-slate-500 font-medium">釋義</p>
             <p className="text-xl text-slate-800 font-bold">{question.meaning}</p>
          </div>

        </div>

        {/* Options Area */}
        <div className="bg-white p-6 rounded-t-3xl shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.1)]">
          <p className="text-center text-slate-400 mb-4 text-sm font-bold uppercase tracking-wider">請選擇正確的注音</p>
          <div className="grid grid-cols-2 gap-4">
            {shuffledOptions.map((option, idx) => {
              const isSelected = state.selectedOption === option;
              const isCorrect = option === question.zhuyin;
              const showResult = !!state.selectedOption;
              
              let btnClass = "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200"; // Default
              
              if (showResult) {
                if (isCorrect) {
                  btnClass = "bg-green-500 text-white border-green-600 ring-2 ring-green-300 ring-offset-2";
                } else if (isSelected && !isCorrect) {
                   btnClass = "bg-red-500 text-white border-red-600 opacity-50";
                } else {
                  btnClass = "bg-slate-100 text-slate-300 opacity-50";
                }
              }

              return (
                <button
                  key={idx}
                  disabled={showResult}
                  onClick={() => handleAnswer(option)}
                  className={`py-4 px-2 rounded-2xl text-xl font-bold transition-all duration-200 border-b-4 active:border-b-0 active:translate-y-1 ${btnClass}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderGameOver = () => (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-slate-50 text-center space-y-8">
      <div className="space-y-4">
        <h2 className="text-4xl font-bold text-slate-800">測驗完成！</h2>
        <div className="text-6xl font-black text-indigo-600 animate-bounce-short">
          {state.score}
        </div>
        <p className="text-slate-500">總分</p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-lg w-full max-w-xs space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <span className="text-slate-500">答對題數</span>
          <span className="font-bold text-green-600">
             {/* Simple heuristic for demo: assume score roughly maps to correct answers */}
             {Math.round(state.score / 12)} / {state.questions.length}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">最高連勝</span>
          <span className="font-bold text-orange-500">{state.streak}</span>
        </div>
      </div>

      <button
        onClick={() => setState(prev => ({ ...prev, screen: "menu" }))}
        className="flex items-center space-x-2 px-8 py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all hover:-translate-y-1"
      >
        <RefreshIcon />
        <span>再玩一次</span>
      </button>
    </div>
  );

  return (
    <>
      {state.screen === "menu" && renderMenu()}
      {state.screen === "loading" && renderLoading()}
      {state.screen === "playing" && renderGame()}
      {state.screen === "gameover" && renderGameOver()}
      {state.screen === "error" && renderError()}
    </>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
