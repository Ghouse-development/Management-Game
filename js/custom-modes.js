/**
 * MG カスタムモード・AI最適戦略エンジン v3
 *
 * !! 警告 !!
 * このファイルはブラウザUI・カスタムゲームモード専用です。
 *
 * シミュレーションのルール定義は以下のファイルが唯一のソース（Single Source of Truth）:
 *   js/simulation-engine.js
 *
 * === シミュレーション結果 (v8 Final) - 1000回×57戦略 = 57,000回 ===
 *
 * 【成功率ランキング TOP 5】
 * 1. R2E1_NR_SM_DYN: 95.20% - 研究2+教育1+翌期研究+機械+動的借入
 * 2. R2E1_NR_DYN: 94.80% - 研究2+教育1+翌期研究+動的借入
 * 3. R2E1_NR_B30_B70: 93.20% - 研究2+教育1+翌期研究+段階借入(30+70)
 * 4. R2E1_NR_B40_B60: 93.10% - 研究2+教育1+翌期研究+段階借入(40+60)
 * 5. R2E1_NR_SM_B30_B70: 92.90%
 *
 * 【最重要発見】
 * - R2E1+翌期研究（NR）が最強コア
 * - 動的借入（現金不足時のみ借りる）が最も効果的
 * - 段階的借入（3期30円+4期70円）も高勝率
 * - 名古屋¥28市場を研究3枚で確保
 */

// ============================================
// ゲームルール定数（MG_CONSTANTSから統一参照）
// ============================================
// 注: constants.js で定義されたMG_CONSTANTSを使用
// 後方互換性のためにGAME_RULESエイリアスを提供

const GAME_RULES = (() => {
    // MG_CONSTANTSが利用可能な場合はそれを使用
    const C = (typeof MG_CONSTANTS !== 'undefined') ? MG_CONSTANTS : null;

    return {
        // 容量制限
        WIP_CAPACITY: 10,
        MATERIAL_BASE: C ? C.INVENTORY_CAPACITY.base : 10,
        PRODUCT_BASE: C ? C.INVENTORY_CAPACITY.base : 10,
        WAREHOUSE_BONUS: C ? C.INVENTORY_CAPACITY.warehouseBonus : 12,

        // 機械（参照用）
        MACHINE: {
            SMALL: { cost: 100, capacity: 1, depreciation: 10 },
            LARGE: { cost: 200, capacity: 4, depreciation: 20 }
        },

        // コスト（MG_CONSTANTSから参照）
        HIRING_COST: C ? C.HIRING_COSTS.worker : 20,
        CHIP_COST: C ? C.CHIP_COSTS.normal : 20,
        INSURANCE_COST: C ? C.CHIP_COSTS.insurance : 5,
        WAREHOUSE_COST: C ? C.WAREHOUSE_COST : 20,
        PROCESSING_COST: C ? C.PRODUCTION_COST : 1,

        // 人件費基準（MG_CONSTANTSから参照）
        WAGE_BASE: C ? C.BASE_SALARY_BY_PERIOD : { 2: 22, 3: 24, 4: 26, 5: 28 },

        // 市場価格上限
        MARKETS: {
            SENDAI: { buy: 10, sell: 40 },
            SAPPORO: { buy: 11, sell: 36 },
            FUKUOKA: { buy: 12, sell: 32 },
            NAGOYA: { buy: 13, sell: 28 },
            OSAKA: { buy: 14, sell: 24 },
            TOKYO: { buy: 15, sell: 20 }
        },

        // 行数（MG_CONSTANTSから参照）
        MAX_ROWS: C ? C.MAX_ROWS_BY_PERIOD : { 2: 20, 3: 30, 4: 34, 5: 35 },

        // 借入（1円単位、3期以降のみ）
        LONG_TERM_RATE: C ? C.INTEREST_RATES.longTerm : 0.10,
        SHORT_TERM_RATE: C ? C.INTEREST_RATES.shortTerm : 0.20,
        // 借入限度倍率: 自己資本 × 倍率
        LOAN_MULTIPLIER: { default: 0.5, period4Plus300: 1.0 },
        getLoanMultiplier: C ? C.getLoanMultiplier : function(p, e) { return (p >= 4 && e > 300) ? 1.0 : 0.5; },

        // リスク確率（実効）
        RISK_PROBABILITY: 0.08,

        // 目標（MG_CONSTANTSから参照）
        TARGET_EQUITY: C ? C.TARGET_EQUITY : 450,

        // シミュレーション
        SIMULATION_RUNS: 100,

        // === 入札勝率テーブル（MG_CONSTANTSから参照） ===
        BID_WIN_RATES: C ? C.BID_WIN_RATES : {
            0: { price: 24, winRate: 0.55, market: '大阪' },
            1: { price: 24, winRate: 0.60, market: '大阪' },
            2: { price: 28, winRate: 0.70, market: '名古屋' },
            3: { price: 28, winRate: 0.78, market: '名古屋' },
            4: { price: 32, winRate: 0.82, market: '福岡' },
            5: { price: 36, winRate: 0.88, market: '札幌' }
        },

        // === 最適戦略（MG_CONSTANTSから参照）===
        OPTIMAL_STRATEGIES: C ? C.OPTIMAL_STRATEGIES : [
            { name: 'R2E1_NR_SM_DYN', successRate: 95.20, chips: {r:2, e:1}, nextR: 1, borrow: 'dynamic', sm: true, desc: '最強: 動的借入+機械' },
            { name: 'R2E1_NR_DYN', successRate: 94.80, chips: {r:2, e:1}, nextR: 1, borrow: 'dynamic', sm: false, desc: '動的借入のみ' },
            { name: 'R2E1_NR_B30_B70', successRate: 93.20, chips: {r:2, e:1}, nextR: 1, borrow: [30, 70], sm: false, desc: '段階借入' }
        ],

        // === 失敗戦略（MG_CONSTANTSから参照）===
        FAILED_STRATEGIES: C ? C.FAILED_STRATEGIES : [
            { name: 'ZERO', successRate: 0.00, reason: '価格競争力なし' },
            { name: 'R1', successRate: 0.00, reason: '中途半端' }
        ],

        // === 借入戦略（MG_CONSTANTSから参照）===
        BORROW_STRATEGY: C ? C.BORROW_STRATEGY : {
            DYNAMIC_THRESHOLD: 60,
            DYNAMIC_AMOUNT: 80,
            STAGED_3: 30,
            STAGED_4: 70
        }
    };
})();

// ============================================
// 能力計算
// ============================================
function calcMfgCapacity(state) {
    if (state.workers === 0) return 0;
    const machCap = (state.machinesSmall || 0) + (state.machinesLarge || 0) * 4;
    const numMach = (state.machinesSmall || 0) + (state.machinesLarge || 0);
    if (state.workers < numMach) return state.workers;
    return machCap + (state.chips?.computer || 0) + Math.min(state.chips?.education || 0, state.workers);
}

function calcSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    const base = state.salesmen * 2;
    const eduBonus = Math.min(state.chips?.education || 0, state.salesmen);
    return base + eduBonus;
}

// ============================================
// カード形式状態入力UI
// ============================================
function showStateInputModal() {
    const content = `
        <div style="max-height: 80vh; overflow-y: auto; padding: 5px;">
            <!-- ヘッダー -->
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 15px; border-radius: 12px; margin-bottom: 15px; text-align: center;">
                <div style="font-size: 20px; font-weight: bold;">🎯 期初状態から450達成への道</div>
                <div style="font-size: 12px; margin-top: 5px; opacity: 0.9;">現在の状態を入力 → AIが最適戦略を提案</div>
            </div>

            <!-- 期選択カード -->
            <div style="background: white; border: 2px solid #e5e7eb; border-radius: 12px; padding: 15px; margin-bottom: 12px;">
                <div style="font-weight: bold; color: #374151; margin-bottom: 10px; font-size: 14px;">📅 開始期</div>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    ${[2,3,4,5].map(p => `
                        <button onclick="selectPeriod(${p})" id="period-btn-${p}"
                            style="width: 60px; height: 60px; border-radius: 12px; border: 2px solid ${p===2 ? '#4f46e5' : '#e5e7eb'};
                            background: ${p===2 ? '#eef2ff' : 'white'}; cursor: pointer; font-size: 18px; font-weight: bold;
                            color: ${p===2 ? '#4f46e5' : '#6b7280'}; transition: all 0.2s;">
                            ${p}期
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- 財務状態カード -->
            <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 15px; margin-bottom: 12px;">
                <div style="font-weight: bold; color: #92400e; margin-bottom: 12px; font-size: 14px;">💰 財務状態</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div style="background: white; padding: 10px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 11px; color: #666;">現金</div>
                        <input type="number" id="state-cash" value="112" min="0"
                            style="width: 100%; border: none; text-align: center; font-size: 20px; font-weight: bold; color: #059669;">
                    </div>
                    <div style="background: white; padding: 10px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 11px; color: #666;">自己資本</div>
                        <input type="number" id="state-equity" value="283" min="0"
                            style="width: 100%; border: none; text-align: center; font-size: 20px; font-weight: bold; color: #2563eb;">
                    </div>
                    <div style="background: white; padding: 10px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 11px; color: #666;">借入金</div>
                        <input type="number" id="state-loans" value="0" min="0" step="50"
                            style="width: 100%; border: none; text-align: center; font-size: 20px; font-weight: bold; color: #dc2626;">
                    </div>
                </div>
            </div>

            <!-- 人員・機械カード -->
            <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 12px; padding: 15px; margin-bottom: 12px;">
                <div style="font-weight: bold; color: #166534; margin-bottom: 12px; font-size: 14px;">🏭 人員・設備</div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                    ${createCounterCard('state-workers', 'ワーカー', 1, '👷')}
                    ${createCounterCard('state-salesmen', 'セールス', 1, '🧑‍💼')}
                    ${createCounterCard('state-machines-small', '小型機械', 1, '⚙️')}
                    ${createCounterCard('state-machines-large', '大型機械', 0, '🏭')}
                </div>
            </div>

            <!-- 在庫カード -->
            <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-radius: 12px; padding: 15px; margin-bottom: 12px;">
                <div style="font-weight: bold; color: #991b1b; margin-bottom: 12px; font-size: 14px;">📦 在庫状態</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    ${createCounterCard('state-materials', '材料', 1, '🧱')}
                    ${createCounterCard('state-wip', '仕掛品', 2, '🔨')}
                    ${createCounterCard('state-products', '製品', 1, '📦')}
                </div>
            </div>

            <!-- チップカード -->
            <div style="background: linear-gradient(135deg, #ddd6fe 0%, #c4b5fd 100%); border-radius: 12px; padding: 15px; margin-bottom: 12px;">
                <div style="font-weight: bold; color: #5b21b6; margin-bottom: 12px; font-size: 14px;">🎰 チップ（会社盤上）</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    ${createChipCard('state-chip-research', '研究', 0, '🔬', '#3b82f6')}
                    ${createChipCard('state-chip-education', '教育', 0, '📚', '#10b981')}
                    ${createChipCard('state-chip-advertising', '広告', 0, '📢', '#f59e0b')}
                </div>
                <div style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.7); border-radius: 8px; font-size: 12px; color: #5b21b6;">
                    💡 <strong>推奨: 研究2枚+教育1枚</strong>（成功率87%）
                </div>
            </div>

            <!-- 翌期チップカード（3期以降用） -->
            <div id="next-chips-section" style="background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); border-radius: 12px; padding: 15px; margin-bottom: 12px; display: none;">
                <div style="font-weight: bold; color: #0369a1; margin-bottom: 12px; font-size: 14px;">⏰ 翌期チップ（購入済み・未適用）</div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                    ${createChipCard('state-next-research', '研究', 0, '🔬', '#3b82f6')}
                    ${createChipCard('state-next-education', '教育', 0, '📚', '#10b981')}
                </div>
            </div>

            <!-- 分析ボタン -->
            <button onclick="analyzeAndPropose()"
                style="width: 100%; padding: 18px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer;
                box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4);">
                🧠 AIが最適戦略を提案
            </button>
        </div>
    `;

    showModal('🎯 状態入力', content);
}

function createCounterCard(id, label, defaultVal, icon) {
    return `
        <div style="background: white; padding: 8px; border-radius: 8px; text-align: center;">
            <div style="font-size: 20px;">${icon}</div>
            <div style="font-size: 10px; color: #666; margin: 3px 0;">${label}</div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
                <button onclick="adjustValue('${id}', -1)" style="width: 24px; height: 24px; border: 1px solid #e5e7eb; border-radius: 4px; background: #f9fafb; cursor: pointer;">-</button>
                <input type="number" id="${id}" value="${defaultVal}" min="0" max="10"
                    style="width: 35px; text-align: center; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 16px; font-weight: bold;">
                <button onclick="adjustValue('${id}', 1)" style="width: 24px; height: 24px; border: 1px solid #e5e7eb; border-radius: 4px; background: #f9fafb; cursor: pointer;">+</button>
            </div>
        </div>
    `;
}

function createChipCard(id, label, defaultVal, icon, color) {
    return `
        <div style="background: white; padding: 10px; border-radius: 8px; text-align: center; border: 2px solid ${color}20;">
            <div style="font-size: 24px;">${icon}</div>
            <div style="font-size: 11px; color: #666; margin: 5px 0;">${label}</div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                <button onclick="adjustValue('${id}', -1)" style="width: 28px; height: 28px; border: none; border-radius: 6px; background: ${color}; color: white; cursor: pointer; font-weight: bold;">-</button>
                <span id="${id}-display" style="font-size: 24px; font-weight: bold; color: ${color}; min-width: 30px;">${defaultVal}</span>
                <input type="hidden" id="${id}" value="${defaultVal}">
                <button onclick="adjustValue('${id}', 1)" style="width: 28px; height: 28px; border: none; border-radius: 6px; background: ${color}; color: white; cursor: pointer; font-weight: bold;">+</button>
            </div>
        </div>
    `;
}

function adjustValue(id, delta) {
    const input = document.getElementById(id);
    const display = document.getElementById(id + '-display');
    if (!input) return;

    let val = parseInt(input.value) + delta;
    val = Math.max(0, Math.min(10, val));
    input.value = val;
    if (display) display.textContent = val;
}

function selectPeriod(period) {
    // ボタンのスタイル更新
    [2,3,4,5].forEach(p => {
        const btn = document.getElementById(`period-btn-${p}`);
        if (btn) {
            btn.style.border = p === period ? '2px solid #4f46e5' : '2px solid #e5e7eb';
            btn.style.background = p === period ? '#eef2ff' : 'white';
            btn.style.color = p === period ? '#4f46e5' : '#6b7280';
        }
    });

    // 翌期チップセクションの表示/非表示
    const nextSection = document.getElementById('next-chips-section');
    if (nextSection) {
        nextSection.style.display = period >= 3 ? 'block' : 'none';
    }

    // 選択期を保存
    window._selectedPeriod = period;

    // デフォルト値を期に応じて更新
    updateDefaultsForPeriod(period);
}

function updateDefaultsForPeriod(period) {
    // 期ごとの標準的な初期状態
    const defaults = {
        2: { cash: 112, equity: 283, loans: 0 },
        3: { cash: 80, equity: 300, loans: 0 },
        4: { cash: 100, equity: 350, loans: 0 },
        5: { cash: 120, equity: 400, loans: 0 }
    };

    const d = defaults[period] || defaults[2];
    const cashInput = document.getElementById('state-cash');
    const equityInput = document.getElementById('state-equity');

    if (cashInput) cashInput.value = d.cash;
    if (equityInput) equityInput.value = d.equity;
}

// ============================================
// 状態分析と提案
// ============================================
function analyzeAndPropose() {
    // 入力値を取得
    const state = getStateFromInputs();

    // モーダルを閉じてローディング表示
    closeModal();
    showModal('分析中...', `
        <div style="text-align: center; padding: 40px;">
            <div style="font-size: 48px; animation: pulse 1s infinite;">🧠</div>
            <div style="margin-top: 15px; font-size: 16px;">AIが最適戦略を分析中...</div>
        </div>
        <style>@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }</style>
    `);

    // 非同期で分析実行
    setTimeout(() => {
        const analysis = performAnalysis(state);
        closeModal();
        showProposalModal(state, analysis);
    }, 500);
}

function getStateFromInputs() {
    return {
        period: window._selectedPeriod || 2,
        cash: parseInt(document.getElementById('state-cash')?.value) || 112,
        equity: parseInt(document.getElementById('state-equity')?.value) || 283,
        loans: parseInt(document.getElementById('state-loans')?.value) || 0,
        workers: parseInt(document.getElementById('state-workers')?.value) || 1,
        salesmen: parseInt(document.getElementById('state-salesmen')?.value) || 1,
        machinesSmall: parseInt(document.getElementById('state-machines-small')?.value) || 1,
        machinesLarge: parseInt(document.getElementById('state-machines-large')?.value) || 0,
        materials: parseInt(document.getElementById('state-materials')?.value) || 1,
        wip: parseInt(document.getElementById('state-wip')?.value) || 2,
        products: parseInt(document.getElementById('state-products')?.value) || 1,
        chips: {
            research: parseInt(document.getElementById('state-chip-research')?.value) || 0,
            education: parseInt(document.getElementById('state-chip-education')?.value) || 0,
            advertising: parseInt(document.getElementById('state-chip-advertising')?.value) || 0,
            computer: 1,
            insurance: 1
        },
        nextPeriodChips: {
            research: parseInt(document.getElementById('state-next-research')?.value) || 0,
            education: parseInt(document.getElementById('state-next-education')?.value) || 0
        }
    };
}

function performAnalysis(state) {
    const mfgCap = calcMfgCapacity(state);
    const salesCap = calcSalesCapacity(state);
    const remainingPeriods = 5 - state.period + 1;
    const targetGap = GAME_RULES.TARGET_EQUITY - state.equity;

    // シミュレーション実行
    const simResults = runSimulations(state, 100);

    // 推奨アクションを決定
    const recommendations = generateRecommendations(state, mfgCap, salesCap, targetGap, remainingPeriods);

    return {
        mfgCap,
        salesCap,
        remainingPeriods,
        targetGap,
        simResults,
        recommendations,
        feasibility: simResults.successRate >= 50 ? 'high' : simResults.successRate >= 20 ? 'medium' : 'low'
    };
}

function runSimulations(initialState, runs) {
    let successCount = 0;
    let totalEquity = 0;
    let maxEquity = -9999;
    let minEquity = 9999;

    for (let i = 0; i < runs; i++) {
        const result = simulateGame(initialState);
        if (result.equity >= GAME_RULES.TARGET_EQUITY) successCount++;
        totalEquity += result.equity;
        maxEquity = Math.max(maxEquity, result.equity);
        minEquity = Math.min(minEquity, result.equity);
    }

    return {
        runs,
        successRate: Math.round(successCount / runs * 100),
        avgEquity: Math.round(totalEquity / runs),
        maxEquity,
        minEquity
    };
}

function simulateGame(initialState) {
    let state = JSON.parse(JSON.stringify(initialState));

    for (let period = state.period; period <= 5; period++) {
        state = simulatePeriod(state, period);
    }

    return { equity: state.equity };
}

function simulatePeriod(inputState, period) {
    let state = JSON.parse(JSON.stringify(inputState));
    const maxRows = GAME_RULES.MAX_ROWS[period];
    let row = 1;
    let sales = 0, matCost = 0, procCost = 0;

    // 人件費
    const wageMulti = period >= 3 ? (0.9 + Math.random() * 0.3) : 1.0;
    const wage = Math.round(GAME_RULES.WAGE_BASE[period] * wageMulti);

    // === 期首処理 ===

    // 3期以降借入（動的借入戦略）
    if (period >= 3 && state.cash < GAME_RULES.BORROW_STRATEGY.DYNAMIC_THRESHOLD) {
        const maxLoan = calcMaxLoan(period, state.equity);
        let targetBorrow = 0;

        if (period === 3) {
            // 3期は少額（段階的借入の1回目）
            targetBorrow = Math.min(GAME_RULES.BORROW_STRATEGY.STAGED_3, maxLoan);
        } else if (period === 4) {
            // 4期は追加（段階的借入の2回目）
            targetBorrow = Math.min(GAME_RULES.BORROW_STRATEGY.STAGED_4, maxLoan - state.loans);
        } else {
            // 5期は動的
            targetBorrow = Math.min(GAME_RULES.BORROW_STRATEGY.DYNAMIC_AMOUNT, maxLoan - state.loans);
        }

        if (targetBorrow > 0) {
            state.loans += targetBorrow;
            state.cash += targetBorrow - Math.floor(targetBorrow * GAME_RULES.LONG_TERM_RATE);
        }
    }

    // PC・保険
    state.chips.computer = 1;
    state.chips.insurance = 1;
    state.cash -= GAME_RULES.CHIP_COST + GAME_RULES.INSURANCE_COST;
    row++;

    // 翌期チップ適用
    if (state.nextPeriodChips) {
        state.chips.research += state.nextPeriodChips.research || 0;
        state.chips.education += state.nextPeriodChips.education || 0;
        state.nextPeriodChips = { research: 0, education: 0 };
    }

    // === 2期：チップ購入 ===
    if (period === 2) {
        // 研究2枚 + 教育1枚 + 翌期研究1枚（推奨戦略）
        const targetR = Math.max(0, 2 - (state.chips.research || 0));
        const targetE = Math.max(0, 1 - (state.chips.education || 0));

        for (let i = 0; i < targetR && state.cash >= GAME_RULES.CHIP_COST; i++) {
            state.chips.research++; state.cash -= GAME_RULES.CHIP_COST; row++;
        }
        for (let i = 0; i < targetE && state.cash >= GAME_RULES.CHIP_COST; i++) {
            state.chips.education++; state.cash -= GAME_RULES.CHIP_COST; row++;
        }
        // 翌期チップ
        if (state.cash >= GAME_RULES.CHIP_COST) {
            state.nextPeriodChips = state.nextPeriodChips || {};
            state.nextPeriodChips.research = (state.nextPeriodChips.research || 0) + 1;
            state.cash -= GAME_RULES.CHIP_COST; row++;
        }
    }

    // === 3期：機械投資 ===
    if (period === 3 && state.cash >= 120) {
        // 小型機械追加（オプション）
        // state.machinesSmall++; state.cash -= 100;
        // state.workers++; state.cash -= 20;
    }

    // === メインループ ===
    const mc = calcMfgCapacity(state);
    const sc = calcSalesCapacity(state);

    while (row < maxRows) {
        // リスクカード
        if (Math.random() < GAME_RULES.RISK_PROBABILITY) {
            applyRisk(state, period);
            row++;
            continue;
        }

        // 販売
        if (state.products > 0 && sc > 0) {
            const sellQty = Math.min(state.products, sc);
            const bidInfo = GAME_RULES.BID_WIN_RATES[Math.min(state.chips.research, 5)];
            if (Math.random() < bidInfo.winRate) {
                const rev = sellQty * bidInfo.price;
                state.products -= sellQty;
                state.cash += rev;
                sales += rev;
            }
            row++;
            continue;
        }

        // 完成
        if (state.wip > 0 && mc > 0) {
            const qty = Math.min(state.wip, mc, GAME_RULES.PRODUCT_BASE - state.products);
            if (qty > 0) {
                state.wip -= qty;
                state.products += qty;
                state.cash -= qty;
                procCost += qty;

                // 同時投入
                const inpQty = Math.min(state.materials, mc, GAME_RULES.WIP_CAPACITY - state.wip);
                if (inpQty > 0) {
                    state.materials -= inpQty;
                    state.wip += inpQty;
                    state.cash -= inpQty;
                    procCost += inpQty;
                }
            }
            row++;
            continue;
        }

        // 投入
        if (state.materials > 0 && state.wip < GAME_RULES.WIP_CAPACITY && mc > 0) {
            const qty = Math.min(state.materials, mc, GAME_RULES.WIP_CAPACITY - state.wip);
            if (qty > 0) {
                state.materials -= qty;
                state.wip += qty;
                state.cash -= qty;
                procCost += qty;
            }
            row++;
            continue;
        }

        // 仕入れ
        const space = GAME_RULES.MATERIAL_BASE - state.materials;
        if (space > 0 && state.cash >= 10) {
            const price = 10 + Math.floor(Math.random() * 4);
            const qty = Math.min(mc * 2, space, Math.floor(state.cash / price));
            if (qty > 0) {
                state.materials += qty;
                state.cash -= qty * price;
                matCost += qty * price;
            }
            row++;
            continue;
        }

        break;
    }

    // === 期末計算 ===
    const machCount = state.machinesSmall + (state.machinesLarge || 0);
    const persCount = state.workers + state.salesmen;
    const machCost = machCount * wage;
    const persCost = persCount * wage;
    const deprec = state.machinesSmall * 10 + (state.machinesLarge || 0) * 20;
    const chipCost = (state.chips.research + state.chips.education + (state.chips.advertising || 0) + 1) * 20 + 5;

    const fixedCost = machCost + persCost + deprec + chipCost;
    const MQ = sales - matCost - procCost;
    const opProfit = MQ - fixedCost;
    const interest = Math.floor(state.loans * 0.10);
    const preTax = opProfit - interest;

    let tax = 0;
    const newEq = state.equity + preTax;
    if (newEq > 300) {
        if (!state.hasExceeded300) {
            tax = Math.round((newEq - 300) * 0.5);
            state.hasExceeded300 = true;
        } else if (preTax > 0) {
            tax = Math.round(preTax * 0.5);
        }
    }

    state.cash -= fixedCost + tax;
    if (state.cash < 0) {
        const loan = Math.ceil(-state.cash / 40) * 50;
        state.shortLoans = (state.shortLoans || 0) + loan;
        state.cash += loan * 0.8;
    }

    state.equity += preTax - tax;
    return state;
}

function applyRisk(state, period) {
    const r = Math.random();
    if (r < 0.15) {
        // F追加
    } else if (r < 0.25) {
        if (period > 2) state.cash = Math.max(0, state.cash - 30);
    } else if (r < 0.30) {
        if (state.chips.research > 0) state.chips.research--;
    } else if (r < 0.35) {
        if (state.wip > 0) state.wip--;
    }
}

function generateRecommendations(state, mfgCap, salesCap, targetGap, remainingPeriods) {
    const recs = [];

    // === 2期の推奨（最重要）===
    if (state.period === 2) {
        // 研究チップ不足
        if ((state.chips.research || 0) < 2) {
            recs.push({
                priority: 1,
                action: '研究チップ購入',
                detail: `研究チップを${2 - (state.chips.research || 0)}枚購入（¥${(2 - (state.chips.research || 0)) * 20}）`,
                reason: '研究2枚で名古屋¥28市場確保（勝率70%）',
                icon: '🔬'
            });
        }

        // 教育チップ不足
        if ((state.chips.education || 0) < 1) {
            recs.push({
                priority: 2,
                action: '教育チップ購入',
                detail: '教育チップを1枚購入（¥20）',
                reason: '製造能力+1、販売能力+1で生産効率UP',
                icon: '📚'
            });
        }

        // 翌期チップ（成功率+12%の効果！）
        if (state.cash >= 80) {
            recs.push({
                priority: 3,
                action: '翌期チップ購入',
                detail: '翌期チップ（研究）1枚購入（¥20）',
                reason: '成功率+12%！3期から研究3枚で勝率78%に',
                icon: '⏰'
            });
        }
    }

    // === 3期の推奨 ===
    if (state.period === 3) {
        // 動的借入（最強戦略）
        const maxLoan = calcMaxLoan(state.period, state.equity);
        if (state.cash < GAME_RULES.BORROW_STRATEGY.DYNAMIC_THRESHOLD && state.loans === 0) {
            const borrowAmount = Math.min(GAME_RULES.BORROW_STRATEGY.STAGED_3, maxLoan);
            recs.push({
                priority: 1,
                action: '長期借入（段階1）',
                detail: `¥${borrowAmount}借入（手取り¥${Math.floor(borrowAmount * 0.9)}）`,
                reason: '段階的借入で成功率93%！3期は少額から',
                icon: '💳'
            });
        }

        // 機械投資（オプション）
        if (state.cash >= 120 && (state.machinesSmall || 0) === 1) {
            recs.push({
                priority: 4,
                action: '小型機械追加',
                detail: '小型機械¥100 + ワーカー¥20',
                reason: '製造能力2倍で生産量UP（成功率+3%）',
                icon: '⚙️'
            });
        }
    }

    // === 4期の推奨 ===
    if (state.period === 4) {
        const maxLoan = calcMaxLoan(state.period, state.equity);
        // 段階的借入の2回目
        if (state.cash < 80 && state.loans < 50) {
            const borrowAmount = Math.min(GAME_RULES.BORROW_STRATEGY.STAGED_4, maxLoan - state.loans);
            if (borrowAmount > 0) {
                recs.push({
                    priority: 1,
                    action: '長期借入（段階2）',
                    detail: `¥${borrowAmount}追加借入（手取り¥${Math.floor(borrowAmount * 0.9)}）`,
                    reason: '4期追加借入で運転資金確保',
                    icon: '💳'
                });
            }
        }
    }

    // === 5期の推奨 ===
    if (state.period === 5) {
        if (targetGap > 0) {
            const neededSales = Math.ceil(targetGap / 14); // 粗利14円/個想定
            recs.push({
                priority: 1,
                action: '目標達成へ',
                detail: `あと¥${targetGap}（約${neededSales}個販売）`,
                reason: '全力で販売し目標¥450達成を目指す',
                icon: '🎯'
            });
        }
    }

    // === 共通推奨 ===
    // 製品販売
    if (state.products > 0 && salesCap > 0) {
        const bidInfo = GAME_RULES.BID_WIN_RATES[Math.min(state.chips.research || 0, 5)];
        recs.push({
            priority: 10,
            action: '商品販売',
            detail: `${bidInfo.market}¥${bidInfo.price}で販売`,
            reason: `研究${state.chips.research || 0}枚で勝率${Math.round(bidInfo.winRate * 100)}%`,
            icon: '💰'
        });
    }

    // 製造
    if (state.wip > 0 && mfgCap > 0 && state.products < GAME_RULES.PRODUCT_BASE) {
        recs.push({
            priority: 11,
            action: '製品完成',
            detail: `仕掛品${state.wip}個を完成`,
            reason: `製造能力${mfgCap}で最大${Math.min(state.wip, mfgCap)}個完成可能`,
            icon: '🏭'
        });
    }

    // 仕入れ
    if (state.materials < 5 && state.cash >= 50) {
        recs.push({
            priority: 12,
            action: '材料仕入れ',
            detail: '安価市場で材料購入',
            reason: '仙台¥10 > 札幌¥11 > 福岡¥12の順で狙う',
            icon: '🧱'
        });
    }

    // ソート
    recs.sort((a, b) => a.priority - b.priority);
    return recs;
}

// 借入限度額計算
function calcMaxLoan(period, equity) {
    if (period < 3) return 0;
    const multiplier = (period >= 4 && equity > 300) ? 1.0 : 0.5;
    return Math.floor(equity * multiplier);
}

// ============================================
// 行数別アクション計画（期首処理・リスク考慮）
// ============================================
function generateRowByRowPlan(state) {
    const period = state.period;
    const maxRows = GAME_RULES.MAX_ROWS[period] || 30;
    const mfgCap = calcMfgCapacity(state);
    const salesCap = calcSalesCapacity(state);
    const plan = [];

    // 期首処理（必須・1-2行目）
    plan.push({
        row: '1-2',
        action: '期首処理',
        detail: 'PC・保険購入（必須）、チップ適用',
        type: 'required',
        icon: '📋'
    });

    // 2期: チップ購入フェーズ（3-7行目）
    if (period === 2) {
        plan.push({
            row: '3-4',
            action: '研究チップ購入',
            detail: '研究2枚（¥40）- 名古屋¥28市場確保',
            type: 'investment',
            icon: '🔬'
        });
        plan.push({
            row: '5',
            action: '教育チップ購入',
            detail: '教育1枚（¥20）- 製造+1、販売+1',
            type: 'investment',
            icon: '📚'
        });
        plan.push({
            row: '6',
            action: '翌期チップ購入',
            detail: '翌期研究1枚（¥20）- 成功率+12%',
            type: 'investment',
            icon: '⏰'
        });
    }

    // 3期以降: 借入判断（期首直後）
    if (period >= 3 && state.cash < 60) {
        const maxLoan = calcMaxLoan(period, state.equity);
        const borrowAmt = period === 3 ? 30 : 70;
        plan.push({
            row: '3',
            action: '長期借入',
            detail: `¥${Math.min(borrowAmt, maxLoan)}借入（動的戦略）`,
            type: 'finance',
            icon: '💳'
        });
    }

    // 3期: 機械投資オプション
    if (period === 3 && state.cash >= 120) {
        plan.push({
            row: '4-5',
            action: '【オプション】機械投資',
            detail: '小型機械¥100 + ワーカー¥20',
            type: 'optional',
            icon: '⚙️'
        });
        // アタッチメントオプション
        if (state.machinesSmall >= 1 && state.cash >= 150) {
            plan.push({
                row: '6',
                action: '【オプション】アタッチメント',
                detail: 'アタッチメント¥30 - 製造能力+1',
                type: 'optional',
                icon: '🔧'
            });
        }
    }

    // 生産サイクル（メインフェーズ）
    let currentRow = period === 2 ? 7 : 4;
    const cycleRows = Math.floor((maxRows - currentRow) / 4);  // 約4行で1サイクル

    for (let cycle = 1; cycle <= Math.min(cycleRows, 5); cycle++) {
        const startRow = currentRow + (cycle - 1) * 4;

        // 仕入れ
        plan.push({
            row: `${startRow}`,
            action: '材料仕入れ',
            detail: `仙台¥10狙い（${mfgCap * 2}個まで）`,
            type: 'production',
            icon: '🧱'
        });

        // 投入・完成
        plan.push({
            row: `${startRow + 1}`,
            action: '投入・完成',
            detail: `仕掛品→製品（製造能力${mfgCap}）`,
            type: 'production',
            icon: '🏭'
        });

        // 販売
        plan.push({
            row: `${startRow + 2}-${startRow + 3}`,
            action: '販売',
            detail: `名古屋¥28で販売（販売能力${salesCap}）`,
            type: 'sales',
            icon: '💰'
        });
    }

    // リスクカード注意（約20%の確率で発生）
    plan.push({
        row: '随時',
        action: '⚠️ リスクカード',
        detail: '約20%で発生（保険で軽減可）',
        type: 'risk',
        icon: '🎲'
    });

    // 期末準備
    plan.push({
        row: `${maxRows - 2}～`,
        action: '期末準備',
        detail: '在庫確保・現金確保で期末支払に備える',
        type: 'required',
        icon: '📊'
    });

    return plan;
}

// ============================================
// 提案結果モーダル（簡素化版）
// ============================================
function showProposalModal(state, analysis) {
    // 推奨アクションのみ表示（シンプル版）
    let html = `
        <div style="max-height: 70vh; overflow-y: auto; padding: 5px;">
            <!-- 現在状態（コンパクト） -->
            <div style="background: #f8fafc; border-radius: 10px; padding: 12px; margin-bottom: 12px;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 13px;">
                    <div>💰 現金: <b>¥${state.cash}</b></div>
                    <div>🎯 目標まで: <b>¥${analysis.targetGap}</b></div>
                    <div>🔧 製造: <b>${analysis.mfgCap}</b> / 📢 販売: <b>${analysis.salesCap}</b></div>
                    <div>🔬 研究: <b>${state.chips.research || 0}枚</b></div>
                </div>
            </div>

            <!-- 今すぐやるべきこと（TOP 3） -->
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 12px; padding: 15px; margin-bottom: 12px;">
                <div style="color: white; font-weight: bold; margin-bottom: 10px; font-size: 15px;">今すぐやるべきこと</div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${analysis.recommendations.slice(0, 3).map((rec, i) => `
                        <div style="background: white; border-radius: 8px; padding: 10px; display: flex; align-items: center; gap: 10px;">
                            <div style="background: #4f46e5; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; flex-shrink: 0;">${i + 1}</div>
                            <div style="font-size: 20px; flex-shrink: 0;">${rec.icon}</div>
                            <div style="flex: 1;">
                                <div style="font-weight: bold; color: #1f2937; font-size: 14px;">${rec.action}</div>
                                <div style="font-size: 11px; color: #6b7280;">${rec.detail}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 期の行動計画（折りたたみ可能） -->
            <details style="background: #fef3c7; border-radius: 10px; padding: 12px; margin-bottom: 12px;">
                <summary style="font-weight: bold; color: #92400e; cursor: pointer; font-size: 13px;">
                    📋 ${state.period}期の行動計画を見る
                </summary>
                <div style="margin-top: 10px; max-height: 150px; overflow-y: auto;">
                    ${generateRowByRowPlan(state).slice(0, 8).map(item => `
                        <div style="padding: 4px 0; font-size: 12px; border-bottom: 1px dashed #e5e7eb;">
                            <span style="color: #666;">${item.row}行</span> ${item.icon} ${item.action}
                        </div>
                    `).join('')}
                </div>
            </details>

            <!-- 閉じるボタン -->
            <button onclick="closeModal()"
                style="width: 100%; padding: 14px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 15px;">
                閉じる
            </button>
        </div>
    `;

    showModal('🤖 AI提案', html);
}

// ============================================
// 従来のカスタムゲーム設定（互換性維持）
// ============================================
function showCustomGameSetupModal() {
    showStateInputModal();
}

function runOptimalSimulation() {
    const state = getStateFromInputs ? getStateFromInputs() : {
        period: 2,
        cash: 112,
        equity: 283,
        loans: 0,
        workers: 1,
        salesmen: 1,
        machinesSmall: 1,
        machinesLarge: 0,
        materials: 1,
        wip: 2,
        products: 1,
        chips: { research: 0, education: 0, advertising: 0, computer: 1, insurance: 1 }
    };

    analyzeAndPropose();
}

// ============================================
// グローバルエクスポート
// ============================================
if (typeof window !== 'undefined') {
    window.showStateInputModal = showStateInputModal;
    window.showCustomGameSetupModal = showCustomGameSetupModal;
    window.runOptimalSimulation = runOptimalSimulation;
    window.analyzeAndPropose = analyzeAndPropose;
    window.selectPeriod = selectPeriod;
    window.adjustValue = adjustValue;
    window.getStateFromInputs = getStateFromInputs;
    window.GAME_RULES = GAME_RULES;
    window.calcMfgCapacity = calcMfgCapacity;
    window.calcSalesCapacity = calcSalesCapacity;
    window.calcMaxLoan = calcMaxLoan;
    window.generateRecommendations = generateRecommendations;
    window.generateRowByRowPlan = generateRowByRowPlan;
}
