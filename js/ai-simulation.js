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

// ============================================
// 詳細シミュレーション: v8最適戦略の完全追跡
// ============================================

/**
 * v8最適戦略（R2E1_NR）の詳細シミュレーション
 * 各行の現金フロー、期末の会社盤、P/V/M/Q/PQ/VQ/MQ/F/G/自己資本を表示
 */
function runDetailedSimulation() {
    console.log('\n' + '═'.repeat(80));
    console.log('【v8最適戦略 詳細シミュレーション】R2E1_NR (成功率95.20%)');
    console.log('═'.repeat(80));

    // 初期状態
    let state = {
        cash: 112,          // 137 - PC(20) - 保険(5) = 112
        equity: 283,
        loans: 0,
        shortLoans: 0,
        materials: 1,
        wip: 2,
        products: 1,
        machines: [{type: 'small', attachments: 0}],
        workers: 1,
        salesmen: 1,
        chips: {research: 0, education: 0, advertising: 0, computer: 1, insurance: 1},
        nextPeriodChips: {research: 0, education: 0, advertising: 0},
        hasExceeded300: false,
        carriedOverChips: {research: 0, education: 0, advertising: 0}
    };

    const periodResults = [];

    // 期別シミュレーション
    for (let period = 2; period <= 5; period++) {
        const result = simulateDetailedPeriod(state, period);
        periodResults.push(result);
        state = result.endState;
    }

    // 最終サマリー
    console.log('\n' + '═'.repeat(80));
    console.log('【最終結果サマリー】');
    console.log('═'.repeat(80));
    console.log('\n期別 G 推移:');
    periodResults.forEach(r => {
        console.log(`  ${r.period}期: G=¥${r.G.toFixed(0).padStart(4)} (MQ=¥${r.MQ.toFixed(0).padStart(4)} - F=¥${r.F.toFixed(0).padStart(3)})`);
    });
    console.log(`\n最終自己資本: ¥${state.equity} ${state.equity >= 450 ? '✅ 450達成!' : '❌ 未達成'}`);
    console.log('═'.repeat(80) + '\n');

    return { periodResults, finalEquity: state.equity, success: state.equity >= 450 };
}

/**
 * 1期の詳細シミュレーション
 */
function simulateDetailedPeriod(startState, period) {
    const state = JSON.parse(JSON.stringify(startState));

    // v8最適戦略の行別プラン
    const rowPlans = getV8RowPlan(period);
    const maxRows = {2: 20, 3: 30, 4: 34, 5: 35}[period];
    const baseSalary = {2: 22, 3: 24, 4: 26, 5: 28}[period];

    // 期首処理
    if (period >= 3) {
        state.chips.research += state.nextPeriodChips.research;
        state.chips.education += state.nextPeriodChips.education;
        state.chips.advertising += state.nextPeriodChips.advertising;
        state.carriedOverChips = {
            research: state.nextPeriodChips.research,
            education: state.nextPeriodChips.education,
            advertising: state.nextPeriodChips.advertising
        };
        state.nextPeriodChips = {research: 0, education: 0, advertising: 0};
    }

    console.log('\n' + '─'.repeat(80));
    console.log(`【${period}期】開始`);
    console.log('─'.repeat(80));
    printCompanyBoard(state, '期首');

    // 追跡変数
    let totalPQ = 0;      // 売上合計
    let totalVQ = 0;      // 変動費合計
    let totalMQ = 0;      // 限界利益合計
    let totalQ = 0;       // 販売数量合計
    const salesDetails = [];  // 販売詳細 [{P, V, M, Q, PQ, VQ, MQ}]
    const investments = [];
    const rowLogs = [];

    // 行別実行
    let row = 2;  // 1行目は期首処理
    let skipCount = 0;

    while (row <= maxRows) {
        // リスクカード確率（20%で1行消費）
        if (Math.random() < 0.20) {
            rowLogs.push({row, action: 'RISK', cashBefore: state.cash, cashAfter: state.cash, detail: 'リスクカード'});
            skipCount++;
            row++;
            continue;
        }

        const cashBefore = state.cash;
        const plannedAction = rowPlans.find(p => p.row === row);
        let action = plannedAction || decideDefaultAction(state, period);

        const result = executeDetailedAction(state, action, period, baseSalary);

        if (result.success) {
            if (result.sale) {
                totalPQ += result.sale.PQ;
                totalVQ += result.sale.VQ;
                totalMQ += result.sale.MQ;
                totalQ += result.sale.Q;
                salesDetails.push(result.sale);
            }
            if (result.investment) {
                investments.push(result.investment);
            }
            rowLogs.push({
                row,
                action: action?.type || action?.action || 'CYCLE',
                cashBefore,
                cashAfter: state.cash,
                detail: result.detail
            });
        } else {
            // 実行失敗 → 代替行動
            const altAction = decideDefaultAction(state, period);
            const altResult = executeDetailedAction(state, altAction, period, baseSalary);
            if (altResult.success) {
                if (altResult.sale) {
                    totalPQ += altResult.sale.PQ;
                    totalVQ += altResult.sale.VQ;
                    totalMQ += altResult.sale.MQ;
                    totalQ += altResult.sale.Q;
                    salesDetails.push(altResult.sale);
                }
            }
            rowLogs.push({
                row,
                action: altAction?.type || 'ALT',
                cashBefore,
                cashAfter: state.cash,
                detail: `計画失敗→${altResult.detail}`
            });
        }
        row++;
    }

    // 行別ログ出力（5行ごとにまとめて）
    console.log('\n【行別現金フロー】');
    console.log('  行  │ アクション          │ 現金Before → After │ 詳細');
    console.log('──────┼────────────────────┼───────────────────┼' + '─'.repeat(30));
    rowLogs.forEach(log => {
        const actionStr = (log.action || '').toString().padEnd(18);
        const cashFlow = `¥${log.cashBefore.toString().padStart(4)} → ¥${log.cashAfter.toString().padStart(4)}`;
        console.log(`  ${log.row.toString().padStart(2)}  │ ${actionStr} │ ${cashFlow} │ ${log.detail || ''}`);
    });

    // F計算
    const F = calculateDetailedF(state, period, baseSalary, investments, state.carriedOverChips);

    // G計算
    const G = totalMQ - F;

    // 税金計算
    let tax = 0;
    let dividend = 0;
    const prevEquity = state.equity;
    let newEquity = prevEquity + G;

    if (newEquity > 300) {
        if (!state.hasExceeded300) {
            tax = Math.round((newEquity - 300) * 0.5);
            state.hasExceeded300 = true;
        } else if (G > 0) {
            tax = Math.round(G * 0.5);
        }
        dividend = tax;  // 配当 = 税金と同額
    }
    state.equity = newEquity - tax - dividend;

    // 期末チップ処理
    if (period === 2) {
        // 2期末: 1枚返却、残りは繰越(最大3枚)
        const totalR = state.chips.research + state.nextPeriodChips.research;
        const totalE = state.chips.education + state.nextPeriodChips.education;
        const totalA = state.chips.advertising + state.nextPeriodChips.advertising;
        state.chips.research = Math.min(Math.max(0, totalR - 1), 3);
        state.chips.education = Math.min(Math.max(0, totalE - 1), 3);
        state.chips.advertising = Math.min(Math.max(0, totalA - 1), 3);
        state.chips.computer = 0;
        state.chips.insurance = 0;
        state.nextPeriodChips = {research: 0, education: 0, advertising: 0};
    } else {
        // 3-5期: 全チップ没収、翌期チップは次期に適用
        const carryR = state.nextPeriodChips.research;
        const carryE = state.nextPeriodChips.education;
        const carryA = state.nextPeriodChips.advertising;
        state.chips = {research: carryR, education: carryE, advertising: carryA, computer: 0, insurance: 0};
        state.nextPeriodChips = {research: 0, education: 0, advertising: 0};
    }

    // 販売詳細サマリー
    console.log('\n【販売詳細】');
    if (salesDetails.length > 0) {
        console.log('  回 │   P  │   V  │   M  │   Q  │   PQ   │   VQ   │   MQ');
        console.log('─────┼──────┼──────┼──────┼──────┼────────┼────────┼────────');
        salesDetails.forEach((s, i) => {
            console.log(`  ${(i+1).toString().padStart(2)} │ ${s.P.toString().padStart(4)} │ ${s.V.toString().padStart(4)} │ ${s.M.toString().padStart(4)} │ ${s.Q.toString().padStart(4)} │ ${s.PQ.toString().padStart(6)} │ ${s.VQ.toString().padStart(6)} │ ${s.MQ.toString().padStart(6)}`);
        });
        console.log('─────┼──────┼──────┼──────┼──────┼────────┼────────┼────────');
        const avgP = totalQ > 0 ? Math.round(totalPQ / totalQ) : 0;
        const avgV = totalQ > 0 ? Math.round(totalVQ / totalQ) : 0;
        const avgM = totalQ > 0 ? Math.round(totalMQ / totalQ) : 0;
        console.log(` 合計│ ${avgP.toString().padStart(4)} │ ${avgV.toString().padStart(4)} │ ${avgM.toString().padStart(4)} │ ${totalQ.toString().padStart(4)} │ ${totalPQ.toString().padStart(6)} │ ${totalVQ.toString().padStart(6)} │ ${totalMQ.toString().padStart(6)}`);
    } else {
        console.log('  販売なし');
    }

    // 期末財務サマリー
    console.log('\n【期末財務】');
    console.log(`  PQ(売上)       : ¥${totalPQ}`);
    console.log(`  VQ(変動費)     : ¥${totalVQ}`);
    console.log(`  MQ(限界利益)   : ¥${totalMQ}`);
    console.log(`  F (固定費)     : ¥${F}`);
    console.log(`  G (経常利益)   : ¥${G}`);
    console.log(`  税金           : ¥${tax}`);
    console.log(`  配当           : ¥${dividend}`);
    console.log(`  自己資本       : ¥${prevEquity} + ¥${G} - ¥${tax} - ¥${dividend} = ¥${state.equity}`);

    // 期末会社盤
    printCompanyBoard(state, '期末');

    return {
        period,
        PQ: totalPQ,
        VQ: totalVQ,
        MQ: totalMQ,
        Q: totalQ,
        F,
        G,
        tax,
        dividend,
        investments,
        endState: state,
        salesDetails,
        riskCount: skipCount
    };
}

/**
 * 会社盤の状態を表示
 */
function printCompanyBoard(state, label) {
    console.log(`\n【会社盤 - ${label}】`);
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log(`│ 現金: ¥${state.cash.toString().padStart(4)}  │ 借入: 長期¥${(state.loans||0).toString().padStart(3)} 短期¥${(state.shortLoans||0).toString().padStart(3)}  │ 自己資本: ¥${state.equity.toString().padStart(4)} │`);
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│ 材料: ${state.materials}個  仕掛: ${state.wip}個  製品: ${state.products}個                                  │`);
    console.log('├─────────────────────────────────────────────────────────────────┤');
    const mfg = getMfgCapacity(state);
    const sales = getSalesCapacitySimple(state);
    console.log(`│ 製造能力: ${mfg}  販売能力: ${sales}  (ワーカー${state.workers} セールス${state.salesmen})                 │`);
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│ チップ: 研究${state.chips.research} 教育${state.chips.education} 広告${state.chips.advertising} │ 次期: 研究${state.nextPeriodChips.research} 教育${state.nextPeriodChips.education} 広告${state.nextPeriodChips.advertising}          │`);
    console.log('└─────────────────────────────────────────────────────────────────┘');
}

/**
 * v8最適戦略の行別プラン
 */
function getV8RowPlan(period) {
    const plans = {
        2: [
            {row: 2, type: 'BUY_CHIP', chipType: 'research'},
            {row: 3, type: 'BUY_CHIP', chipType: 'research'},
            {row: 4, type: 'BUY_CHIP', chipType: 'education'},
            {row: 5, type: 'BUY_NEXT_CHIP', chipType: 'research'},
            {row: 6, type: 'SELL', qty: 1},
            {row: 7, type: 'PRODUCE'},
            {row: 8, type: 'BUY_MATERIALS', qty: 2},
            {row: 9, type: 'SELL', qty: 1},
            {row: 10, type: 'PRODUCE'},
            {row: 11, type: 'BUY_MATERIALS', qty: 2},
            {row: 12, type: 'SELL', qty: 1},
            {row: 13, type: 'PRODUCE'},
            {row: 14, type: 'BUY_MATERIALS', qty: 2},
            {row: 15, type: 'SELL', qty: 1},
            {row: 16, type: 'PRODUCE'},
            {row: 17, type: 'BUY_MATERIALS', qty: 2},
            {row: 18, type: 'PRODUCE'},
        ],
        3: [
            {row: 2, type: 'PRODUCE'},
            {row: 3, type: 'SELL', qty: 2},
            {row: 4, type: 'BUY_ATTACHMENT'},
            {row: 5, type: 'HIRE_WORKER'},
            {row: 6, type: 'BUY_MATERIALS', qty: 3},
            {row: 7, type: 'PRODUCE'},
            {row: 8, type: 'SELL', qty: 2},
            {row: 9, type: 'BUY_MATERIALS', qty: 2},
            {row: 10, type: 'PRODUCE'},
            {row: 11, type: 'SELL', qty: 2},
            {row: 12, type: 'BUY_NEXT_CHIP', chipType: 'research'},
            {row: 13, type: 'BUY_MATERIALS', qty: 2},
            {row: 14, type: 'PRODUCE'},
            {row: 15, type: 'SELL', qty: 2},
            {row: 16, type: 'BUY_CHIP', chipType: 'advertising'},
            {row: 17, type: 'BUY_MATERIALS', qty: 3},
            {row: 18, type: 'PRODUCE'},
            {row: 19, type: 'SELL', qty: 3},
            {row: 20, type: 'BUY_NEXT_CHIP', chipType: 'education'},
            {row: 21, type: 'BUY_MATERIALS', qty: 3},
            {row: 22, type: 'PRODUCE'},
            {row: 23, type: 'SELL', qty: 3},
            {row: 24, type: 'BUY_MATERIALS', qty: 3},
            {row: 25, type: 'PRODUCE'},
            {row: 26, type: 'SELL', qty: 2},
            {row: 27, type: 'BUY_MATERIALS', qty: 2},
            {row: 28, type: 'PRODUCE'},
        ],
        4: [
            // 4期は繰越チップ(研究1+教育1)を活用
            {row: 2, type: 'PRODUCE'},
            {row: 3, type: 'SELL', qty: 2},
            {row: 4, type: 'HIRE_SALESMAN'},
        ],
        5: [
            // 5期は全力販売
            {row: 2, type: 'PRODUCE'},
            {row: 3, type: 'SELL', qty: 3},
        ]
    };
    return plans[period] || [];
}

/**
 * デフォルトアクション決定
 */
function decideDefaultAction(state, period) {
    const mfgCap = getMfgCapacity(state);
    const salesCap = getSalesCapacitySimple(state);

    if (state.products > 0 && salesCap > 0) {
        return {type: 'SELL', qty: Math.min(state.products, salesCap)};
    }
    if ((state.wip > 0 || state.materials > 0) && mfgCap > 0) {
        return {type: 'PRODUCE'};
    }
    if (state.cash >= 30) {
        return {type: 'BUY_MATERIALS', qty: Math.min(3, mfgCap || 1)};
    }
    return {type: 'WAIT'};
}

/**
 * アクション実行（詳細版）
 */
function executeDetailedAction(state, action, period, baseSalary) {
    const result = {success: false, detail: '', sale: null, investment: null};
    if (!action) return result;

    const type = action.type || action.action;

    switch (type) {
        case 'SELL':
            const qty = action.qty || Math.min(state.products, getSalesCapacitySimple(state));
            if (state.products >= qty && qty > 0) {
                // 価格決定（研究チップによる価格優位）
                const researchBonus = state.chips.research * 2;
                let P = 24;  // 基本価格（大阪）
                if (researchBonus >= 4) P = 28;  // 名古屋
                if (researchBonus >= 6) P = 32;  // 福岡

                const V = 10;  // 原価（材料10円/個）
                const M = P - V;
                const PQ = P * qty;
                const VQ = V * qty;
                const MQ = M * qty;

                state.cash += PQ;
                state.products -= qty;
                result.success = true;
                result.detail = `${qty}個 @¥${P} → +¥${PQ}`;
                result.sale = {P, V, M, Q: qty, PQ, VQ, MQ};
            } else {
                result.detail = '製品なし';
            }
            break;

        case 'PRODUCE':
            const mfgCap = getMfgCapacity(state);
            const toComplete = Math.min(state.wip, mfgCap);
            const toStart = Math.min(state.materials, mfgCap - toComplete);
            const total = toComplete + toStart;
            if (total >= 1) {
                state.products += toComplete;
                state.wip = state.wip - toComplete + toStart;
                state.materials -= toStart;
                const prodCost = toComplete;
                state.cash -= prodCost;
                result.success = true;
                result.detail = `完成${toComplete}+投入${toStart} (-¥${prodCost})`;
            } else {
                result.detail = '材料/仕掛なし';
            }
            break;

        case 'BUY_MATERIALS':
            const buyQty = action.qty || 2;
            const matCost = buyQty * 10;
            if (state.cash >= matCost) {
                state.materials += buyQty;
                state.cash -= matCost;
                result.success = true;
                result.detail = `${buyQty}個 (-¥${matCost})`;
            } else {
                result.detail = '現金不足';
            }
            break;

        case 'BUY_CHIP':
            const chipCost = period === 2 ? 20 : 40;
            if (state.cash >= chipCost) {
                state.chips[action.chipType]++;
                state.cash -= chipCost;
                result.success = true;
                result.detail = `${action.chipType} (-¥${chipCost})`;
                result.investment = `${action.chipType}チップ¥${chipCost}`;
            } else {
                result.detail = '現金不足';
            }
            break;

        case 'BUY_NEXT_CHIP':
            if (state.cash >= 20 && period >= 2) {
                state.nextPeriodChips[action.chipType]++;
                state.cash -= 20;
                result.success = true;
                result.detail = `次期${action.chipType} (-¥20)`;
                result.investment = `次期${action.chipType}¥20`;
            } else {
                result.detail = '条件未達';
            }
            break;

        case 'BUY_ATTACHMENT':
            if (state.cash >= 30 && state.machines[0].attachments === 0) {
                state.machines[0].attachments = 1;
                state.cash -= 30;
                result.success = true;
                result.detail = 'ｱﾀｯﾁ (-¥30)';
                result.investment = 'ｱﾀｯﾁ¥30';
            } else {
                result.detail = '条件未達';
            }
            break;

        case 'HIRE_WORKER':
            if (state.cash >= 5) {
                state.workers++;
                state.cash -= 5;
                result.success = true;
                result.detail = `ﾜｰｶｰ${state.workers}名 (-¥5)`;
                result.investment = 'ﾜｰｶｰ¥5';
            } else {
                result.detail = '現金不足';
            }
            break;

        case 'HIRE_SALESMAN':
            if (state.cash >= 5) {
                state.salesmen++;
                state.cash -= 5;
                result.success = true;
                result.detail = `ｾｰﾙｽ${state.salesmen}名 (-¥5)`;
                result.investment = 'ｾｰﾙｽ¥5';
            } else {
                result.detail = '現金不足';
            }
            break;

        case 'WAIT':
        case 'RISK':
            result.success = true;
            result.detail = '待機';
            break;

        default:
            result.detail = `不明: ${type}`;
    }

    return result;
}

/**
 * 詳細F計算
 */
function calculateDetailedF(state, period, baseSalary, investments, carriedOverChips) {
    const halfSalary = Math.round(baseSalary / 2);

    // 給与: (機械数 + ワーカー数 + セールス数) × 単価 + (ワーカー + セールス) × 半額
    const machineCount = state.machines.length;
    const salary = (machineCount + state.workers + state.salesmen) * baseSalary +
                   (state.workers + state.salesmen) * halfSalary;

    // 減価償却
    let depreciation = 0;
    state.machines.forEach(m => {
        if (m.type === 'small') {
            const baseDepre = period === 2 ? 10 : 20;
            const attachDepre = m.attachments > 0 ? (period === 2 ? 3 : 6) : 0;
            depreciation += baseDepre + attachDepre;
        } else {
            depreciation += period === 2 ? 20 : 40;
        }
    });

    // チップコスト（当期購入分 + 繰越分）
    const currentChipCost = (state.chips.research + state.chips.education + state.chips.advertising) * 20;
    const nextChipCost = (state.nextPeriodChips.research + state.nextPeriodChips.education + state.nextPeriodChips.advertising) * 20;
    // 繰越チップは20円/枚（F計算では必要）
    const carriedCost = ((carriedOverChips?.research || 0) + (carriedOverChips?.education || 0) + (carriedOverChips?.advertising || 0)) * 20;

    // 金利
    const longInterest = Math.round((state.loans || 0) * 0.1);
    const shortInterest = Math.round((state.shortLoans || 0) * 0.2);

    // PC・保険（2期のみ）
    const pcCost = period === 2 ? 20 : 0;
    const insuranceCost = period === 2 ? 5 : 0;

    const total = salary + depreciation + currentChipCost + nextChipCost + longInterest + shortInterest + pcCost + insuranceCost;

    console.log(`\n【F内訳】`);
    console.log(`  給与       : ¥${salary} (基本${baseSalary}×${machineCount+state.workers+state.salesmen} + 半額${halfSalary}×${state.workers+state.salesmen})`);
    console.log(`  減価償却   : ¥${depreciation}`);
    console.log(`  チップ費用 : ¥${currentChipCost + nextChipCost} (当期¥${currentChipCost} + 次期¥${nextChipCost})`);
    if (longInterest + shortInterest > 0) {
        console.log(`  金利       : ¥${longInterest + shortInterest} (長期¥${longInterest} + 短期¥${shortInterest})`);
    }
    if (pcCost + insuranceCost > 0) {
        console.log(`  PC+保険    : ¥${pcCost + insuranceCost}`);
    }
    console.log(`  ──────────────────`);
    console.log(`  F合計      : ¥${total}`);

    return total;
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.runFullSimulation = runFullSimulation;
    window.runDetailedSimulation = runDetailedSimulation;
}

console.log('AI シミュレーション準備完了。');
console.log('  runFullSimulation()     - 簡易シミュレーション');
console.log('  runDetailedSimulation() - 詳細シミュレーション（P,V,M,Q,PQ,VQ,MQ,F,G表示）');
