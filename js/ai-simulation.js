/**
 * AI 450達成シミュレーション
 *
 * 各期・各行の状態を追跡し、450達成可能性を検証する
 */

// ============================================
// 完全シミュレーション: 期別・行別の状態追跡
// ============================================

/**
 * 1社の完全シミュレーションを実行
 * @param {string} strategyType - 戦略タイプ
 * @param {number} competitorResearchChips - 最強競合の研究チップ数
 * @returns {Object} シミュレーション結果
 */
function runFullSimulation(strategyType = 'balanced', competitorResearchChips = 5) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`【完全シミュレーション】${strategyType}戦略 vs 競合研究${competitorResearchChips}枚`);
    console.log(`${'='.repeat(60)}\n`);

    // 初期状態（GAME_RULES.md セクション1.0参照）
    // 期首現金137円 - PC(20円) - 保険(5円) = 112円
    let state = {
        cash: 112,          // 期首処理後の現金（137-25=112）
        equity: 283,
        loans: 0,
        materials: 1,
        wip: 2,
        products: 1,
        machines: [{type: 'small', attachments: 0}],
        workers: 1,
        salesmen: 1,
        chips: {research: 0, education: 0, advertising: 0, computer: 1, insurance: 1},
        nextPeriodChips: {research: 0, education: 0, advertising: 0},
        hasExceeded300: false
    };

    const results = {
        periods: [],
        finalEquity: 0,
        success: false
    };

    // 期別シミュレーション
    for (let period = 2; period <= 5; period++) {
        const periodResult = simulatePeriod(state, period, strategyType, competitorResearchChips);
        results.periods.push(periodResult);
        state = periodResult.endState;
    }

    results.finalEquity = state.equity;
    results.success = state.equity >= 450;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`【最終結果】自己資本: ¥${state.equity} ${results.success ? '✅ 450達成!' : '❌ 未達成'}`);
    console.log(`${'='.repeat(60)}\n`);

    return results;
}

/**
 * 1期のシミュレーション
 */
function simulatePeriod(startState, period, strategyType, competitorResearchChips) {
    const state = JSON.parse(JSON.stringify(startState)); // Deep copy

    // 期首処理: 繰越チップを受け取る
    if (period >= 3) {
        state.chips.research += state.nextPeriodChips.research;
        state.chips.education += state.nextPeriodChips.education;
        state.chips.advertising += state.nextPeriodChips.advertising;
        state.nextPeriodChips = {research: 0, education: 0, advertising: 0};
    }

    // 賃金単価（3期以降は1.2倍想定）
    const wageMultiplier = period >= 3 ? 1.2 : 1.0;
    const baseSalary = {2: 22, 3: 24, 4: 26, 5: 28}[period];
    const unitCost = Math.round(baseSalary * wageMultiplier);

    // 行数
    const maxRows = {2: 20, 3: 30, 4: 34, 5: 35}[period];

    // 追跡変数
    let totalSales = 0;
    let totalMQ = 0;
    let salesCount = 0;
    let investments = [];

    console.log(`\n--- ${period}期開始 ---`);
    console.log(`  期首: 現金¥${state.cash}, 材料${state.materials}, 仕掛${state.wip}, 製品${state.products}`);
    console.log(`  能力: 製造${getMfgCapacity(state)}, 販売${getSalesCapacitySimple(state)}`);
    console.log(`  チップ: 研究${state.chips.research}, 教育${state.chips.education}, 広告${state.chips.advertising}`);

    // 行別シミュレーション
    for (let row = 2; row <= maxRows; row++) {
        // リスクカード確率（20%で1行消費）
        if (Math.random() < 0.2) {
            continue; // リスクカードで行消費
        }

        const action = decideAction(state, period, row, strategyType, competitorResearchChips);

        if (action) {
            const result = executeAction(state, action, period, unitCost, competitorResearchChips);
            if (result.success) {
                if (result.sales) {
                    totalSales += result.sales;
                    totalMQ += result.mq;
                    salesCount++;
                }
                if (result.investment) {
                    investments.push(result.investment);
                }
            }
        }
    }

    // F計算
    const F = calculateSimulationF(state, period, unitCost, investments);

    // G計算
    const G = totalMQ - F;

    // 税金計算
    let tax = 0;
    let newEquity = state.equity + G;
    if (newEquity > 300) {
        if (!state.hasExceeded300) {
            tax = Math.round((newEquity - 300) * 0.5);
            state.hasExceeded300 = true;
        } else if (G > 0) {
            tax = Math.round(G * 0.5);
        }
    }
    state.equity = newEquity - tax;

    console.log(`  販売: ${salesCount}回, ${totalSales}個, MQ¥${totalMQ}`);
    console.log(`  F: ¥${F}, G: ¥${G}, 税: ¥${tax}`);
    console.log(`  期末自己資本: ¥${state.equity}`);
    console.log(`  投資: ${investments.join(', ') || 'なし'}`);

    return {
        period,
        salesCount,
        totalSales,
        totalMQ,
        F,
        G,
        tax,
        investments,
        endState: state
    };
}

/**
 * 行動決定（簡易版）
 */
function decideAction(state, period, row, strategyType, competitorResearchChips) {
    const mfgCapacity = getMfgCapacity(state);
    const salesCapacity = getSalesCapacitySimple(state);

    // 投資判断（期・行に応じて）
    if (period === 2 && row === 4 && state.chips.research === 0 && state.cash >= 50) {
        return {type: 'BUY_CHIP', chipType: 'research'};
    }

    if (period === 3) {
        if (row === 4 && state.machines[0].attachments === 0 && state.cash >= 60) {
            return {type: 'BUY_ATTACHMENT'};
        }
        if (row === 5 && state.workers < 2 && state.cash >= 35) {
            return {type: 'HIRE_WORKER'};
        }
        if (row === 12 && state.cash >= 50) {
            return {type: 'BUY_NEXT_CHIP', chipType: 'research'};
        }
        if (row === 16 && state.chips.advertising === 0 && state.cash >= 60) {
            return {type: 'BUY_CHIP', chipType: 'advertising'};
        }
        if (row === 20 && state.cash >= 50) {
            return {type: 'BUY_NEXT_CHIP', chipType: 'education'};
        }
    }

    if (period === 4) {
        if (row === 4 && state.salesmen < 2 && state.cash >= 35) {
            return {type: 'HIRE_SALESMAN'};
        }
        if ((row === 14 || row === 18 || row === 22) && state.cash >= 50) {
            const types = ['research', 'education', 'advertising'];
            return {type: 'BUY_NEXT_CHIP', chipType: types[(row - 14) / 4]};
        }
    }

    // 販売・生産・購入サイクル
    if (state.products > 0 && salesCapacity > 0) {
        return {type: 'SELL', qty: Math.min(state.products, salesCapacity)};
    }
    if ((state.wip > 0 || state.materials > 0) && mfgCapacity > 0) {
        return {type: 'PRODUCE'};
    }
    if (state.cash >= 30) {
        return {type: 'BUY_MATERIALS', qty: Math.min(3, mfgCapacity)};
    }

    return null;
}

/**
 * 行動実行
 */
function executeAction(state, action, period, unitCost, competitorResearchChips) {
    const result = {success: false, sales: 0, mq: 0, investment: null};

    switch (action.type) {
        case 'SELL':
            const qty = action.qty;
            // 競合との入札シミュレーション
            const myBonus = state.chips.research * 2;
            const competitorBonus = competitorResearchChips * 2;
            const priceDiff = myBonus - competitorBonus;

            // 価格決定（競合より劣位なら安値）
            let sellPrice;
            if (priceDiff >= 0) {
                sellPrice = 28; // 名古屋相当
            } else if (priceDiff >= -4) {
                sellPrice = 26; // やや安値
            } else {
                sellPrice = 24; // かなり安値
            }

            const revenue = sellPrice * qty;
            const mq = (sellPrice - 10) * qty; // 原価10円

            state.cash += revenue;
            state.products -= qty;
            result.success = true;
            result.sales = qty;
            result.mq = mq;
            break;

        case 'PRODUCE':
            const mfgCap = getMfgCapacity(state);
            const toComplete = Math.min(state.wip, mfgCap);
            const toStart = Math.min(state.materials, mfgCap - toComplete);

            state.products += toComplete;
            state.wip = state.wip - toComplete + toStart;
            state.materials -= toStart;
            state.cash -= toComplete; // 製造費1円/個
            result.success = true;
            break;

        case 'BUY_MATERIALS':
            const buyQty = action.qty;
            const cost = buyQty * 10; // 1個10円想定
            if (state.cash >= cost) {
                state.materials += buyQty;
                state.cash -= cost;
                result.success = true;
            }
            break;

        case 'BUY_CHIP':
            const chipCost = period === 2 ? 20 : 40; // 2期は20円、3期以降は特急40円
            if (state.cash >= chipCost) {
                state.chips[action.chipType]++;
                state.cash -= chipCost;
                result.success = true;
                result.investment = `${action.chipType}チップ(¥${chipCost})`;
            }
            break;

        case 'BUY_NEXT_CHIP':
            if (state.cash >= 20 && period >= 3) {
                state.nextPeriodChips[action.chipType]++;
                state.cash -= 20;
                result.success = true;
                result.investment = `次期${action.chipType}予約(¥20)`;
            }
            break;

        case 'BUY_ATTACHMENT':
            if (state.cash >= 30) {
                state.machines[0].attachments++;
                state.cash -= 30;
                result.success = true;
                result.investment = 'アタッチメント(¥30)';
            }
            break;

        case 'HIRE_WORKER':
            if (state.cash >= 5) {
                state.workers++;
                state.cash -= 5;
                result.success = true;
                result.investment = 'ワーカー(¥5)';
            }
            break;

        case 'HIRE_SALESMAN':
            if (state.cash >= 5) {
                state.salesmen++;
                state.cash -= 5;
                result.success = true;
                result.investment = 'セールス(¥5)';
            }
            break;
    }

    return result;
}

/**
 * F計算（シミュレーション用）
 */
function calculateSimulationF(state, period, unitCost, investments) {
    const halfCost = Math.round(unitCost / 2);

    // 給与
    const machineCount = state.machines.length;
    const salary = (machineCount + state.workers + state.salesmen) * unitCost +
                   (state.workers + state.salesmen) * halfCost;

    // 減価償却
    let depreciation = 0;
    state.machines.forEach(m => {
        if (m.type === 'small') {
            depreciation += m.attachments > 0 ? (period === 2 ? 13 : 26) : (period === 2 ? 10 : 20);
        } else {
            depreciation += period === 2 ? 20 : 40;
        }
    });

    // チップコスト
    const chipCost = (state.chips.research + state.chips.education + state.chips.advertising) * 20 +
                     (state.nextPeriodChips.research + state.nextPeriodChips.education + state.nextPeriodChips.advertising) * 20;

    // 金利
    const interest = Math.round(state.loans * 0.1);

    return salary + depreciation + chipCost + interest;
}

/**
 * 製造能力計算
 */
function getMfgCapacity(state) {
    let capacity = 0;
    state.machines.forEach(m => {
        if (m.type === 'small') {
            capacity += m.attachments > 0 ? 2 : 1;
        } else {
            capacity += 4;
        }
    });
    capacity += Math.min(state.chips.education, 1);
    return Math.min(capacity, state.workers);
}

/**
 * 販売能力計算
 */
function getSalesCapacitySimple(state) {
    if (state.salesmen === 0) return 0;
    const base = state.salesmen * 2;
    const adBonus = Math.min(state.chips.advertising, state.salesmen * 2) * 2;
    const eduBonus = Math.min(state.chips.education, 1);
    return base + adBonus + eduBonus;
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.runFullSimulation = runFullSimulation;
}

console.log('AI シミュレーション準備完了。runFullSimulation() で実行できます。');
