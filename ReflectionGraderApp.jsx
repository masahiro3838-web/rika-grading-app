import React, { useState, useEffect, useCallback } from 'react';

// 🚨 Firebase関連のインポートはすべて削除しています。
// 外部通信はAI (Gemini API) の呼び出しのみに限定し、データ保存機能はありません。

console.log("--- アプリ最終調整ロード (Ver. 15: 中学生向け平易表現に修正) ---");

// API設定
const API_KEY = ""; 
// API URLは変更しません
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=" + API_KEY;

// --- AI応答のためのJSONスキーマ定義 (変更なし) ---
const RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        total_score: { "type": "INTEGER", "description": "合計点 (0から5)" },
        ai_detection_flag: { "type": "BOOLEAN", "description": "生成AIによる記述である可能性が高い場合はtrue" },
        ai_detection_justification: { "type": "STRING", "description": "ai_detection_flagがtrueの場合に、その判断理由と、自分の言葉で書き直すよう促すメッセージ" }
,
        evaluation_R1: {
            type: "OBJECT",
            properties: {
                score: { "type": "INTEGER", "description": "単元Gの説明に関する点数 (0, 1, または 2)" },
                justification: { "type": "STRING", "description": "R1の評価理由と改善点を含むフィードバック" }
            },
            required: ["score", "justification"]
        },
        evaluation_R2: {
            type: "OBJECT",
            properties: {
                score: { "type": "INTEGER", "description": "日常生活との関連性に関する点数 (0 または 1)" },
            justification: { "type": "STRING", "description": "R2の評価理由と改善点を含むフィードバック" }
            },
            required: ["score", "justification"]
        },
        evaluation_R3: {
            type: "OBJECT",
            properties: {
                score: { "type": "INTEGER", "description": "疑問と予想に関する点数 (0, 1, または 2)" },
                justification: { "type": "STRING", "description": "R3の評価理由と改善点を含むフィードバック" }
            },
            required: ["score", "justification"]
        }
    },
    required: ["total_score", "ai_detection_flag", "ai_detection_justification", "evaluation_R1", "evaluation_R2", "evaluation_R3"]
};

// AIへのシステム指示（評価基準） 🚨 フィードバックの表現を中学生向けに平易化 🚨
const SYSTEM_PROMPT = `
あなたは中学校の理科教員であり、生徒の単元振り返り（LoyloNote）を評価し、具体的な改善点をフィードバックするエキスパートです。
以下のルーブリックに基づいて、提供された生徒の振り返りテキストを採点し、必ずJSON形式で出力してください。

---
## 採点ルーブリック (5点満点)
- **R1: 単元Gについて詳しく説明できているか (0-2点)**
    - 2点: 設定された単元Gに対する自分の考えを、**単元で学習した正確な用語と仕組み（例：進化の「自然選択」や細胞の「共通性・階層性」）**を用いて具体的かつ正確に説明している。
    - 1点: 主要な概念に触れているが、説明が**一般論、または一部不正確/曖昧**な点がある。
    - 0点: 説明がない、または内容が不正確である。
- **R2: 日常生活と関連させて考えれているか (0-1点)**
    - 1点: 学んだ原理・法則を、**具体的な日常生活の事象や社会現象と関連付け、論理的な応用や考察**をしている。**単なる感想や現象の記述、または安易な比喩では満点を与えない**。
    - 0点: 日常生活との関連付けが見られない、または関連性が不十分である。
- **R3: 単元の中で疑問を持ち、自分なりに予想を立てているか (0-2点)**
    - 2点: 単元を通して生じた、**発展的な問い**を明確にし、それに対する**学習した知識に基づいた論理的な予想（仮説）**をセットで立てている。
    - 1点: 疑問点を挙げているが、**予想が単なる感想**になっていたり、疑問が**調べればすぐにわかるレベル**である。
    - 0点: 新しい疑問や予想が記載されていない。
---
**🚨 採点基準の最終厳格化に関する重要指示 🚨**
採点においては、生徒の記述が**具体的、論理的、かつ生物学/科学的に正確**であることを**最重要視**します。
**曖昧な記述や一般論、知識の正確性を欠く記述には一切容赦せず厳しく評価**してください。

**🚨 フィードバックの表現に関する重要指示（中学生向け） 🚨**
* フィードバック（\`justification\`および\`ai_detection_justification\`）は、**中学生がすぐに理解できる、具体的で平易な言葉遣い**を使用してください。
* **「〜してください」「〜すべきです」**といった硬い表現を避け、**「〜してみよう」「〜に注目して書いてみよう」**といった**コーチのように優しく、具体的な行動を促す表現**を用いてください。
* 特にR1〜R3のフィードバックでは、**「〇〇という言葉を使ってもう一度説明してみよう」「日常生活の具体的な例を一つ挙げてみよう」**など、次に生徒が**何をすればいいか**が明確になるようにしてください。

**🚨 生成AI利用の示唆判定 🚨**
以下の特徴が見られる場合は、\`ai_detection_flag: true\` と設定してください。
- **語彙・文体**: 中学生のレベルを大きく超えた流暢すぎる文章、過度に形式的な言葉遣い、論文のような段落構成。
- **内容**: 非常に抽象的な一般論の羅列、または単元の深さを超える無関係な専門用語の乱用。
- **論理構成**: 文脈から不自然に切り取られたような完璧すぎる論理展開。
\`ai_detection_justification\`には、「あなたの文章は大人びた論理で構成されています。これを機に、表現を自分の言葉で書き直してみましょう。」といった、**警告ではない、指導的なニュアンスのメッセージ**を含めてください。
`;

// --- UI ヘルパー: ローディングスピナー (変更なし) ---
const LoadingSpinner = ({ message }) => (
    <div className="text-center p-6 bg-white rounded-xl shadow-lg w-64">
        <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-gray-700 font-medium">{message}</p>
    </div>
);


// コンポーネント定義
const App = () => {
    // App State
    const [selectedGrade, setSelectedGrade] = useState('grade_1'); 
    const [isTeacherMode, setIsTeacherMode] = useState(false); 

    // Reflection Data State
    const [unitGoal, setUnitGoal] = useState('モーターを効率よく回すには？'); // 変数名は維持
    const [reflectionText, setReflectionText] = useState(`
【学年：1年】今回の単元Gは「モーターを効率よく回すには？」でした。
モーターは電気エネルギーを運動エネルギーに変える仕組みで動いています。
私は扇風機がどうやって動いているのか疑問に思いましたが、モーターが使われているとわかって納得しました。
もっと小さな力で回すには、どうすればいいか疑問に思いました。
`); // 初期値
    const [currentFeedback, setCurrentFeedback] = useState(null); 
    const [lastUpdated, setLastUpdated] = useState(null); 

    // UI/Loading State
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [isSaving] = useState(false); // 保存機能がないため、常にFalse

    // --- AI採点処理（Gemini API呼び出し） ---
    const gradeReflection = useCallback(async () => {
        if (isTeacherMode) {
            setErrorMessage("先生モードでは採点できません。生徒モードに切り替えてください。");
            return;
        }

        const trimmedReflection = reflectionText.trim();
        const trimmedGoal = unitGoal.trim();

        // 50文字チェック
        if (!trimmedGoal || trimmedReflection.length < 50) {
            setErrorMessage('単元Gが設定されていることと、50文字以上の振り返りテキストが必要です。');
            return;
        }

        setIsLoading(true);
        setErrorMessage('');
        
        try {
            // 1. AIによる採点
            const userQuery = `
以下の情報を使用して、生徒の振り返りテキストを採点してください。
【対象学年】: ${selectedGrade.replace('grade_', '')}年
【今回の単元G（問い）】: ${trimmedGoal}
【生徒の振り返りテキスト】: ${trimmedReflection}
`;

            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: RESPONSE_SCHEMA
                }
            };
            
            // 指数バックオフ付きfetchを実行
            const result = await fetchWithExponentialBackoff(payload);
            const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!jsonString) throw new Error("AI応答からJSONデータが見つかりませんでした。");
            
            const evaluation = JSON.parse(jsonString);

            // 2. 状態の更新
            setCurrentFeedback(evaluation);
            setLastUpdated(new Date());

        } catch (error) {
            console.error("AI採点処理中にエラー:", error);
            setErrorMessage(`AI採点中にエラーが発生しました。ネットワーク接続を確認してください。詳細: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [isTeacherMode, reflectionText, unitGoal, selectedGrade]);

    /**
     * 指数バックオフ付きのfetch API呼び出し (変更なし)
     */
    const fetchWithExponentialBackoff = useCallback(async (payload, maxRetries = 3, delay = 1000) => {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    return response.json();
                } else if (response.status === 429 || response.status >= 500) {
                    if (i < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
                        continue;
                    } else {
                        throw new Error(`APIリクエストが失敗しました。ステータスコード: ${response.status}`);
                    }
                } else {
                    const errorBody = await response.json();
                    throw new Error(`クライアントエラー: ${errorBody.error?.message || response.statusText}`);
                }
            } catch (error) {
                if (i < maxRetries - 1 && error.message.includes('fetch')) { 
                    await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
                } else {
                    throw error;
                }
            }
        }
    }, []);

    // --- UI コンポーネント ---

    const FeedbackCard = ({ title, score, justification }) => {
        const maxScore = title.includes('説明') || title.includes('疑問') ? 2 : 1;
        // Primary Blue (blue-600)
        const titleClass = 'text-blue-600'; 
        const scoreClass = score > 0 ? 'text-green-600' : 'text-red-600';
        
        return (
            <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-blue-600">
                <div className="flex justify-between items-start mb-2">
                    <h3 className={`font-semibold text-lg ${titleClass}`}>{title}</h3>
                    <span className={`text-3xl font-extrabold ${scoreClass}`}>{score} / {maxScore}</span>
                </div>
                {/* justificationは平易な表現になっているはず */}
                <p className="text-gray-600 text-sm whitespace-pre-wrap">{justification}</p>
            </div>
        );
    };

    // --- メインアプリケーション画面 ---

    const totalScore = currentFeedback?.total_score || 0;
    const isReflectionShort = reflectionText.trim().length < 50 && reflectionText.trim().length > 0;
    const isProcessing = isLoading || isSaving;
    // 🚨 AI示唆判定結果 🚨
    const isAIDetected = currentFeedback?.ai_detection_flag;
    const aiDetectionMessage = currentFeedback?.ai_detection_justification;

    return (
        <div className="container py-8" style={{ fontFamily: 'Noto Sans JP, Inter, sans-serif' }}>
            <header className="mb-6 border-b pb-3 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-blue-600 mb-1">理科 振り返り改善コーチ</h1>
                    <p className="text-gray-600 text-sm">
                        AI採点機能のみ有効
                    </p>
                </div>
                {/* 先生モード切り替え（UIは残すが、機能はモック） */}
                <div className="flex items-center space-x-2">
                    <span className={`text-sm font-semibold ${isTeacherMode ? 'text-gray-400' : 'text-blue-600'}`}>生徒モード</span>
                    <label htmlFor="teacher-mode-toggle" className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input 
                                type="checkbox" 
                                id="teacher-mode-toggle" 
                                className="sr-only"
                                checked={isTeacherMode}
                                onChange={(e) => setIsTeacherMode(e.target.checked)}
                                disabled={isProcessing}
                            />
                            <div className="block bg-gray-300 w-10 h-6 rounded-full"></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition ${isTeacherMode ? 'transform translate-x-4 bg-red-500' : ''}`}></div>
                        </div>
                    </label>
                    <span className={`text-sm font-semibold ${isTeacherMode ? 'text-red-600' : 'text-gray-400'}`}>先生モード</span>
                </div>
            </header>
            
            {/* 学年選択と単元テーマ設定 */}
            <div className="bg-white p-4 rounded-xl shadow-lg mb-6 space-y-4">
                <p className="text-yellow-600 font-bold border-b pb-2 mb-3">⚠️ [重要] このバージョンではデータ保存機能が使えません。採点結果はブラウザを閉じると消えます。</p>
                
                <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                    <label htmlFor="grade-select" className="block text-lg font-bold text-gray-800 shrink-0">① 対象学年</label>
                    <select
                        id="grade-select"
                        className="p-3 border border-gray-300 rounded-lg focus:ring-blue-600 focus:border-blue-600 transition duration-150 ease-in-out w-full sm:w-auto font-medium"
                        value={selectedGrade}
                        onChange={(e) => setSelectedGrade(e.target.value)}
                        disabled={isProcessing}
                    >
                        <option value="grade_1">1年</option>
                        <option value="grade_2">2年</option>
                        <option value="grade_3">3年</option>
                    </select>
                </div>

                {/* 単元の振り返り（単元G） 入力フィールド */}
                <div className="space-y-2">
                    <label htmlFor="unitGoalText" className="block text-lg font-bold text-gray-800">② 単元の振り返り（単元G）</label>
                    <input 
                        type="text" 
                        id="unitGoalText" 
                        className={`w-full p-3 border border-gray-300 rounded-lg transition duration-150 ease-in-out font-medium ${isTeacherMode ? 'bg-yellow-50 focus:ring-yellow-500 focus:border-yellow-500' : 'bg-gray-50'}`} 
                        placeholder="例：モーターを効率よく回すには？" 
                        value={unitGoal}
                        onChange={(e) => setUnitGoal(e.target.value)}
                        disabled={isProcessing}
                    />
                    {isTeacherMode && (
                        <p className="text-sm text-red-500 font-semibold">⚠️ 先生モードの保存ボタンは現在無効です。</p>
                    )}
                </div>
            </div>

            {/* エラーメッセージ */}
            {errorMessage && (
                <div className="p-3 mb-4 bg-red-100 text-red-700 border border-red-400 rounded-lg shadow-sm">
                    {errorMessage}
                </div>
            )}
            
            {/* 振り返り入力エリア */}
            <div className={`bg-white p-4 rounded-xl shadow-lg mb-6 space-y-4 ${isTeacherMode ? 'opacity-50 pointer-events-none' : ''}`}>
                <div>
                    <label htmlFor="reflectionText" className="block text-lg font-bold text-gray-800 mb-2">③ あなたの振り返りテキスト（修正OK）</label>
                    <textarea 
                        id="reflectionText" 
                        rows="8" 
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-600 focus:border-blue-600 transition duration-150 ease-in-out" 
                        placeholder="ここに学んだこと、日常生活との関連、疑問と予想を書いてください。"
                        value={reflectionText}
                        onChange={(e) => setReflectionText(e.target.value)}
                        disabled={isProcessing || isTeacherMode}
                    ></textarea>
                     {isReflectionShort && (
                        <p className="text-sm text-yellow-600 mt-1">💡 採点の精度を高めるため、もう少し詳しく書きましょう（50文字以上推奨）。</p>
                    )}
                </div>
                
                {/* 採点ボタン */}
                <button 
                    onClick={gradeReflection}
                    className="w-full px-4 py-3 text-lg bg-blue-600 text-white font-bold rounded-lg shadow-xl hover:bg-blue-700 transition duration-150 ease-in-out flex items-center justify-center disabled:bg-gray-400 disabled:text-gray-200 disabled:shadow-none"
                    disabled={isProcessing || isTeacherMode || !unitGoal || reflectionText.trim().length < 50}
                >
                    <svg className={`animate-spin -ml-1 mr-3 h-5 w-5 text-white ${isProcessing ? '' : 'hidden'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {isProcessing ? 'AI採点処理中...' : 'AI採点'}
                </button>
                {lastUpdated && (
                    <p className="text-xs text-gray-500 text-right">
                        最終採点日時: {lastUpdated.toLocaleTimeString('ja-JP')} (保存なし)
                    </p>
                )}
            </div>

            {/* 結果表示エリア */}
            {currentFeedback && (
                <div id="resultsArea" className="mt-8">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">現在の採点とフィードバック</h2>
                    
                    {/* 🚨 AI示唆判定メッセージ 🚨 */}
                    {isAIDetected && aiDetectionMessage && (
                        <div className="p-4 mb-6 bg-purple-100 text-purple-700 border border-purple-400 rounded-lg shadow-md font-semibold">
                            <p className="flex items-center">
                                <span className="text-xl mr-2">🤔</span>
                                {aiDetectionMessage}
                            </p>
                        </div>
                    )}

                    {/* 合計点 */}
                    <div id="totalScoreBox" className="score-box p-4 rounded-xl shadow-md mb-6 border-l-8 border-green-500">
                        <p className="text-lg font-medium text-gray-700">合計点 (5点満点)</p>
                        <p className="text-6xl font-extrabold text-green-600">
                            {totalScore}<span className="text-3xl font-semibold text-gray-500">/5</span>
                        </p>
                         {/* 🚨 注意書き 🚨 */}
                        <p className="text-xs text-red-500 font-bold mt-2">
                            ※この採点結果はAIによる参考情報です。最終的な評価は先生が行います。
                        </p>
                        <p className="mt-2 text-sm text-gray-600">
                            このフィードバックを元に振り返りを修正し、「AI採点」ボタンを押して点数アップを目指そう！
                        </p>
                    </div>

                    {/* 詳細評価 */}
                    <div className="space-y-4" id="detailedEvaluation">
                        <h3 className="text-xl font-bold text-gray-800 border-b pb-2">詳細な改善アドバイス</h3>
                        <FeedbackCard 
                            title="① 単元Gの説明 (2点満点)" 
                            score={currentFeedback.evaluation_R1.score} 
                            justification={currentFeedback.evaluation_R1.justification}
                        />
                        <FeedbackCard 
                            title="② 日常生活との関連 (1点満点)" 
                            score={currentFeedback.evaluation_R2.score} 
                            justification={currentFeedback.evaluation_R2.justification}
                        />
                        <FeedbackCard 
                            title="③ 疑問と予想 (2点満点)" 
                            score={currentFeedback.evaluation_R3.score} 
                            justification={currentFeedback.evaluation_R3.justification}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;

