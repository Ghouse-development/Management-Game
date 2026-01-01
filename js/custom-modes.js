/**
 * MG (Management Game) - カスタムモード & AIシミュレーションエンジン
 *
 * 特徴:
 * - モンテカルロシミュレーションで最適戦略を探索
 * - リスクカード確率を考慮（20%）
 * - 機械種類（小型¥60/大型¥100）対応
 * - 各期・各行の詳細アクション計画
 */

// ============================================
// 定数定義
// ============================================

const SIM_CONFIG = {
    SIMULATION_RUNS: 100,           // シミュレーション回数
    RISK_CARD_PROBABILITY: 0.20,    // リスクカード確率（1/5）
    TARGET_EQUITY: 450,             // 目標自己資本

    // 機械コスト
    MACHINE_SMALL: { cost: 60, capacity: 1, name: '小型機械' },
    MACHINE_LARGE: { cost: 100, capacity: 2, name: '大型機械' },

    // 人件費（期ごと）
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },

    // 市場データ
    MARKETS: {
        BUY: [
            { name: '名古屋', price: 12 },
            { name: '広島', price: 13 },
            { name: '福岡', price: 14 },
            { name: '大阪', price: 15 }
        ],
        SELL: [
            { name: '東京', price: 40, available: [2, 3, 4, 5] },
            { name: '名古屋', price: 38, available: [2, 3, 4, 5] },
            { name: '札幌', price: 34, available: [2, 3, 4, 5], closedIf: 'dice >= 4' },
            { name: '仙台', price: 32, available: [2], closedAfter: 2 },
            { name: '大阪', price: 28, available: [2, 3, 4, 5], priceVaries: true }
        ]
    },

    // リスクカード影響（平均損失）
    RISK_EFFECTS: {
        MATERIAL_LOSS: 20,      // 材料損失
        PRODUCT_LOSS: 30,       // 製品損失
        CASH_LOSS: 15,          // 現金損失
        SKIP_TURN: 1            // ターンスキップ
    }
};

// ============================================
// シミュレーションエンジン
// ============================================

class MGSimulator {
    constructor(initialState) {
        this.initialState = { ...initialState };
        this.results = [];
    }

    // 複数回シミュレーション実行
    runMultipleSimulations(numRuns = SIM_CONFIG.SIMULATION_RUNS) {
        this.results = [];

        for (let i = 0; i < numRuns; i++) {
            const result = this.runSingleSimulation();
            this.results.push(result);
        }

        return this.analyzeResults();
    }

    // 単一シミュレーション実行
    runSingleSimulation() {
        let state = this.createInitialState();
        const periodResults = [];

        for (let period = state.period; period <= 5; period++) {
            const periodResult = this.simulatePeriod(state, period);
            periodResults.push(periodResult);
            state = periodResult.endState;
        }

        return {
            periodResults,
            finalEquity: state.equity,
            success: state.equity >= SIM_CONFIG.TARGET_EQUITY
        };
    }

    // 初期状態作成
    createInitialState() {
        return {
            period: this.initialState.period || 2,
            cash: this.initialState.cash || 300,
            equity: this.initialState.equity || 300,
            loans: this.initialState.loans || 0,
            shortLoans: this.initialState.shortLoans || 0,
            workers: this.initialState.workers || 4,
            salesmen: this.initialState.salesmen || 4,
            machinesSmall: this.initialState.machinesSmall || 4,
            machinesLarge: this.initialState.machinesLarge || 0,
            materials: this.initialState.materials || 0,
            wip: this.initialState.wip || 0,
            products: this.initialState.products || 0,
            chips: {
                research: this.initialState.chips?.research || 0,
                education: this.initialState.chips?.education || 0,
                advertising: this.initialState.chips?.advertising || 0,
                computer: this.initialState.chips?.computer || 1,
                insurance: this.initialState.chips?.insurance || 1
            }
        };
    }

    // 期間シミュレーション
    simulatePeriod(state, period) {
        const maxRows = MAX_ROWS_BY_PERIOD[period] || 20;
        const actions = [];
        let currentState = { ...state };
        let row = 2;

        // 期首処理（給与計算用）
        const wageBase = SIM_CONFIG.WAGE_BASE[period];
        const wageMultiplier = period >= 3 ? (Math.random() < 0.5 ? 1.1 : 1.2) : 1.0;
        const adjustedWage = Math.round(wageBase * wageMultiplier);

        // 製造・販売能力計算
        const getMfgCapacity = (s) => Math.min(s.workers, s.machinesSmall + s.machinesLarge * 2);
        const getSalesCapacity = (s) => Math.floor(s.salesmen * 1.5);

        // 戦略決定：能力構築フェーズ
        const targetCapacity = period <= 3 ? 5 : 6;

        // Phase 1: 能力構築（必要なら）
        if (getMfgCapacity(currentState) < targetCapacity) {
            // ワーカー不足
            if (currentState.workers < targetCapacity && currentState.cash >= 20) {
                const hire = Math.min(targetCapacity - currentState.workers, Math.floor(currentState.cash / 20));
                if (hire > 0) {
                    currentState.workers += hire;
                    currentState.cash -= hire * 20;
                    actions.push({
                        row: row++,
                        action: '採用',
                        detail: `ワーカー+${hire}人`,
                        cashChange: -hire * 20
                    });
                }
            }

            // 機械不足
            const machineCapacity = currentState.machinesSmall + currentState.machinesLarge * 2;
            if (machineCapacity < targetCapacity && currentState.cash >= 60) {
                // 大型機械優先（コスパが良い）
                if (currentState.cash >= 100) {
                    currentState.machinesLarge++;
                    currentState.cash -= 100;
                    actions.push({
                        row: row++,
                        action: '設備投資',
                        detail: '大型機械+1台',
                        cashChange: -100
                    });
                } else {
                    currentState.machinesSmall++;
                    currentState.cash -= 60;
                    actions.push({
                        row: row++,
                        action: '設備投資',
                        detail: '小型機械+1台',
                        cashChange: -60
                    });
                }
            }
        }

        // セールスマン不足
        if (getSalesCapacity(currentState) < targetCapacity && currentState.cash >= 20) {
            const hire = Math.min(Math.ceil((targetCapacity - getSalesCapacity(currentState)) / 1.5), Math.floor(currentState.cash / 20));
            if (hire > 0) {
                currentState.salesmen += hire;
                currentState.cash -= hire * 20;
                actions.push({
                    row: row++,
                    action: '採用',
                    detail: `セールス+${hire}人`,
                    cashChange: -hire * 20
                });
            }
        }

        // チップ購入（研究チップ優先）
        if (currentState.chips.research < 2 && currentState.cash >= 20 && row < maxRows - 10) {
            currentState.chips.research++;
            currentState.cash -= 20;
            actions.push({
                row: row++,
                action: '戦略チップ',
                detail: '研究チップ購入',
                cashChange: -20
            });
        }

        // Phase 2: 製販サイクル
        let totalSales = 0;
        let totalMaterialCost = 0;
        const mfgCap = getMfgCapacity(currentState);
        const salesCap = getSalesCapacity(currentState);
        const cycleCapacity = Math.min(mfgCap, salesCap);

        // 何サイクル回せるか
        const availableRows = maxRows - row - 3; // 予備3行
        const rowsPerCycle = 4; // 仕入→投入→完成→販売
        const maxCycles = Math.floor(availableRows / rowsPerCycle);

        for (let cycle = 0; cycle < maxCycles && cycle < 3; cycle++) {
            // リスクカードチェック（各アクションで20%の確率）
            const riskOccurred = Math.random() < SIM_CONFIG.RISK_CARD_PROBABILITY;

            if (riskOccurred && cycle > 0) {
                // リスク発生（材料/製品損失など）
                const riskLoss = Math.floor(Math.random() * 20) + 10;
                currentState.cash -= Math.min(riskLoss, currentState.cash);
                actions.push({
                    row: row++,
                    action: 'リスクカード',
                    detail: `損失発生 -¥${riskLoss}`,
                    cashChange: -riskLoss,
                    isRisk: true
                });
                continue;
            }

            // 仕入れ
            const buyQty = cycleCapacity;
            const buyPrice = 12; // 名古屋最安
            const buyCost = buyQty * buyPrice;
            if (currentState.cash >= buyCost) {
                currentState.materials += buyQty;
                currentState.cash -= buyCost;
                totalMaterialCost += buyCost;
                actions.push({
                    row: row++,
                    action: '材料仕入',
                    detail: `名古屋¥${buyPrice}×${buyQty}個`,
                    cashChange: -buyCost
                });
            } else {
                break; // 資金不足で終了
            }

            // 投入
            const inputQty = Math.min(currentState.materials, mfgCap);
            currentState.wip += inputQty;
            currentState.materials -= inputQty;
            actions.push({
                row: row++,
                action: '完成・投入',
                detail: `投入: ${inputQty}個→仕掛品`,
                cashChange: 0
            });

            // 完成
            currentState.products += currentState.wip;
            currentState.wip = 0;
            actions.push({
                row: row++,
                action: '完成・投入',
                detail: `完成: ${inputQty}個→製品`,
                cashChange: 0
            });

            // 販売
            const sellQty = Math.min(currentState.products, salesCap);
            const sellPrice = period === 2 ? 40 : (period === 3 ? 38 : 36); // 東京/名古屋
            const revenue = sellQty * sellPrice;
            currentState.products -= sellQty;
            currentState.cash += revenue;
            totalSales += revenue;
            actions.push({
                row: row++,
                action: '商品販売',
                detail: `東京¥${sellPrice}×${sellQty}個 = ¥${revenue}`,
                cashChange: revenue
            });
        }

        // 残り製品があれば追加販売
        if (currentState.products > 0 && row < maxRows - 1) {
            const sellQty = Math.min(currentState.products, salesCap);
            const sellPrice = 36;
            const revenue = sellQty * sellPrice;
            currentState.products -= sellQty;
            currentState.cash += revenue;
            totalSales += revenue;
            actions.push({
                row: row++,
                action: '商品販売',
                detail: `追加販売 ¥${sellPrice}×${sellQty}個`,
                cashChange: revenue
            });
        }

        // 期末処理
        actions.push({
            row: maxRows,
            action: '期末処理',
            detail: '決算処理',
            cashChange: 0
        });

        // 固定費計算
        const machineCost = (currentState.machinesSmall + currentState.machinesLarge) * adjustedWage;
        const workerCost = currentState.workers * adjustedWage;
        const salesmanCost = currentState.salesmen * adjustedWage;
        const personnelCost = (currentState.workers + currentState.salesmen) * Math.round(adjustedWage / 2);
        const salaryCost = machineCost + workerCost + salesmanCost + personnelCost;

        // チップ費用
        const chipCost = (currentState.chips.research + currentState.chips.education + currentState.chips.advertising) * 20
            + currentState.chips.computer * 20
            + currentState.chips.insurance * 5;

        const fixedCost = salaryCost + chipCost;

        // G計算（売上 - 原価）
        const grossProfit = totalSales - totalMaterialCost;

        // 経常利益
        const operatingProfit = grossProfit - fixedCost;

        // 金利
        const interest = Math.floor(currentState.loans * 0.1) + Math.floor(currentState.shortLoans * 0.2);

        // 税引前利益
        const preTaxProfit = operatingProfit - interest;

        // 税金・配当
        const tax = preTaxProfit > 0 ? Math.floor(preTaxProfit * 0.4) : 0;
        const dividend = preTaxProfit > 0 ? Math.floor(preTaxProfit * 0.1) : 0;

        // 純利益
        const netProfit = preTaxProfit - tax - dividend;

        // 期末キャッシュ支払い
        currentState.cash -= salaryCost;

        // 自己資本更新
        currentState.equity += netProfit;

        return {
            period,
            actions,
            financials: {
                totalSales,
                materialCost: totalMaterialCost,
                grossProfit,
                salaryCost,
                fixedCost,
                operatingProfit,
                interest,
                preTaxProfit,
                tax,
                dividend,
                netProfit
            },
            endState: currentState,
            rowsUsed: row
        };
    }

    // 結果分析
    analyzeResults() {
        const successCount = this.results.filter(r => r.success).length;
        const successRate = (successCount / this.results.length) * 100;

        // 平均最終自己資本
        const avgFinalEquity = Math.round(
            this.results.reduce((sum, r) => sum + r.finalEquity, 0) / this.results.length
        );

        // 最良結果
        const bestResult = this.results.reduce((best, r) =>
            r.finalEquity > best.finalEquity ? r : best
        );

        // 期ごとの平均
        const periodAverages = [];
        for (let p = this.initialState.period || 2; p <= 5; p++) {
            const periodData = this.results.map(r =>
                r.periodResults.find(pr => pr.period === p)
            ).filter(Boolean);

            if (periodData.length > 0) {
                periodAverages.push({
                    period: p,
                    avgSales: Math.round(periodData.reduce((s, d) => s + d.financials.totalSales, 0) / periodData.length),
                    avgG: Math.round(periodData.reduce((s, d) => s + d.financials.grossProfit, 0) / periodData.length),
                    avgProfit: Math.round(periodData.reduce((s, d) => s + d.financials.netProfit, 0) / periodData.length),
                    avgEquity: Math.round(periodData.reduce((s, d) => s + d.endState.equity, 0) / periodData.length)
                });
            }
        }

        return {
            successRate,
            avgFinalEquity,
            bestResult,
            periodAverages,
            totalSimulations: this.results.length
        };
    }
}

// ============================================
// 最適戦略生成
// ============================================

function generateOptimalStrategy(initialState) {
    const simulator = new MGSimulator(initialState);
    const analysis = simulator.runMultipleSimulations(SIM_CONFIG.SIMULATION_RUNS);

    // 最良結果から詳細計画を生成
    const bestPlan = analysis.bestResult.periodResults.map(pr => ({
        period: pr.period,
        actions: pr.actions,
        financials: pr.financials,
        endState: pr.endState,
        summary: {
            workers: pr.endState.workers,
            salesmen: pr.endState.salesmen,
            machinesSmall: pr.endState.machinesSmall,
            machinesLarge: pr.endState.machinesLarge,
            totalMachineCapacity: pr.endState.machinesSmall + pr.endState.machinesLarge * 2,
            mfgCapacity: Math.min(pr.endState.workers, pr.endState.machinesSmall + pr.endState.machinesLarge * 2),
            salesCapacity: Math.floor(pr.endState.salesmen * 1.5),
            equity: pr.endState.equity
        }
    }));

    return {
        analysis,
        bestPlan,
        recommendations: generateRecommendations(analysis, initialState)
    };
}

function generateRecommendations(analysis, initialState) {
    const recs = [];

    if (analysis.successRate < 50) {
        recs.push({
            type: 'warning',
            text: '現在の状態では目標達成が困難です。積極的な戦略変更が必要。'
        });
    }

    if (initialState.workers < 5) {
        recs.push({
            type: 'action',
            text: `ワーカーを${5 - initialState.workers}人追加して製造能力を強化`
        });
    }

    if (initialState.machinesSmall + (initialState.machinesLarge || 0) * 2 < 5) {
        recs.push({
            type: 'action',
            text: '大型機械(¥100, 能力2)の追加を検討。コスパが良い。'
        });
    }

    if ((initialState.chips?.research || 0) < 2) {
        recs.push({
            type: 'action',
            text: '研究チップを2枚以上確保。入札で有利になる。'
        });
    }

    return recs;
}

// ============================================
// カスタム条件入力モーダル
// ============================================

function showCustomGameSetupModal() {
    const content = `
        <div style="max-height: 75vh; overflow-y: auto; padding: 10px;">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 12px; border-radius: 10px; margin-bottom: 12px; text-align: center;">
                <div style="font-size: 16px; font-weight: bold;">カスタム条件でゲーム開始</div>
            </div>

            <!-- 基本設定 -->
            <div style="background: #f3f4f6; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="font-weight: bold; margin-bottom: 6px; font-size: 12px;">基本設定</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div>
                        <label style="font-size: 10px; color: #666;">開始期</label>
                        <select id="custom-period" style="width: 100%; padding: 5px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;">
                            <option value="2">2期</option>
                            <option value="3">3期</option>
                            <option value="4">4期</option>
                            <option value="5">5期</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #666;">開始行</label>
                        <input type="number" id="custom-row" value="2" min="1" max="30" style="width: 100%; padding: 5px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;">
                    </div>
                </div>
            </div>

            <!-- 財務 -->
            <div style="background: #dbeafe; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="font-weight: bold; margin-bottom: 6px; font-size: 12px; color: #1e40af;">財務</div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 11px;">
                    <div>
                        <label style="color: #666;">現金</label>
                        <input type="number" id="custom-cash" value="300" step="10" style="width: 100%; padding: 4px; border: 1px solid #93c5fd; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">自己資本</label>
                        <input type="number" id="custom-equity" value="300" step="10" style="width: 100%; padding: 4px; border: 1px solid #93c5fd; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">長期借入</label>
                        <input type="number" id="custom-long-loan" value="0" step="50" style="width: 100%; padding: 4px; border: 1px solid #93c5fd; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">短期借入</label>
                        <input type="number" id="custom-short-loan" value="0" step="50" style="width: 100%; padding: 4px; border: 1px solid #93c5fd; border-radius: 4px;">
                    </div>
                </div>
            </div>

            <!-- 人員・機械 -->
            <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="font-weight: bold; margin-bottom: 6px; font-size: 12px; color: #92400e;">人員・機械</div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 11px;">
                    <div>
                        <label style="color: #666;">ワーカー</label>
                        <input type="number" id="custom-workers" value="4" min="0" max="10" style="width: 100%; padding: 4px; border: 1px solid #fcd34d; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">セールス</label>
                        <input type="number" id="custom-salesmen" value="4" min="0" max="10" style="width: 100%; padding: 4px; border: 1px solid #fcd34d; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">小型機械(¥60)</label>
                        <input type="number" id="custom-machines-small" value="4" min="0" max="10" style="width: 100%; padding: 4px; border: 1px solid #fcd34d; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">大型機械(¥100)</label>
                        <input type="number" id="custom-machines-large" value="0" min="0" max="5" style="width: 100%; padding: 4px; border: 1px solid #fcd34d; border-radius: 4px;">
                    </div>
                </div>
            </div>

            <!-- 在庫・チップ -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                <div style="background: #e0e7ff; border-radius: 8px; padding: 8px;">
                    <div style="font-weight: bold; margin-bottom: 4px; font-size: 11px; color: #4338ca;">在庫</div>
                    <div style="font-size: 10px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span>材料</span>
                            <input type="number" id="custom-materials" value="0" min="0" style="width: 40px; padding: 2px; border: 1px solid #a5b4fc; border-radius: 2px; text-align: center;">
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span>仕掛品</span>
                            <input type="number" id="custom-wip" value="0" min="0" style="width: 40px; padding: 2px; border: 1px solid #a5b4fc; border-radius: 2px; text-align: center;">
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>製品</span>
                            <input type="number" id="custom-products" value="0" min="0" style="width: 40px; padding: 2px; border: 1px solid #a5b4fc; border-radius: 2px; text-align: center;">
                        </div>
                    </div>
                </div>
                <div style="background: #fae8ff; border-radius: 8px; padding: 8px;">
                    <div style="font-weight: bold; margin-bottom: 4px; font-size: 11px; color: #a21caf;">チップ</div>
                    <div style="font-size: 10px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span>研究(青)</span>
                            <input type="number" id="custom-research" value="0" min="0" max="6" style="width: 30px; padding: 2px; border: 1px solid #e879f9; border-radius: 2px; text-align: center;">
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span>教育(緑)</span>
                            <input type="number" id="custom-education" value="0" min="0" max="6" style="width: 30px; padding: 2px; border: 1px solid #e879f9; border-radius: 2px; text-align: center;">
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>広告(赤)</span>
                            <input type="number" id="custom-advertising" value="0" min="0" max="6" style="width: 30px; padding: 2px; border: 1px solid #e879f9; border-radius: 2px; text-align: center;">
                        </div>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 8px;">
                <button class="submit-btn" onclick="startCustomGame()" style="flex: 2; padding: 10px;">ゲーム開始</button>
                <button class="cancel-btn" onclick="showStartMenu()" style="flex: 1; padding: 10px;">戻る</button>
            </div>
        </div>
    `;

    showModal('カスタム設定', content);
}

function startCustomGame() {
    const period = parseInt(document.getElementById('custom-period').value);
    const row = parseInt(document.getElementById('custom-row').value);
    const cash = parseInt(document.getElementById('custom-cash').value);
    const equity = parseInt(document.getElementById('custom-equity').value);
    const longLoan = parseInt(document.getElementById('custom-long-loan').value);
    const shortLoan = parseInt(document.getElementById('custom-short-loan').value);
    const workers = parseInt(document.getElementById('custom-workers').value);
    const salesmen = parseInt(document.getElementById('custom-salesmen').value);
    const machinesSmall = parseInt(document.getElementById('custom-machines-small').value);
    const machinesLarge = parseInt(document.getElementById('custom-machines-large').value);
    const materials = parseInt(document.getElementById('custom-materials').value);
    const wip = parseInt(document.getElementById('custom-wip').value);
    const products = parseInt(document.getElementById('custom-products').value);
    const research = parseInt(document.getElementById('custom-research').value);
    const education = parseInt(document.getElementById('custom-education').value);
    const advertising = parseInt(document.getElementById('custom-advertising').value);

    deleteSavedGame();
    initializeCompanies();
    initializeCardDeck();

    const player = gameState.companies[0];
    player.cash = cash;
    player.equity = equity;
    player.loans = longLoan;
    player.shortLoans = shortLoan;
    player.workers = workers;
    player.salesmen = salesmen;
    player.machines = machinesSmall + machinesLarge; // 互換性
    player.machinesSmall = machinesSmall;
    player.machinesLarge = machinesLarge;
    player.materials = materials;
    player.wip = wip;
    player.products = products;
    player.chips = {
        research: research,
        education: education,
        advertising: advertising,
        computer: 1,
        insurance: 1
    };
    player.currentRow = row;
    player.rowsUsed = row - 1;

    gameState.currentPeriod = period;
    gameState.currentRow = row;
    gameState.maxRows = MAX_ROWS_BY_PERIOD[period];
    gameState.periodStarted = false;
    gameState.diceRolled = false;

    const randomStartIndex = Math.floor(Math.random() * gameState.companies.length);
    gameState.currentPlayerIndex = randomStartIndex;
    gameState.periodStartPlayerIndex = randomStartIndex;

    closeModal();
    updateDisplay();
    saveGame();

    showToast(`カスタム条件で${period}期${row}行目からスタート！`, 'success', 3000);

    if (randomStartIndex !== 0) {
        setTimeout(() => startPeriod(), 500);
    } else {
        startPeriod();
    }
}

// ============================================
// AI行動提案モーダル
// ============================================

function showAIActionPlanModal() {
    const content = `
        <div style="max-height: 75vh; overflow-y: auto; padding: 10px;">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 15px; border-radius: 12px; margin-bottom: 12px; text-align: center;">
                <div style="font-size: 18px; font-weight: bold;">AI戦略シミュレーター</div>
                <div style="font-size: 11px; opacity: 0.9; margin-top: 4px;">${SIM_CONFIG.SIMULATION_RUNS}回シミュレーションで最適解を探索</div>
            </div>

            <!-- 初期条件入力 -->
            <div style="background: #f3f4f6; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="font-weight: bold; margin-bottom: 6px; font-size: 12px;">現在の状態</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 11px;">
                    <div>
                        <label style="color: #666;">期</label>
                        <select id="plan-period" style="width: 100%; padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;">
                            <option value="2">2期</option>
                            <option value="3">3期</option>
                            <option value="4">4期</option>
                            <option value="5">5期</option>
                        </select>
                    </div>
                    <div>
                        <label style="color: #666;">自己資本</label>
                        <input type="number" id="plan-equity" value="300" step="10" style="width: 100%; padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">現金</label>
                        <input type="number" id="plan-cash" value="300" step="10" style="width: 100%; padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 11px; margin-top: 6px;">
                    <div>
                        <label style="color: #666;">W</label>
                        <input type="number" id="plan-workers" value="4" min="0" max="10" style="width: 100%; padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">S</label>
                        <input type="number" id="plan-salesmen" value="4" min="0" max="10" style="width: 100%; padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">小型機</label>
                        <input type="number" id="plan-machines-small" value="4" min="0" max="10" style="width: 100%; padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">大型機</label>
                        <input type="number" id="plan-machines-large" value="0" min="0" max="5" style="width: 100%; padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 11px; margin-top: 6px;">
                    <div>
                        <label style="color: #666;">研究チップ</label>
                        <input type="number" id="plan-research" value="0" min="0" max="6" style="width: 100%; padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">借入</label>
                        <input type="number" id="plan-loans" value="0" step="50" style="width: 100%; padding: 4px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                    <div style="display: flex; align-items: end;">
                        <button class="submit-btn" onclick="runAISimulation()" style="width: 100%; padding: 6px; font-size: 11px;">
                            シミュレーション実行
                        </button>
                    </div>
                </div>
            </div>

            <div id="simulation-result" style="display: none;"></div>

            <button class="cancel-btn" onclick="showStartMenu()" style="width: 100%; padding: 10px; margin-top: 10px;">戻る</button>
        </div>
    `;

    showModal('AI戦略シミュレーター', content);
}

function runAISimulation() {
    const initialState = {
        period: parseInt(document.getElementById('plan-period').value),
        equity: parseInt(document.getElementById('plan-equity').value),
        cash: parseInt(document.getElementById('plan-cash').value),
        workers: parseInt(document.getElementById('plan-workers').value),
        salesmen: parseInt(document.getElementById('plan-salesmen').value),
        machinesSmall: parseInt(document.getElementById('plan-machines-small').value),
        machinesLarge: parseInt(document.getElementById('plan-machines-large').value),
        loans: parseInt(document.getElementById('plan-loans').value),
        chips: {
            research: parseInt(document.getElementById('plan-research').value)
        }
    };

    // シミュレーション実行
    const strategy = generateOptimalStrategy(initialState);
    displaySimulationResult(strategy, initialState);
}

function displaySimulationResult(strategy, initialState) {
    const { analysis, bestPlan, recommendations } = strategy;

    let html = `
        <!-- 成功率サマリー -->
        <div style="background: ${analysis.successRate >= 70 ? '#dcfce7' : (analysis.successRate >= 40 ? '#fef3c7' : '#fee2e2')};
             border: 2px solid ${analysis.successRate >= 70 ? '#22c55e' : (analysis.successRate >= 40 ? '#f59e0b' : '#dc2626')};
             border-radius: 12px; padding: 15px; margin-bottom: 12px; text-align: center;">
            <div style="font-size: 28px;">${analysis.successRate >= 70 ? '🎯' : (analysis.successRate >= 40 ? '⚠️' : '❌')}</div>
            <div style="font-size: 14px; font-weight: bold; margin: 5px 0;">
                目標達成率: ${Math.round(analysis.successRate)}%
            </div>
            <div style="font-size: 12px; color: #666;">
                ${analysis.totalSimulations}回シミュレーション | 平均最終自己資本: ¥${analysis.avgFinalEquity}
            </div>
            <div style="background: #e5e7eb; border-radius: 8px; height: 12px; margin: 10px 0; overflow: hidden;">
                <div style="background: ${analysis.successRate >= 70 ? '#22c55e' : (analysis.successRate >= 40 ? '#f59e0b' : '#dc2626')};
                     height: 100%; width: ${Math.min(100, (analysis.avgFinalEquity / 450) * 100)}%;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: #666;">
                <span>現在: ¥${initialState.equity}</span>
                <span>目標: ¥450</span>
            </div>
        </div>

        <!-- 推奨アクション -->
        ${recommendations.length > 0 ? `
        <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 12px;">
            <div style="font-weight: bold; font-size: 12px; color: #92400e; margin-bottom: 6px;">改善提案</div>
            ${recommendations.map(r => `
                <div style="font-size: 11px; padding: 4px 0; ${r.type === 'warning' ? 'color: #dc2626;' : ''}">
                    ${r.type === 'warning' ? '⚠️' : '💡'} ${r.text}
                </div>
            `).join('')}
        </div>
        ` : ''}

        <!-- 期ごとの詳細 -->
        <div style="font-weight: bold; font-size: 13px; margin-bottom: 8px;">最適シナリオ（各期タップで詳細表示）</div>
    `;

    bestPlan.forEach(plan => {
        const f = plan.financials;
        const s = plan.summary;
        const isPositiveG = f.grossProfit > 0;

        html += `
            <div class="period-plan-card" onclick="togglePeriodDetail(${plan.period})"
                 style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                        border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;
                        margin-bottom: 8px; cursor: pointer; transition: all 0.2s;">

                <!-- 期ヘッダー -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-weight: bold; font-size: 14px; color: #1e293b;">
                        ${plan.period}期
                    </div>
                    <div style="display: flex; gap: 8px; font-size: 11px;">
                        <span style="background: ${isPositiveG ? '#dcfce7' : '#fee2e2'}; padding: 2px 8px; border-radius: 4px; color: ${isPositiveG ? '#166534' : '#991b1b'};">
                            G: ¥${f.grossProfit}
                        </span>
                        <span style="background: #dbeafe; padding: 2px 8px; border-radius: 4px; color: #1e40af;">
                            自己資本: ¥${s.equity}
                        </span>
                    </div>
                </div>

                <!-- 会社盤状態 -->
                <div style="display: flex; gap: 6px; flex-wrap: wrap; font-size: 10px; margin-bottom: 8px;">
                    <span style="background: #fef3c7; padding: 2px 6px; border-radius: 4px;">W:${s.workers}</span>
                    <span style="background: #fce7f3; padding: 2px 6px; border-radius: 4px;">S:${s.salesmen}</span>
                    <span style="background: #e0e7ff; padding: 2px 6px; border-radius: 4px;">小型機:${s.machinesSmall}</span>
                    <span style="background: #e0e7ff; padding: 2px 6px; border-radius: 4px;">大型機:${s.machinesLarge}</span>
                    <span style="background: #d1fae5; padding: 2px 6px; border-radius: 4px;">製造力:${s.mfgCapacity}</span>
                    <span style="background: #fee2e2; padding: 2px 6px; border-radius: 4px;">販売力:${s.salesCapacity}</span>
                </div>

                <!-- PL概要 -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; font-size: 10px; background: white; padding: 6px; border-radius: 6px;">
                    <div style="text-align: center;">
                        <div style="color: #666;">売上</div>
                        <div style="font-weight: bold;">¥${f.totalSales}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="color: #666;">原価</div>
                        <div style="font-weight: bold;">¥${f.materialCost}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="color: #666;">固定費</div>
                        <div style="font-weight: bold;">¥${f.fixedCost}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="color: #666;">純利益</div>
                        <div style="font-weight: bold; color: ${f.netProfit >= 0 ? '#16a34a' : '#dc2626'};">¥${f.netProfit}</div>
                    </div>
                </div>

                <!-- 展開用アイコン -->
                <div style="text-align: center; margin-top: 6px; color: #9ca3af; font-size: 10px;">
                    ▼ タップで行動詳細を表示
                </div>

                <!-- 詳細（初期非表示） -->
                <div id="period-detail-${plan.period}" style="display: none; margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
                    <div style="font-weight: bold; font-size: 11px; color: #374151; margin-bottom: 6px;">
                        行ごとの行動（${plan.actions.length}アクション）
                    </div>
                    <div style="max-height: 200px; overflow-y: auto; font-size: 10px;">
                        ${plan.actions.map((a, i) => `
                            <div style="display: flex; align-items: center; padding: 4px 0;
                                        ${i < plan.actions.length - 1 ? 'border-bottom: 1px dashed #e5e7eb;' : ''}
                                        ${a.isRisk ? 'background: #fee2e2; margin: 2px -4px; padding-left: 4px; border-radius: 4px;' : ''}">
                                <span style="color: #9ca3af; width: 35px; flex-shrink: 0;">${a.row}行</span>
                                <span style="font-weight: 500; color: ${a.isRisk ? '#dc2626' : '#374151'}; flex: 1;">${a.action}</span>
                                <span style="color: #666; font-size: 9px; max-width: 100px; text-align: right;">${a.detail}</span>
                                ${a.cashChange ? `<span style="color: ${a.cashChange > 0 ? '#16a34a' : '#dc2626'}; font-weight: bold; width: 50px; text-align: right;">
                                    ${a.cashChange > 0 ? '+' : ''}¥${a.cashChange}
                                </span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    });

    // 戦略アドバイス
    html += `
        <div style="background: #f0f9ff; border-radius: 8px; padding: 10px; margin-top: 10px;">
            <div style="font-weight: bold; font-size: 12px; color: #0369a1; margin-bottom: 6px;">戦略アドバイス</div>
            <div style="font-size: 11px; line-height: 1.5; color: #374151;">
                <div>• 大型機械(¥100)は能力2でコスパが良い</div>
                <div>• 研究チップ2枚以上で入札有利</div>
                <div>• 名古屋(¥12)で仕入れ、東京(¥40)で販売が基本</div>
                <div>• リスクカード(20%)に備えて現金余裕を持つ</div>
            </div>
        </div>
    `;

    document.getElementById('simulation-result').innerHTML = html;
    document.getElementById('simulation-result').style.display = 'block';
}

function togglePeriodDetail(period) {
    const detail = document.getElementById(`period-detail-${period}`);
    if (detail) {
        detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    }
}

// ============================================
// ゲーム中AIアドバイス
// ============================================

function showCurrentGameAIAdvice() {
    if (!gameState || !gameState.companies || !gameState.companies[0]) {
        showToast('ゲームが開始されていません', 'error');
        return;
    }

    const player = gameState.companies[0];
    const period = gameState.currentPeriod;
    const row = player.currentRow || 2;

    // 現在の状態でシミュレーション
    const initialState = {
        period: period,
        equity: player.equity || 300,
        cash: player.cash,
        workers: player.workers,
        salesmen: player.salesmen,
        machinesSmall: player.machinesSmall || player.machines || 4,
        machinesLarge: player.machinesLarge || 0,
        materials: player.materials,
        wip: player.wip,
        products: player.products,
        loans: player.loans || 0,
        chips: player.chips
    };

    const simulator = new MGSimulator(initialState);
    const analysis = simulator.runMultipleSimulations(50); // 軽量版

    const recommendation = getNextActionRecommendation(initialState);

    const content = `
        <div style="max-height: 70vh; overflow-y: auto; padding: 10px;">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 12px; border-radius: 10px; margin-bottom: 10px; text-align: center;">
                <div style="font-size: 16px; font-weight: bold;">AIアドバイザー</div>
                <div style="font-size: 11px; opacity: 0.9;">第${period}期 ${row}行目</div>
            </div>

            <!-- 成功率 -->
            <div style="background: ${analysis.successRate >= 50 ? '#dcfce7' : '#fee2e2'}; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center;">
                <div style="font-size: 12px; color: #666;">現在の状態からの目標達成率</div>
                <div style="font-size: 24px; font-weight: bold; color: ${analysis.successRate >= 50 ? '#166534' : '#991b1b'};">
                    ${Math.round(analysis.successRate)}%
                </div>
                <div style="font-size: 11px; color: #666;">予想最終自己資本: ¥${analysis.avgFinalEquity}</div>
            </div>

            <!-- 推奨アクション -->
            <div style="background: #eff6ff; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="font-weight: bold; font-size: 12px; color: #1e40af; margin-bottom: 6px;">今すぐやるべきこと</div>
                <div style="background: white; padding: 10px; border-radius: 6px;">
                    <div style="font-size: 16px; font-weight: bold; color: #15803d; margin-bottom: 4px;">
                        ${recommendation.action}
                    </div>
                    <div style="font-size: 12px; color: #374151;">${recommendation.reason}</div>
                </div>
            </div>

            <!-- ヒント -->
            <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="font-weight: bold; font-size: 12px; color: #92400e; margin-bottom: 4px;">ヒント</div>
                <div style="font-size: 11px; line-height: 1.5;">
                    ${recommendation.tips.map(t => `<div>• ${t}</div>`).join('')}
                </div>
            </div>

            <button class="submit-btn" onclick="closeModal()" style="width: 100%; padding: 10px;">閉じる</button>
        </div>
    `;

    showModal('AIアドバイス', content);
}

function getNextActionRecommendation(state) {
    const mfgCap = Math.min(state.workers, (state.machinesSmall || 0) + (state.machinesLarge || 0) * 2);
    const salesCap = Math.floor(state.salesmen * 1.5);

    let action = '';
    let reason = '';
    let tips = [];

    if (state.products > 0) {
        action = '商品販売';
        reason = `製品${state.products}個あり。東京(¥40)または名古屋(¥38)で販売。`;
        tips = ['研究チップがあれば入札有利', '高単価市場を狙う'];
    } else if (state.wip > 0) {
        action = '完成・投入（完成）';
        reason = `仕掛品${state.wip}個を製品に変換。`;
        tips = ['次ターンで販売可能'];
    } else if (state.materials > 0) {
        action = '完成・投入（投入）';
        reason = `材料${state.materials}個を仕掛品に。製造能力: ${mfgCap}`;
        tips = ['教育チップで効率UP'];
    } else if (state.cash >= 12 * mfgCap) {
        action = '材料仕入';
        reason = `名古屋(¥12)で${mfgCap}個仕入れ推奨。`;
        tips = ['名古屋が最安', '大量仕入れは在庫リスク'];
    } else if (mfgCap < 5 || salesCap < 5) {
        action = mfgCap < 5 ? '採用/設備投資' : '採用';
        reason = '能力不足。強化が必要。';
        tips = ['大型機械(¥100)はコスパ良好', 'セールス×1.5=販売能力'];
    } else {
        action = '戦略チップ or DO NOTHING';
        reason = '状況に応じて判断。';
        tips = ['研究チップで入札有利', '余裕があれば投資'];
    }

    if (state.equity < 350 && state.period >= 3) {
        tips.push('ペースが遅い！積極的に売上を');
    }

    return { action, reason, tips };
}

// グローバル公開
if (typeof window !== 'undefined') {
    window.showCustomGameSetupModal = showCustomGameSetupModal;
    window.startCustomGame = startCustomGame;
    window.showAIActionPlanModal = showAIActionPlanModal;
    window.runAISimulation = runAISimulation;
    window.togglePeriodDetail = togglePeriodDetail;
    window.showCurrentGameAIAdvice = showCurrentGameAIAdvice;
    window.MGSimulator = MGSimulator;
    window.generateOptimalStrategy = generateOptimalStrategy;
}
