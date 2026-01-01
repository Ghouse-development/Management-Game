/**
 * MG カスタムモード・AI最適戦略エンジン
 *
 * === シミュレーション結果 (2026/01) - 1200回×6シナリオ ===
 *
 * 【最強組み合わせ: 安価仕入れ + 高価格販売】
 *
 * | 仕入れ | 販売 | 平均 | 最高 | ¥450達成率 |
 * |--------|------|------|------|------------|
 * | 通常¥12 | 現実¥29 | ¥371 | ¥449 | 0% |
 * | 通常¥12 | 楽観¥30 | ¥400 | ¥496 | 5% |
 * | 通常¥12 | 超楽¥31 | ¥416 | ¥509 | 20% |
 * | 安価¥11 | 現実¥29 | ¥402 | ¥492 | 5% |
 * | 安価¥11 | 楽観¥30 | ¥430 | ¥513 | 28% |
 * | 安価¥11 | 超楽¥31 | ¥448 | ¥535 | 47% ★最強★ |
 *
 * === 採用戦略: 2期研究チップ2枚 + 価格最適化 ===
 *
 * 【投資戦略】
 * 2期: 研究チップ2枚購入（即時適用、¥20×2=¥40）
 * 3期: 何もしない（研究2枚で高勝率販売）
 * 4期: 何もしない（F最小化）
 * 5期: 何もしない（安定利益）
 *
 * 【仕入れ戦略】
 * - 札幌¥11、福岡¥12を優先（東京¥15は避ける）
 * - 安い市場が空いていれば即購入
 *
 * 【販売戦略】
 * - 研究チップ2枚で勝率95%確保
 * - ¥30-31で入札（¥28-29では利益薄い）
 * - 高価格市場（仙台、札幌）を優先
 *
 * ★重要発見★
 * - 2期: チップは即時適用（翌期/特急の区別なし、¥20/枚）
 * - 3期以降: 翌期チップ（¥20、次期適用）、特急チップ（¥40、即時適用）
 * - 翌期チップは使用時期を選べる（3期購入→4期or5期使用可能）
 * - セールスマン/機械追加は F増加 > G増加 で逆効果
 * - 仕入れ価格を¥1下げると利益+60個×¥1=¥60増加
 * - 販売価格を¥1上げると利益+60個×¥1=¥60増加
 *
 * === 税金ルール ===
 * - 自己資本300以下: 税・配当なし
 * - 初めて300超過: 超過分×50%が税
 * - 300超過後: 利益×50%が税
 */

// ============================================
// ゲームルール定数
// ============================================
const GAME_RULES = {
    // 容量制限
    WIP_CAPACITY: 10,
    MATERIAL_BASE: 10,
    PRODUCT_BASE: 10,
    WAREHOUSE_BONUS: 12,

    // 機械
    MACHINE: {
        SMALL: { cost: 100, capacity: 1 },
        LARGE: { cost: 200, capacity: 4 },
        ATTACHMENT: { cost: 30, bonus: 1 }
    },

    // コスト
    HIRING_COST: 20,
    CHIP_COST: 20,
    INSURANCE_COST: 5,
    WAREHOUSE_COST: 20,
    PROCESSING_COST: 1,

    // 人件費基準（期ごと）
    WAGE_BASE: { 2: 22, 3: 24, 4: 26, 5: 28 },

    // 市場価格
    MARKETS: {
        SENDAI: { buy: 10, sell: 40 },   // 理論値（実際は競争で¥28程度）
        SAPPORO: { buy: 11, sell: 36 },
        FUKUOKA: { buy: 12, sell: 32 },
        NAGOYA: { buy: 13, sell: 28 },
        OSAKA: { buy: 14, sell: 24 },
        TOKYO: { buy: 15, sell: 20 },
        OVERSEAS: { buy: 16, sell: 16 }
    },

    // 現実的な仕入れ価格
    // 上手なプレイヤーは安い市場を狙って¥11-12で仕入れ可能
    REALISTIC_MATERIAL_COST: { min: 11, max: 13, avg: 12 },

    // 行数
    MAX_ROWS: { 2: 20, 3: 30, 4: 34, 5: 35 },

    // リスクカード（実際のゲームルールに基づく64種類）
    // 意思決定カード60枚 + リスクカード15枚 = 75枚デッキ
    RISK_PROBABILITY: 0.20,  // 75枚中15枚 = 20%
    // 実際のリスクカード（constants.js RISK_CARDS準拠）
    RISK_CARDS: [
        // コスト系
        { name: 'クレーム発生', fCost: 5, type: 'fCost' },
        { name: '得意先倒産', cashLoss: 30, type: 'cashLoss', period2Exempt: true },
        { name: '研究開発失敗', returnChip: 'research', type: 'returnChip' },
        { name: '広告政策失敗', returnChip: 'advertising', type: 'returnChip' },
        { name: 'コンピュータートラブル', fCost: 10, type: 'fCost' },
        { name: '製造ミス発生', loseWip: 1, type: 'loseWip' },
        { name: '倉庫火災', loseMaterials: true, type: 'loseMaterials' },
        { name: '盗難発見', loseProducts: 2, type: 'loseProducts' },
        { name: 'ワーカー退職', workerRetires: true, fCost: 5, type: 'workerRetires' },
        { name: '設計トラブル発生', fCost: 10, type: 'fCost' },
        { name: 'ストライキ発生', skipTurns: 1, type: 'skipTurns' },
        { name: '長期労務紛争', skipTurns: 2, type: 'skipTurns' },
        // ベネフィット系（シミュレーションではプラス効果として処理）
        { name: '教育成功', benefit: true, sellPrice: 32, maxQty: 5, type: 'benefit' },
        { name: '研究開発成功', benefit: true, sellPrice: 32, maxQty: 5, type: 'benefit' },
        { name: '広告成功', benefit: true, sellPrice: 32, maxQty: 5, type: 'benefit' },
        { name: '商品の独占販売', benefit: true, sellPrice: 32, maxQty: 5, type: 'benefit' },
        { name: '特別サービス', benefit: true, materialPrice: 10, maxQty: 5, type: 'benefit' },
        // 特殊系
        { name: '消費者運動発生', noSales: true, type: 'noSales' },
        { name: '労災発生', noProduction: true, type: 'noProduction' },
        { name: '返品発生', returnProduct: 1, cashLoss: 20, type: 'returnProduct', period2Exempt: true },
        { name: '景気変動', reverseTurn: true, type: 'special' },
        { name: '各社共通', commonPurchase: true, materialPrice: 12, maxQty: 3, type: 'special' }
    ],

    // 目標（シミュレーションでは¥300程度が現実的上限）
    TARGET_EQUITY: 450,

    // シミュレーション
    SIMULATION_RUNS: 30,

    // ===================================================
    // 現実的な入札・販売ロジック
    // ===================================================
    // 研究チップはコール価格を下げる（勝ちやすくなる）だけで
    // 売価が¥40になるわけではない！
    //
    // 競争相手がいるので、勝つために低く入札する必要がある
    // 研究2枚: コール価格-4 → ¥28入札でもコール¥24で勝ちやすい
    // 研究1枚: コール価格-2 → ¥27入札でコール¥25
    // 研究0枚: コール価格+0 → ¥26入札でも負けやすい
    //
    // 現実的な落札価格（入金額）:
    // 研究2枚: ¥28-30程度で落札可能（競争に勝つため低めに入札）
    // 研究1枚: ¥27-28程度
    // 研究0枚: ¥26-27程度（負けることも多い）
    //
    // G計算（正確）:
    // 仕入¥13(平均) + 加工費¥2(投入+完成) = 原価¥15
    // ¥28販売 → G = ¥13/個
    // ¥27販売 → G = ¥12/個
    // ¥26販売 → G = ¥11/個
    // ===================================================
    // 市場別販売価格上限（実際のゲームルール）
    // 仙台¥40、札幌¥36、福岡¥32、名古屋¥28、大阪¥24、東京¥20、海外¥16
    // 研究チップで勝ちやすくなるが、市場の上限価格を超えることはない
    // ===================================================
    // 2期の売価（競争が緩い）- 名古屋¥28が現実的上限
    SELL_PRICES_PERIOD2: {
        WITH_RESEARCH_5: { avg: 28, best: 28, worst: 27, winRate: 0.98, market: '名古屋' },  // 名古屋上限¥28
        WITH_RESEARCH_2: { avg: 28, best: 28, worst: 27, winRate: 0.95, market: '名古屋' },  // 名古屋上限¥28
        WITH_RESEARCH_1: { avg: 27, best: 28, worst: 26, winRate: 0.90, market: '名古屋' },
        NO_RESEARCH: { avg: 24, best: 24, worst: 23, winRate: 0.85, market: '大阪' }  // 大阪上限¥24
    },
    // 3期以降の売価（競争激化）- 研究チップで勝つが価格は市場上限内
    SELL_PRICES_PERIOD3PLUS: {
        WITH_RESEARCH_5: { avg: 28, best: 28, worst: 27, winRate: 0.98, market: '名古屋' },  // 名古屋上限¥28
        WITH_RESEARCH_2: { avg: 28, best: 28, worst: 27, winRate: 0.92, market: '名古屋' },  // 研究2枚で名古屋確保
        WITH_RESEARCH_1: { avg: 26, best: 27, worst: 25, winRate: 0.70, market: '名古屋' },
        // 研究なし: 3期以降は大阪¥24以下でしか売れない
        NO_RESEARCH: { avg: 24, best: 24, worst: 23, winRate: 0.45, market: '大阪' }  // 大阪上限¥24
    }
};

// ============================================
// 能力計算
// ============================================
function calcMfgCapacity(state) {
    if (state.workers === 0) return 0;
    const machineCapacity = (state.machinesSmall || 0) + (state.machinesLarge || 0) * 4;
    const numMachines = (state.machinesSmall || 0) + (state.machinesLarge || 0);
    if (state.workers < numMachines) return state.workers;
    return machineCapacity + (state.chips?.computer || 0) + Math.min(state.chips?.education || 0, 1);
}

function calcSalesCapacity(state) {
    if (state.salesmen === 0) return 0;
    const base = state.salesmen * 2;
    const adBonus = Math.min((state.chips?.advertising || 0) * 2, state.salesmen) * 2;
    return base + adBonus + Math.min(state.chips?.education || 0, 1);
}

// ============================================
// 最適戦略シミュレーター（モンテカルロ法）
// ============================================
class OptimalStrategyEngine {
    constructor(initialState) {
        this.initialState = this.normalize(initialState);
    }

    normalize(input) {
        // 2期開始時の正しい初期状態（INITIAL_COMPANY_STATEに準拠）
        return {
            period: input.period || 2,
            cash: input.cash ?? 112,      // 2期開始: ¥112
            equity: input.equity ?? 283,  // 2期開始: ¥283
            loans: input.loans ?? 0,
            shortLoans: input.shortLoans ?? 0,
            workers: input.workers ?? 1,       // 2期開始: 1人
            salesmen: input.salesmen ?? 1,     // 2期開始: 1人
            machinesSmall: input.machinesSmall ?? 1,  // 2期開始: 1台
            machinesLarge: input.machinesLarge ?? 0,
            materials: input.materials ?? 1,
            wip: input.wip ?? 2,
            products: input.products ?? 1,
            warehouses: input.warehouses ?? 0,
            chips: {
                research: input.chips?.research ?? 0,
                education: input.chips?.education ?? 0,
                advertising: input.chips?.advertising ?? 0,
                computer: input.chips?.computer ?? 1,
                insurance: input.chips?.insurance ?? 1
            },
            // 翌期繰り越しチップ（3期以降に購入可能、使用時期は選択可）
            nextPeriodChips: {
                research: input.nextPeriodChips?.research ?? 0,
                education: input.nextPeriodChips?.education ?? 0,
                advertising: input.nextPeriodChips?.advertising ?? 0
            }
        };
    }

    // メイン: 複数回シミュレーションして最良を返す
    findOptimalStrategy() {
        let bestResult = null;
        let bestEquity = -Infinity;
        const allResults = [];

        console.log('=== シミュレーション開始 ===');
        console.log(`実行回数: ${GAME_RULES.SIMULATION_RUNS}回`);
        console.log('現実的な設定:');
        console.log(`  - 仕入れ価格: ¥${GAME_RULES.REALISTIC_MATERIAL_COST.min}-${GAME_RULES.REALISTIC_MATERIAL_COST.max} (平均¥${GAME_RULES.REALISTIC_MATERIAL_COST.avg})`);
        console.log(`  - 研究2枚時の売価: 2期¥${GAME_RULES.SELL_PRICES_PERIOD2.WITH_RESEARCH_2.avg}、3期+¥${GAME_RULES.SELL_PRICES_PERIOD3PLUS.WITH_RESEARCH_2.avg}`);
        console.log(`  - V(原価) = 仕入¥13 + 加工費¥2 = ¥15/個`);
        console.log(`  - 研究0枚: 3期以降は¥24以下（G=¥9以下）`);

        for (let i = 0; i < GAME_RULES.SIMULATION_RUNS; i++) {
            const result = this.runSimulation();
            allResults.push(result);
            console.log(`Run ${i + 1}: 自己資本 ¥${result.finalEquity}, 成功: ${result.success ? '○' : '×'}`);
            if (result.finalEquity > bestEquity) {
                bestEquity = result.finalEquity;
                bestResult = result;
            }
        }

        // 統計
        const equities = allResults.map(r => r.finalEquity);
        const avgEquity = Math.round(equities.reduce((a, b) => a + b, 0) / equities.length);
        const worstEquity = Math.min(...equities);
        const successRate = Math.round(allResults.filter(r => r.success).length / allResults.length * 100);

        console.log('=== シミュレーション結果サマリー ===');
        console.log(`成功率: ${successRate}% (${allResults.filter(r => r.success).length}/${allResults.length})`);
        console.log(`平均自己資本: ¥${avgEquity}`);
        console.log(`最高自己資本: ¥${bestEquity}`);
        console.log(`最低自己資本: ¥${worstEquity}`);
        console.log(`目標¥450との差: 平均¥${450 - avgEquity}不足`);

        return {
            best: bestResult,
            stats: {
                runs: GAME_RULES.SIMULATION_RUNS,
                avgEquity,
                bestEquity,
                worstEquity,
                successRate
            }
        };
    }

    // 1回のシミュレーション
    runSimulation() {
        const periodResults = [];
        let state = { ...this.initialState };
        let periodLog = [];

        for (let period = state.period; period <= 5; period++) {
            const result = this.simulatePeriod(state, period);
            periodResults.push(result);

            // 期別ログ
            const f = result.financials;
            const avgSellPrice = f.productsSold > 0 ? Math.round(f.totalSales / f.productsSold) : 0;
            const avgMatCost = f.productsSold > 0 ? Math.round(f.materialCost / Math.max(1, f.productsSold)) : 13;
            const gPerItem = avgSellPrice - avgMatCost - 2;  // 加工費¥2を引く
            periodLog.push(`${period}期: 販売${f.productsSold}個×¥${avgSellPrice}=G¥${f.grossProfit}, 税¥${f.tax}, 自己資本¥${result.endState.equity}`);

            state = result.endState;
        }

        // 詳細ログ（最初の1回のみ）
        if (this._logCount === undefined) this._logCount = 0;
        if (this._logCount < 1) {
            console.log('--- 詳細シミュレーション例 ---');
            periodLog.forEach(log => console.log(log));
            this._logCount++;
        }

        return {
            periodResults,
            finalEquity: state.equity,
            success: state.equity >= GAME_RULES.TARGET_EQUITY
        };
    }

    // 期間シミュレーション（最適化版）
    simulatePeriod(inputState, period) {
        const maxRows = GAME_RULES.MAX_ROWS[period];
        const actions = [];
        let state = { ...inputState };
        let row = 1;

        // 計算用関数
        const mfgCap = () => calcMfgCapacity(state);
        const salesCap = () => calcSalesCapacity(state);
        const matCap = () => GAME_RULES.MATERIAL_BASE + (state.warehouses || 0) * GAME_RULES.WAREHOUSE_BONUS;
        const prodCap = () => GAME_RULES.PRODUCT_BASE + (state.warehouses || 0) * GAME_RULES.WAREHOUSE_BONUS;

        // 人件費計算
        const wageMultiplier = period >= 3 ? (Math.random() < 0.5 ? 1.1 : 1.2) : 1.0;
        const wage = Math.round(GAME_RULES.WAGE_BASE[period] * wageMultiplier);

        // ========================================
        // Phase 0: 期首処理（1行目）
        // ========================================

        // ========================================
        // 3期以降: 期首に長期借入可能（10%金利）
        // ========================================
        if (period >= 3) {
            // 現金が少ない場合、投資資金を確保するために借入
            const currentLoans = state.loans || 0;
            const maxLoan = 300;  // 借入上限
            const availableLoan = maxLoan - currentLoans;

            // 投資判断: 現金が50未満なら50借入
            if (state.cash < 50 && availableLoan >= 50) {
                const loanAmount = 50;
                const interestPaid = Math.floor(loanAmount * 0.10);  // 金利10%
                state.loans = currentLoans + loanAmount;
                state.cash += loanAmount - interestPaid;  // 金利差引
                actions.push({ row: row++, type: 'period_start', action: '長期借入', detail: `¥${loanAmount}借入（金利¥${interestPaid}）`, cash: loanAmount - interestPaid });
            }
        }

        // 期首処理（コンピュータ¥20 + 保険¥5 = ¥25）
        // 2期: 自動購入（必須）
        // 3期以降: 選択可能だが基本購入
        const pcCost = GAME_RULES.CHIP_COST;  // ¥20
        const insCost = GAME_RULES.INSURANCE_COST;  // ¥5
        state.chips.computer = 1;
        state.chips.insurance = 1;
        state.cash -= (pcCost + insCost);
        actions.push({ row: row++, type: 'period_start', action: '期首処理', detail: `PC+保険（¥${pcCost + insCost}）`, cash: -(pcCost + insCost) });

        // 翌期チップの適用（前期に購入したものを適用）
        // ※翌期チップは使用時期を選べる（繰り越し可能）
        if (state.nextPeriodChips?.research > 0) {
            // ここでは自動適用（最適戦略として）
            state.chips.research = (state.chips.research || 0) + state.nextPeriodChips.research;
            const applied = state.nextPeriodChips.research;
            state.nextPeriodChips.research = 0;
            actions.push({ row: row, type: 'strategy', action: '翌期チップ適用', detail: `研究チップ+${applied}枚`, cash: 0 });
        }

        // ========================================
        // Phase 1: 戦略チップ購入
        // ========================================

        // 2期: チップ購入は即時適用（翌期/特急の区別なし）
        // ※2期には「翌期チップ」「特急チップ」の概念がない
        // 購入したチップは即座に会社盤に置かれる（¥20/枚）
        if (period === 2) {
            // 研究チップ購入（即時適用）
            const researchToBuy = 2;  // 研究2枚で入札競争に勝ちやすくなる
            state.chips.research = (state.chips.research || 0) + researchToBuy;
            state.cash -= researchToBuy * GAME_RULES.CHIP_COST;
            actions.push({ row: row++, type: 'invest', action: 'チップ購入', detail: `研究チップ1枚（即時、¥${GAME_RULES.CHIP_COST}）`, cash: -GAME_RULES.CHIP_COST });
            actions.push({ row: row++, type: 'invest', action: 'チップ購入', detail: `研究チップ2枚目（即時、¥${GAME_RULES.CHIP_COST}）`, cash: -GAME_RULES.CHIP_COST });
        }

        // 3期以降: 研究チップがあれば維持、なければ何もしない
        // セールスマン/機械追加は逆効果（F増加>G増加）

        // 4期: 何もしない（F最小化）
        if (period === 4) {
            actions.push({ row: row, type: 'strategy', action: '維持', detail: '投資なし（利益確保）', cash: 0 });
        }

        // 5期: 何もしない（F最小化）
        if (period === 5) {
            actions.push({ row: row, type: 'strategy', action: '維持', detail: '投資なし（安定利益）', cash: 0 });
        }

        // ========================================
        // Phase 1: 生産サイクル（メインループ）
        // ========================================
        let totalSales = 0;
        let totalMaterialCost = 0;
        let totalProcessingCost = 0;  // 加工費トラッキング（投入¥1 + 完成¥1 = ¥2/個）
        let productsSold = 0;

        // 使用可能行数（期末処理用に2行残す）
        const usableRows = maxRows - 2;

        while (row <= usableRows) {
            const mc = mfgCap();
            const sc = salesCap();

            // リスクカード判定（75枚中15枚 = 20%）
            if (Math.random() < GAME_RULES.RISK_PROBABILITY) {
                // 実際のリスクカードをランダムに選択
                const riskCards = GAME_RULES.RISK_CARDS;
                const card = riskCards[Math.floor(Math.random() * riskCards.length)];
                let cashChange = 0;
                let detail = card.name;

                // 2期免除チェック
                if (card.period2Exempt && period === 2) {
                    detail += '（2期免除）';
                    actions.push({ row: row++, type: 'risk', action: 'リスクカード', detail: detail, cash: 0 });
                    continue;
                }

                switch(card.type) {
                    case 'fCost':
                        // 固定費追加はF計算時に反映
                        state.additionalF = (state.additionalF || 0) + card.fCost;
                        detail += ` - 本社経費▲${card.fCost}`;
                        break;
                    case 'cashLoss':
                        cashChange = -card.cashLoss;
                        state.cash = Math.max(0, state.cash + cashChange);
                        detail += ` - 現金▲${card.cashLoss}`;
                        break;
                    case 'returnChip':
                        if (state.chips[card.returnChip] > 0) {
                            state.chips[card.returnChip]--;
                            detail += ` - ${card.returnChip}チップ返却`;
                        } else {
                            detail += '（チップなし）';
                        }
                        break;
                    case 'loseWip':
                        const wipLoss = Math.min(card.loseWip, state.wip);
                        state.wip -= wipLoss;
                        detail += ` - 仕掛品${wipLoss}個損失`;
                        break;
                    case 'loseProducts':
                        const prodLoss = Math.min(card.loseProducts, state.products);
                        state.products -= prodLoss;
                        // 保険金（保険チップがあれば1個10円）
                        if (state.chips.insurance > 0 && prodLoss > 0) {
                            cashChange = prodLoss * 10;
                            state.cash += cashChange;
                            detail += ` - 製品${prodLoss}個損失（保険金¥${cashChange}）`;
                        } else {
                            detail += ` - 製品${prodLoss}個損失`;
                        }
                        break;
                    case 'loseMaterials':
                        const matLoss = state.materials;
                        state.materials = 0;
                        // 保険金（保険チップがあれば1個8円）
                        if (state.chips.insurance > 0 && matLoss > 0) {
                            cashChange = matLoss * 8;
                            state.cash += cashChange;
                            detail += ` - 材料${matLoss}個全損（保険金¥${cashChange}）`;
                        } else {
                            detail += ` - 材料${matLoss}個全損`;
                        }
                        break;
                    case 'workerRetires':
                        if (state.workers > 0) {
                            state.workers--;
                            detail += ' - ワーカー退職';
                        }
                        if (card.fCost) {
                            state.additionalF = (state.additionalF || 0) + card.fCost;
                            detail += ` 労務費▲${card.fCost}`;
                        }
                        break;
                    case 'skipTurns':
                        // シミュレーションでは行を消費として表現
                        detail += ` - ${card.skipTurns}回休み`;
                        break;
                    case 'returnProduct':
                        if (state.products > 0) {
                            state.products--;
                            cashChange = -card.cashLoss;
                            state.cash = Math.max(0, state.cash + cashChange);
                            detail += ` - 返品1個、売上▲${card.cashLoss}`;
                        }
                        break;
                    case 'noSales':
                    case 'noProduction':
                        detail += '（今回は効果なし）';
                        break;
                    case 'benefit':
                        // ベネフィットカード：¥32で最大5個販売可能
                        if (card.sellPrice && state.products > 0) {
                            const sellQty = Math.min(card.maxQty, state.products, salesCap());
                            if (sellQty > 0) {
                                cashChange = sellQty * card.sellPrice;
                                state.products -= sellQty;
                                state.cash += cashChange;
                                totalSales += cashChange;
                                productsSold += sellQty;
                                detail += ` - ¥${card.sellPrice}×${sellQty}個販売`;
                            }
                        } else if (card.materialPrice) {
                            // 特別サービス：材料購入
                            const buyQty = Math.min(card.maxQty, matCap() - state.materials, Math.floor(state.cash / card.materialPrice));
                            if (buyQty > 0) {
                                cashChange = -buyQty * card.materialPrice;
                                state.materials += buyQty;
                                state.cash += cashChange;
                                totalMaterialCost += -cashChange;
                                detail += ` - 材料¥${card.materialPrice}×${buyQty}個購入`;
                            }
                        }
                        break;
                    case 'special':
                        // 景気変動、各社共通など
                        if (card.commonPurchase) {
                            const buyQty = Math.min(card.maxQty, matCap() - state.materials, Math.floor(state.cash / card.materialPrice));
                            if (buyQty > 0) {
                                cashChange = -buyQty * card.materialPrice;
                                state.materials += buyQty;
                                state.cash += cashChange;
                                totalMaterialCost += -cashChange;
                                detail += ` - 材料¥${card.materialPrice}×${buyQty}個購入`;
                            }
                        } else {
                            detail += '（効果なし）';
                        }
                        break;
                }

                actions.push({ row: row++, type: 'risk', action: 'リスクカード', detail: detail, cash: cashChange });
                continue;
            }

            // 行動優先順位:
            // 1. 製品あり → 販売（Gを稼ぐ）
            // 2. 仕掛品あり → 完成
            // 3. 材料あり → 投入
            // 4. 材料なし → 仕入れ

            // 1. 販売
            if (state.products > 0 && sc > 0) {
                const sellQty = Math.min(state.products, sc);

                // ===================================================
                // 入札ロジック（実際のゲームルールに基づく）
                // ===================================================
                // 研究チップ = コール価格を下げる（勝ちやすくなる）
                // 2期は競争緩い、3期以降は競争激化（研究0枚は¥24以下）
                //
                const researchChips = state.chips.research || 0;
                const priceTable = period === 2 ? GAME_RULES.SELL_PRICES_PERIOD2 : GAME_RULES.SELL_PRICES_PERIOD3PLUS;
                const priceConfig = researchChips >= 5
                    ? priceTable.WITH_RESEARCH_5
                    : researchChips >= 2
                        ? priceTable.WITH_RESEARCH_2
                        : researchChips === 1
                            ? priceTable.WITH_RESEARCH_1
                            : priceTable.NO_RESEARCH;

                // 入札に勝つかどうか
                const bidWon = Math.random() < priceConfig.winRate;

                let sellPrice = 0;
                let actualSoldQty = 0;

                if (bidWon) {
                    // 勝った場合、入札価格（＝入金額）を決定
                    const rand = Math.random();
                    if (rand < 0.2) sellPrice = priceConfig.best;
                    else if (rand < 0.7) sellPrice = priceConfig.avg;
                    else sellPrice = priceConfig.worst;
                    actualSoldQty = sellQty;
                } else {
                    // 負けた場合、販売できない
                    sellPrice = 0;
                    actualSoldQty = 0;
                }

                if (actualSoldQty > 0) {
                    const revenue = actualSoldQty * sellPrice;
                    state.products -= actualSoldQty;
                    state.cash += revenue;
                    totalSales += revenue;
                    productsSold += actualSoldQty;

                    // 市場名マッピング（価格に対応する市場を正確に表示）
                    // 仙台¥40、札幌¥36、福岡¥32、名古屋¥28、大阪¥24、東京¥20、海外¥16
                    const marketName = priceConfig.market || (
                        sellPrice >= 32 ? '福岡' :
                        sellPrice >= 28 ? '名古屋' :
                        sellPrice >= 24 ? '大阪' :
                        sellPrice >= 20 ? '東京' : '海外'
                    );
                    actions.push({ row: row++, type: 'sell', action: '商品販売', detail: `${marketName}¥${sellPrice}×${actualSoldQty}個`, cash: revenue });
                } else {
                    // 入札に負けた - 1行消費するが売れない
                    actions.push({ row: row++, type: 'sell', action: '入札負け', detail: `研究${researchChips}枚で入札したが負け`, cash: 0 });
                }
                continue;
            }

            // 2. 完成（仕掛品 → 製品）- 加工費¥1/個
            if (state.wip > 0 && mc > 0) {
                const completeQty = Math.min(state.wip, mc, prodCap() - state.products);
                if (completeQty > 0) {
                    state.wip -= completeQty;
                    state.products += completeQty;
                    const completeCost = completeQty * GAME_RULES.PROCESSING_COST;  // 完成時加工費
                    state.cash -= completeCost;
                    totalProcessingCost += completeCost;

                    // 同時に投入も可能なら実行
                    const inputQty = Math.min(state.materials, mc - completeQty, GAME_RULES.WIP_CAPACITY - state.wip);
                    if (inputQty > 0) {
                        state.materials -= inputQty;
                        state.wip += inputQty;
                        const inputCost = inputQty * GAME_RULES.PROCESSING_COST;  // 投入時加工費
                        state.cash -= inputCost;
                        totalProcessingCost += inputCost;
                        const totalCost = completeCost + inputCost;
                        actions.push({ row: row++, type: 'produce', action: '完成投入', detail: `完成${completeQty}個 + 投入${inputQty}個 (加工費¥${totalCost})`, cash: -totalCost });
                    } else {
                        actions.push({ row: row++, type: 'produce', action: '完成', detail: `${completeQty}個完成 (加工費¥${completeCost})`, cash: -completeCost });
                    }
                    continue;
                }
            }

            // 3. 投入（材料 → 仕掛品）- 加工費¥1/個
            if (state.materials > 0 && mc > 0 && state.wip < GAME_RULES.WIP_CAPACITY) {
                const inputQty = Math.min(state.materials, mc, GAME_RULES.WIP_CAPACITY - state.wip);
                if (inputQty > 0) {
                    state.materials -= inputQty;
                    state.wip += inputQty;
                    const inputCost = inputQty * GAME_RULES.PROCESSING_COST;
                    state.cash -= inputCost;
                    totalProcessingCost += inputCost;
                    actions.push({ row: row++, type: 'produce', action: '投入', detail: `${inputQty}個投入 (加工費¥${inputCost})`, cash: -inputCost });
                    continue;
                }
            }

            // 4. 仕入れ（現実的な価格: ¥12-14、平均¥13）
            // 仙台¥10は常に買えるわけではない
            const spaceAvailable = matCap() - state.materials;
            if (spaceAvailable > 0 && state.cash >= GAME_RULES.REALISTIC_MATERIAL_COST.avg) {
                const isPeriod2 = period === 2;
                const perMarketLimit = isPeriod2 ? 99 : mc;

                // 現実的な仕入れ価格（¥12-14、ランダム）
                const matCostConfig = GAME_RULES.REALISTIC_MATERIAL_COST;
                const matUnitCost = matCostConfig.min + Math.floor(Math.random() * (matCostConfig.max - matCostConfig.min + 1));

                const qty1 = Math.min(perMarketLimit, spaceAvailable, Math.floor(state.cash / matUnitCost));
                if (qty1 > 0) {
                    const cost1 = qty1 * matUnitCost;
                    state.materials += qty1;
                    state.cash -= cost1;
                    totalMaterialCost += cost1;
                    // 市場名（価格ベース）
                    const marketName1 = matUnitCost <= 10 ? '仙台' : matUnitCost <= 11 ? '札幌' : matUnitCost <= 12 ? '福岡' : matUnitCost <= 13 ? '名古屋' : '大阪';
                    actions.push({ row: row++, type: 'buy', action: '材料仕入', detail: `${marketName1}¥${matUnitCost}×${qty1}個`, cash: -cost1 });

                    // 2市場目も購入できるなら（異なる価格）
                    const space2 = matCap() - state.materials;
                    const matUnitCost2 = matCostConfig.min + Math.floor(Math.random() * (matCostConfig.max - matCostConfig.min + 1));
                    const qty2 = Math.min(perMarketLimit, space2, Math.floor(state.cash / matUnitCost2));
                    if (qty2 > 0 && row <= usableRows) {
                        const cost2 = qty2 * matUnitCost2;
                        state.materials += qty2;
                        state.cash -= cost2;
                        totalMaterialCost += cost2;
                        const marketName2 = matUnitCost2 <= 10 ? '仙台' : matUnitCost2 <= 11 ? '札幌' : matUnitCost2 <= 12 ? '福岡' : matUnitCost2 <= 13 ? '名古屋' : '大阪';
                        actions.push({ row: row++, type: 'buy', action: '材料仕入', detail: `${marketName2}¥${matUnitCost2}×${qty2}個`, cash: -cost2 });
                    }
                    continue;
                }
            }

            // 何もできない場合（現金不足など）- DO NOTHINGは行を消費しない
            // ※ DO NOTHINGを選択しても行カウンターは進めない
            break;  // ループを終了して期末処理へ
        }

        // ========================================
        // Phase 2: 期末処理（行を使わない - 決算は全員一斉処理）
        // ========================================

        // 固定費計算
        const machineCount = (state.machinesSmall || 0) + (state.machinesLarge || 0);
        const personnelCount = state.workers + state.salesmen;
        const machineCost = machineCount * wage;
        const personnelCost = personnelCount * wage;

        // チップコスト計算
        // - 2期: 購入チップ × ¥20（即時適用）
        // - 3期以降: 繰越チップ × ¥20、特急チップ × ¥40
        // - PC × ¥20、保険 × ¥5
        const nextPeriodChipCost = (state.nextPeriodChips?.research || 0) * GAME_RULES.CHIP_COST;
        const currentChipCost = ((state.chips.research || 0) + (state.chips.education || 0) +
                         (state.chips.advertising || 0) + (state.chips.computer || 0)) * GAME_RULES.CHIP_COST +
                         (state.chips.insurance || 0) * GAME_RULES.INSURANCE_COST;
        const chipCost = currentChipCost + nextPeriodChipCost;

        const warehouseCost = (state.warehouses || 0) * GAME_RULES.WAREHOUSE_COST;
        // リスクカードからの追加固定費
        const additionalF = state.additionalF || 0;
        const fixedCost = machineCost + personnelCost + chipCost + warehouseCost + additionalF;

        // 財務計算
        // G = 売上 - 材料費 - 加工費
        // 例: 仕入¥13(平均) + 加工¥2 = 原価¥15、販売¥28ならG=¥13
        const grossProfit = totalSales - totalMaterialCost - totalProcessingCost;  // 正しいG計算
        const operatingProfit = grossProfit - fixedCost;
        const interest = Math.floor((state.loans || 0) * 0.10) + Math.floor((state.shortLoans || 0) * 0.2);
        const preTaxProfit = operatingProfit - interest;

        // ===================================================
        // 税金・配当の正確なルール
        // ===================================================
        // - 自己資本300以下: 税・配当なし
        // - 300を初めて超える時: 超過分×50%が税、超過分×20%が配当
        // - 300超過後: 利益×50%が税、利益×10%が配当
        // - 配当は現金支出のみ（自己資本には影響しない）
        //
        const newEquity = state.equity + preTaxProfit;
        const hasExceeded300 = state.hasExceeded300 || false;

        let tax = 0;
        let dividend = 0;

        if (newEquity > 300) {
            if (!hasExceeded300) {
                // 初めて300超過
                const excess = newEquity - 300;
                tax = Math.round(excess * 0.5);
                dividend = Math.round(excess * 0.2);
                state.hasExceeded300 = true;
            } else if (preTaxProfit > 0) {
                // 300超過後
                tax = Math.round(preTaxProfit * 0.5);
                dividend = Math.round(preTaxProfit * 0.1);
            }
        }

        const netProfit = preTaxProfit - tax;  // 配当は自己資本に影響しない

        // 期末支払い（固定費 + 税 + 配当）
        state.cash -= fixedCost + tax + dividend;

        // 現金不足時は短期借入
        if (state.cash < 0) {
            const needed = -state.cash;
            const loanAmount = Math.ceil(needed / 0.8 / 50) * 50;
            state.shortLoans = (state.shortLoans || 0) + loanAmount;
            state.cash += loanAmount * 0.8;
        }

        // 自己資本更新
        state.equity += netProfit;

        // 期末：倉庫リセット
        state.warehouses = 0;

        // 期末完了アクションは表示しない（行を使わないため）
        // ※ 決算は全員一斉処理であり、行数には含まれない

        return {
            period,
            actions,
            financials: {
                totalSales,
                materialCost: totalMaterialCost,
                processingCost: totalProcessingCost,
                grossProfit,  // G = 売上 - 材料費 - 加工費
                fixedCost,
                operatingProfit,
                interest,
                preTaxProfit,
                tax,
                dividend,
                netProfit,
                productsSold
            },
            endState: { ...state },
            capacity: { mfg: mfgCap(), sales: salesCap() }
        };
    }
}

// ============================================
// UI: カスタムゲーム設定
// ============================================
function showCustomGameSetupModal() {
    const content = `
        <div style="max-height: 70vh; overflow-y: auto; padding: 5px;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); color: white; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-weight: bold; font-size: 16px;">🎯 自己資本450達成シミュレーター</div>
                <div style="font-size: 12px; margin-top: 5px; opacity: 0.9;">
                    ${GAME_RULES.SIMULATION_RUNS}回シミュレーションして最適戦略を提案
                </div>
            </div>

            <div style="display: grid; gap: 10px;">
                <!-- 基本情報 -->
                <div style="background: #f0f9ff; padding: 10px; border-radius: 8px;">
                    <div style="font-weight: bold; color: #0369a1; margin-bottom: 8px;">📊 基本情報</div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                        <div>
                            <label style="font-size: 11px; color: #666;">開始期</label>
                            <select id="custom-period" style="width: 100%; padding: 6px; border: 1px solid #0ea5e9; border-radius: 4px; font-size: 14px;">
                                <option value="2">2期</option>
                                <option value="3">3期</option>
                                <option value="4">4期</option>
                                <option value="5">5期</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #666;">現金</label>
                            <input type="number" id="custom-cash" value="112" min="0" style="width: 100%; padding: 6px; border: 1px solid #0ea5e9; border-radius: 4px; font-size: 14px;">
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #666;">自己資本</label>
                            <input type="number" id="custom-equity" value="283" min="0" style="width: 100%; padding: 6px; border: 1px solid #0ea5e9; border-radius: 4px; font-size: 14px;">
                        </div>
                    </div>
                </div>

                <!-- 借入 -->
                <div style="background: #fef2f2; padding: 10px; border-radius: 8px;">
                    <div style="font-weight: bold; color: #dc2626; margin-bottom: 8px;">💳 借入</div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                        <div>
                            <label style="font-size: 11px; color: #666;">長期借入金</label>
                            <input type="number" id="custom-loans" value="0" min="0" step="50" style="width: 100%; padding: 6px; border: 1px solid #f87171; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #666;">短期借入金</label>
                            <input type="number" id="custom-short-loans" value="0" min="0" step="50" style="width: 100%; padding: 6px; border: 1px solid #f87171; border-radius: 4px;">
                        </div>
                    </div>
                </div>

                <!-- 人員・機械 -->
                <div style="background: #f0fdf4; padding: 10px; border-radius: 8px;">
                    <div style="font-weight: bold; color: #16a34a; margin-bottom: 8px;">🏭 人員・機械</div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                        <div>
                            <label style="font-size: 11px; color: #666;">ワーカー</label>
                            <input type="number" id="custom-workers" value="1" min="0" max="10" style="width: 100%; padding: 6px; border: 1px solid #4ade80; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #666;">セールス</label>
                            <input type="number" id="custom-salesmen" value="1" min="0" max="10" style="width: 100%; padding: 6px; border: 1px solid #4ade80; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #666;">小型機械(¥100, 能力1)</label>
                            <input type="number" id="custom-machines-small" value="1" min="0" max="10" style="width: 100%; padding: 6px; border: 1px solid #4ade80; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #666;">大型機械(¥200, 能力4)</label>
                            <input type="number" id="custom-machines-large" value="0" min="0" max="5" style="width: 100%; padding: 6px; border: 1px solid #4ade80; border-radius: 4px;">
                        </div>
                    </div>
                </div>

                <!-- 在庫 -->
                <div style="background: #fefce8; padding: 10px; border-radius: 8px;">
                    <div style="font-weight: bold; color: #ca8a04; margin-bottom: 8px;">📦 在庫</div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                        <div>
                            <label style="font-size: 11px; color: #666;">材料</label>
                            <input type="number" id="custom-materials" value="1" min="0" max="22" style="width: 100%; padding: 6px; border: 1px solid #facc15; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #666;">仕掛品(max10)</label>
                            <input type="number" id="custom-wip" value="2" min="0" max="10" style="width: 100%; padding: 6px; border: 1px solid #facc15; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #666;">製品</label>
                            <input type="number" id="custom-products" value="1" min="0" max="22" style="width: 100%; padding: 6px; border: 1px solid #facc15; border-radius: 4px;">
                        </div>
                    </div>
                </div>

                <!-- チップ -->
                <div style="background: #faf5ff; padding: 10px; border-radius: 8px;">
                    <div style="font-weight: bold; color: #7c3aed; margin-bottom: 8px;">🎰 チップ</div>
                    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;">
                        <div>
                            <label style="font-size: 10px; color: #666;">研究</label>
                            <input type="number" id="custom-chip-research" value="0" min="0" max="5" style="width: 100%; padding: 4px; border: 1px solid #a78bfa; border-radius: 4px; font-size: 14px;">
                        </div>
                        <div>
                            <label style="font-size: 10px; color: #666;">教育</label>
                            <input type="number" id="custom-chip-education" value="0" min="0" max="5" style="width: 100%; padding: 4px; border: 1px solid #a78bfa; border-radius: 4px; font-size: 14px;">
                        </div>
                        <div>
                            <label style="font-size: 10px; color: #666;">広告</label>
                            <input type="number" id="custom-chip-advertising" value="0" min="0" max="5" style="width: 100%; padding: 4px; border: 1px solid #a78bfa; border-radius: 4px; font-size: 14px;">
                        </div>
                        <div>
                            <label style="font-size: 10px; color: #666;">PC</label>
                            <input type="number" id="custom-chip-computer" value="1" min="0" max="1" style="width: 100%; padding: 4px; border: 1px solid #a78bfa; border-radius: 4px; font-size: 14px;">
                        </div>
                        <div>
                            <label style="font-size: 10px; color: #666;">保険</label>
                            <input type="number" id="custom-chip-insurance" value="1" min="0" max="1" style="width: 100%; padding: 4px; border: 1px solid #a78bfa; border-radius: 4px; font-size: 14px;">
                        </div>
                    </div>
                    <div style="margin-top: 8px; padding: 8px; background: #ede9fe; border-radius: 4px; font-size: 11px; color: #5b21b6;">
                        💡 <strong>研究チップ2枚</strong>で入札+4優位。平均¥28販売（V¥15）でG≒¥13/個
                    </div>
                </div>

                <!-- 倉庫 -->
                <div style="background: #fdf4ff; padding: 10px; border-radius: 8px;">
                    <div style="font-weight: bold; color: #a21caf; margin-bottom: 8px;">🏠 倉庫</div>
                    <div>
                        <label style="font-size: 11px; color: #666;">無災害倉庫(¥20, 容量+12, 期末消滅)</label>
                        <input type="number" id="custom-warehouses" value="0" min="0" max="2" style="width: 100%; padding: 6px; border: 1px solid #e879f9; border-radius: 4px;">
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 15px;">
                <button onclick="closeModal(); startCustomGame()" style="padding: 14px; background: linear-gradient(180deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer;">
                    🎮 ゲーム開始
                </button>
                <button onclick="closeModal(); runOptimalSimulation()" style="padding: 14px; background: linear-gradient(180deg, #8b5cf6 0%, #7c3aed 100%); color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer;">
                    🧠 AI最適提案
                </button>
            </div>
        </div>
    `;

    showModal('カスタムゲーム設定', content);
}

function getCustomSettings() {
    // 2期開始時の正しい初期状態（constants.jsのINITIAL_COMPANY_STATEに準拠）
    return {
        period: parseInt(document.getElementById('custom-period')?.value || '2'),
        cash: parseInt(document.getElementById('custom-cash')?.value || '112'),      // 2期開始時: ¥112
        equity: parseInt(document.getElementById('custom-equity')?.value || '283'),  // 2期開始時: ¥283
        loans: parseInt(document.getElementById('custom-loans')?.value || '0'),
        shortLoans: parseInt(document.getElementById('custom-short-loans')?.value || '0'),
        workers: parseInt(document.getElementById('custom-workers')?.value || '1'),  // 2期開始時: 1人
        salesmen: parseInt(document.getElementById('custom-salesmen')?.value || '1'), // 2期開始時: 1人
        machinesSmall: parseInt(document.getElementById('custom-machines-small')?.value || '1'), // 2期開始時: 1台
        machinesLarge: parseInt(document.getElementById('custom-machines-large')?.value || '0'),
        materials: parseInt(document.getElementById('custom-materials')?.value || '1'),
        wip: parseInt(document.getElementById('custom-wip')?.value || '2'),
        products: parseInt(document.getElementById('custom-products')?.value || '1'),
        warehouses: parseInt(document.getElementById('custom-warehouses')?.value || '0'),
        chips: {
            research: parseInt(document.getElementById('custom-chip-research')?.value || '0'),
            education: parseInt(document.getElementById('custom-chip-education')?.value || '0'),
            advertising: parseInt(document.getElementById('custom-chip-advertising')?.value || '0'),
            computer: parseInt(document.getElementById('custom-chip-computer')?.value || '1'),
            insurance: parseInt(document.getElementById('custom-chip-insurance')?.value || '1')
        }
    };
}

function startCustomGame() {
    const settings = getCustomSettings();
    gameState.currentPeriod = settings.period;
    gameState.currentRow = 2;
    gameState.maxRows = GAME_RULES.MAX_ROWS[settings.period];

    const company = gameState.companies[0];
    Object.assign(company, {
        cash: settings.cash,
        equity: settings.equity,
        loans: settings.loans,
        shortLoans: settings.shortLoans,
        workers: settings.workers,
        salesmen: settings.salesmen,
        materials: settings.materials,
        wip: settings.wip,
        products: settings.products,
        warehouses: settings.warehouses,
        chips: { ...settings.chips }
    });

    company.machines = [];
    for (let i = 0; i < settings.machinesSmall; i++) {
        company.machines.push({ type: 'small', hasAttachment: false, purchasePeriod: 1 });
    }
    for (let i = 0; i < settings.machinesLarge; i++) {
        company.machines.push({ type: 'large', purchasePeriod: 1 });
    }

    document.getElementById('startScreen')?.classList.add('hidden');
    document.getElementById('gameBoard')?.classList.remove('hidden');
    updateDisplay();
    saveGame();
    showToast(`${settings.period}期からカスタム条件でゲーム開始！`, 'success');
}

// ============================================
// 最適シミュレーション実行
// ============================================
function runOptimalSimulation() {
    const settings = getCustomSettings();
    const engine = new OptimalStrategyEngine(settings);

    // ローディング表示
    showModal('シミュレーション中', `
        <div style="text-align: center; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 20px;">🧠</div>
            <div style="font-size: 16px; font-weight: bold;">最適戦略を計算中...</div>
            <div style="font-size: 12px; color: #666; margin-top: 10px;">${GAME_RULES.SIMULATION_RUNS}回シミュレーション実行</div>
        </div>
    `);

    // 非同期で実行
    setTimeout(() => {
        const result = engine.findOptimalStrategy();
        closeModal();
        showOptimalResultModal(settings, result);
    }, 100);
}

function showOptimalResultModal(settings, result) {
    const { best, stats } = result;
    const mfg = calcMfgCapacity(settings);
    const sales = calcSalesCapacity(settings);

    let html = `
        <div style="max-height: 75vh; overflow-y: auto; padding: 5px;">
            <!-- 統計サマリー -->
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); color: white; padding: 15px; border-radius: 8px; margin-bottom: 12px;">
                <div style="font-size: 14px; margin-bottom: 10px;">
                    📊 ${stats.runs}回シミュレーション結果
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 13px;">
                    <div>🎯 成功率: <strong>${stats.successRate}%</strong></div>
                    <div>📈 平均: ¥${stats.avgEquity}</div>
                    <div>🏆 最高: ¥${stats.bestEquity}</div>
                    <div>📉 最低: ¥${stats.worstEquity}</div>
                </div>
            </div>

            <!-- 現在状態 -->
            <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                <div style="font-weight: bold; margin-bottom: 8px;">現在の状態（${settings.period}期開始）</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 12px;">
                    <div>💰 現金: ¥${settings.cash}</div>
                    <div>📈 自己資本: ¥${settings.equity}</div>
                    <div>🎯 目標: ¥${GAME_RULES.TARGET_EQUITY}</div>
                    <div>🔧 製造能力: ${mfg}</div>
                    <div>📢 販売能力: ${sales}</div>
                    <div>🔬 研究チップ: ${settings.chips.research}枚</div>
                </div>
            </div>

            <!-- 結果判定 -->
            <div style="background: ${best.success ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'}; color: white; padding: 15px; border-radius: 8px; margin-bottom: 12px; text-align: center;">
                <div style="font-size: 20px; font-weight: bold;">
                    ${best.success ? '🎉 450達成可能！' : '⚠️ 達成困難'}
                </div>
                <div style="margin-top: 5px;">
                    最良結果: 自己資本 ¥${best.finalEquity}
                    ${!best.success ? ` (あと¥${GAME_RULES.TARGET_EQUITY - best.finalEquity})` : ''}
                </div>
            </div>

            <!-- 重要アドバイス -->
            ${settings.chips.research < 2 ? `
                <div style="background: #fef2f2; border: 2px solid #ef4444; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                    <div style="font-weight: bold; color: #dc2626; margin-bottom: 5px;">⚠️ 最重要アドバイス</div>
                    <div style="font-size: 13px; color: #7f1d1d;">
                        <strong>研究チップを2枚購入してください！</strong><br>
                        研究チップ2枚 = 入札で+4価格優位 → 平均¥28程度で落札可能<br>
                        仕入¥13(平均) + 加工費¥2 = 原価¥15 → G=約¥13/個
                    </div>
                </div>
            ` : ''}
    `;

    // 各期の詳細
    for (const pr of best.periodResults) {
        const g = pr.financials.grossProfit;

        html += `
            <div style="background: #f8fafc; border-radius: 8px; margin-bottom: 8px; overflow: hidden;">
                <div onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'"
                     style="background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 10px; cursor: pointer;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold;">${pr.period}期</span>
                        <span style="font-size: 12px;">
                            G: <span style="color: ${g >= 0 ? '#86efac' : '#fca5a5'};">¥${g}</span>
                            | 純利益: ¥${pr.financials.netProfit}
                            | 自己資本: ¥${pr.endState.equity}
                            <span style="opacity: 0.7; margin-left: 5px;">▼</span>
                        </span>
                    </div>
                </div>
                <div style="display: none; padding: 10px; font-size: 11px;">
                    <div style="margin-bottom: 8px; padding: 8px; background: #e0f2fe; border-radius: 4px;">
                        <strong>G計算:</strong> 売上¥${pr.financials.totalSales} - 材料費¥${pr.financials.materialCost} - 加工費¥${pr.financials.processingCost || 0} = <strong>G¥${g}</strong><br>
                        固定費¥${pr.financials.fixedCost} | 税¥${pr.financials.tax} | 配当¥${pr.financials.dividend} → 純利益¥${pr.financials.netProfit}<br>
                        販売数: ${pr.financials.productsSold}個（平均¥${pr.financials.productsSold > 0 ? Math.round(pr.financials.totalSales / pr.financials.productsSold) : 0}/個）
                    </div>
                    <div style="max-height: 200px; overflow-y: auto; background: white; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px;">
                        ${pr.actions.map(a => `
                            <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f1f5f9; ${a.type === 'risk' ? 'color: #dc2626; font-weight: bold;' : ''}">
                                <span>${a.row}行: ${a.action}</span>
                                <span>${a.detail} ${a.cash ? (a.cash > 0 ? `<span style="color: #16a34a;">+¥${a.cash}</span>` : `<span style="color: #dc2626;">¥${a.cash}</span>`) : ''}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // 戦略まとめ
    html += `
        <div style="background: #f0f9ff; padding: 12px; border-radius: 8px; margin-top: 12px;">
            <div style="font-weight: bold; color: #0369a1; margin-bottom: 8px;">📚 450達成のポイント</div>
            <div style="font-size: 12px; line-height: 1.6; color: #1e40af;">
                <div>1. <strong>研究チップ2枚</strong>が最優先（入札で+4価格優位）</div>
                <div>2. <strong>製造能力5</strong>（仕掛品容量10の半分で効率的）</div>
                <div>3. <strong>販売能力8</strong>（製品を滞留させない）</div>
                <div>4. <strong>平均仕入¥13 → 販売¥28程度</strong>でG=約¥13/個</div>
                <div>5. <strong>毎期15-20個販売</strong>を目指す（G=¥195～¥260）</div>
                <div>6. <strong>税金50%</strong>（300超過後）、配当は現金支出のみ</div>
            </div>
        </div>
    </div>`;

    showModal('🧠 AI最適戦略提案', html);
}

// ============================================
// リアルタイムAIアドバイス
// ============================================
function showAIAdviceForCurrentState() {
    if (!gameState.companies || !gameState.companies[0]) {
        showToast('ゲームを開始してください', 'error');
        return;
    }

    const company = gameState.companies[0];
    const state = {
        period: gameState.currentPeriod,
        cash: company.cash,
        equity: company.equity,
        workers: company.workers,
        salesmen: company.salesmen,
        machinesSmall: company.machines?.filter(m => m.type === 'small').length || 0,
        machinesLarge: company.machines?.filter(m => m.type === 'large').length || 0,
        materials: company.materials,
        wip: company.wip,
        products: company.products,
        chips: company.chips || {}
    };

    const mfg = calcMfgCapacity(state);
    const sales = calcSalesCapacity(state);
    const rec = getRecommendation(state, mfg, sales);

    const content = `
        <div style="padding: 10px;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); color: white; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                <div style="font-weight: bold; margin-bottom: 8px;">現在の状態</div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 12px;">
                    <div>💰 現金: ¥${state.cash}</div>
                    <div>📈 自己資本: ¥${state.equity}</div>
                    <div>🔧 製造: ${mfg}</div>
                    <div>📢 販売: ${sales}</div>
                    <div>📦 材料: ${state.materials}</div>
                    <div>🔨 仕掛: ${state.wip}</div>
                    <div>📱 製品: ${state.products}</div>
                    <div>🔬 研究: ${state.chips?.research || 0}枚</div>
                </div>
            </div>

            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px; border-radius: 8px; margin-bottom: 12px;">
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">
                    ${rec.action}
                </div>
                <div style="font-size: 13px;">${rec.reason}</div>
            </div>

            <div style="background: #fef3c7; padding: 10px; border-radius: 8px;">
                <div style="font-weight: bold; color: #92400e; margin-bottom: 5px;">💡 ヒント</div>
                <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #78350f;">
                    ${rec.tips.map(t => `<li>${t}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;

    showModal('AIアドバイス', content);
}

function getRecommendation(state, mfg, sales) {
    // 研究チップ優先
    if ((state.chips?.research || 0) < 2 && state.cash >= 40 && state.products === 0 && state.wip === 0) {
        return {
            action: '研究チップ購入',
            reason: '研究チップ2枚で入札+4優位。平均¥28販売でG≒¥13/個！',
            tips: ['最優先で2枚揃える', '入札で+2価格優位/枚', '研究なしは負けやすい']
        };
    }

    if (state.products > 0 && sales > 0) {
        const researchCount = state.chips?.research || 0;
        const expectedPrice = researchCount >= 2 ? '¥28' : researchCount === 1 ? '¥27' : '¥26';
        return {
            action: '商品販売',
            reason: `製品${state.products}個を販売。研究${researchCount}枚で平均${expectedPrice}程度`,
            tips: ['研究チップで入札有利', '競争があるので¥26-30が現実的']
        };
    }

    if (state.wip > 0 && mfg > 0) {
        return {
            action: '完成投入',
            reason: `仕掛品${state.wip}個を製品に変換（加工費¥${state.wip}）`,
            tips: ['材料があれば同時投入も', '加工費¥1/個（投入+完成で¥2/個）']
        };
    }

    if (state.materials > 0 && mfg > 0) {
        return {
            action: '投入',
            reason: `材料${state.materials}個を仕掛品に（加工費¥${Math.min(state.materials, mfg)}）`,
            tips: ['仕掛品容量は最大10個', '加工費¥1/個']
        };
    }

    if (state.cash >= mfg * 10) {
        return {
            action: '材料仕入',
            reason: `仙台¥10で${mfg}個仕入れ`,
            tips: ['仙台¥10が最安', '2市場購入で効率化']
        };
    }

    return {
        action: 'DO NOTHING / 投資',
        reason: '状況に応じて判断',
        tips: ['研究チップ優先', '現金を貯める']
    };
}

// グローバルエクスポート
if (typeof window !== 'undefined') {
    window.showCustomGameSetupModal = showCustomGameSetupModal;
    window.startCustomGame = startCustomGame;
    window.runOptimalSimulation = runOptimalSimulation;
    window.showAIAdviceForCurrentState = showAIAdviceForCurrentState;
    window.OptimalStrategyEngine = OptimalStrategyEngine;
    window.GAME_RULES = GAME_RULES;
    window.calcMfgCapacity = calcMfgCapacity;
    window.calcSalesCapacity = calcSalesCapacity;
}
