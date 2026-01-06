// ==============================================
// modals.js - モーダル表示モジュール
// ==============================================

// AIアドバイス表示（ゲーム中）- 1行ずつ行動提案
function showAIAdviceForCurrentState() {
    const company = gameState.companies[0];
    const period = gameState.currentPeriod;
    const currentRow = company.currentRow || 1;
    const maxRows = gameState.maxRows || MAX_ROWS_BY_PERIOD[period] || 20;
    const remainingRows = maxRows - currentRow;

    // 能力計算
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);
    const researchChips = company.chips?.research || 0;
    const priceBonus = researchChips * 2;

    // サイコロ想定（3期以降: サイコロ4を想定）
    const assumedDice = 4;
    const assumedWageMultiplier = period >= 3 ? 1.2 : 1.0;  // サイコロ4以上 = ×1.2
    const assumedOsakaMax = period >= 3 ? 24 : 28;  // 20 + サイコロ4
    const closedMarkets = period >= 3 ? ['仙台', '札幌'] : [];  // サイコロ4以上 = 仙台・札幌閉鎖

    // 5の倍数行でリスクカード
    const isRiskRow = (currentRow % 5 === 0);
    const nextRiskRow = Math.ceil(currentRow / 5) * 5;
    const rowsToNextRisk = nextRiskRow - currentRow;

    // 現在の状況を分析
    let recommendation = '';
    let recommendedAction = '';
    let actionColor = '#3b82f6';
    let actionIcon = '🎯';

    // 2期専用パターン（参考: 理想的な行動順序）
    const period2Reference = {
        2:  { action: '教育チップ購入', icon: '📚', color: '#8b5cf6', detail: '販売能力+1（2→3）', type: 'chip_edu' },
        3:  { action: '材料5個購入', icon: '📦', color: '#6366f1', detail: '12円×5推奨、無理なら13円×5', type: 'buy_mat', qty: 5 },
        4:  { action: '完成・投入', icon: '🏭', color: '#3b82f6', detail: '3個完成＋3個投入', type: 'produce' },
        5:  { action: 'リスクカード', icon: '⚠️', color: '#dc2626', detail: '5の倍数行', type: 'risk' },
        6:  { action: '研究開発チップ購入', icon: '🔬', color: '#2563eb', detail: '価格競争力+2', type: 'chip_res' },
        7:  { action: '商品販売', icon: '💰', color: '#22c55e', detail: '29円×3個（高く売れればOK）', type: 'sell', price: 29 },
        8:  { action: '完成・投入', icon: '🏭', color: '#3b82f6', detail: '3個完成＋3個投入', type: 'produce' },
        9:  { action: '研究開発チップ購入', icon: '🔬', color: '#2563eb', detail: '価格競争力+4', type: 'chip_res' },
        10: { action: 'リスクカード', icon: '⚠️', color: '#dc2626', detail: '5の倍数行', type: 'risk' },
        11: { action: '研究開発チップ購入', icon: '🔬', color: '#2563eb', detail: '価格競争力+6', type: 'chip_res' },
        12: { action: '研究開発チップ購入', icon: '🔬', color: '#2563eb', detail: '価格競争力+8（4枚目）', type: 'chip_res' },
        13: { action: '商品販売', icon: '💰', color: '#22c55e', detail: '32円×3個（高く売れればOK）', type: 'sell', price: 32 },
        14: { action: '材料6個購入', icon: '📦', color: '#6366f1', detail: '12円×6推奨、無理なら13-14円', type: 'buy_mat', qty: 6 },
        15: { action: 'リスクカード', icon: '⚠️', color: '#dc2626', detail: '5の倍数行', type: 'risk' },
        16: { action: '完成・投入', icon: '🏭', color: '#3b82f6', detail: '3個完成＋3個投入', type: 'produce' },
        17: { action: '商品販売', icon: '💰', color: '#22c55e', detail: '32円×3個（高く売れればOK）', type: 'sell', price: 32 },
        18: { action: '教育チップ購入', icon: '📚', color: '#8b5cf6', detail: '販売能力+1（3→4）', type: 'chip_edu' },
        19: { action: '完成・投入', icon: '🏭', color: '#3b82f6', detail: '3個完成＋3個投入', type: 'produce' },
        20: { action: 'リスクカード', icon: '⚠️', color: '#dc2626', detail: '5の倍数行（期末）', type: 'risk' }
    };

    // 2期の状況適応型アドバイス
    if (period === 2) {
        const ref = period2Reference[currentRow];
        let adjusted = false;
        let adjustReason = '';

        if (isRiskRow) {
            // 5の倍数行はリスクカード（絶対）
            recommendedAction = 'リスクカードを引く';
            recommendation = `${currentRow}行目（5の倍数）です`;
            actionColor = '#dc2626';
            actionIcon = '⚠️';
        } else if (ref) {
            // 参考パターンに基づき、状況を考慮して調整
            switch (ref.type) {
                case 'chip_edu':
                    if (company.cash < 20) {
                        // 現金不足：先に販売か製造
                        if (company.products > 0) {
                            recommendedAction = '商品販売（現金確保）';
                            recommendation = `現金¥${company.cash}で教育チップ購入困難。先に販売を`;
                            actionColor = '#22c55e'; actionIcon = '💰';
                        } else {
                            recommendedAction = ref.action + '（次行以降）';
                            recommendation = `現金¥${company.cash}不足。カードを引いて機会を待つ`;
                            actionColor = '#64748b'; actionIcon = '🎴';
                        }
                        adjusted = true;
                    } else {
                        recommendedAction = ref.action;
                        recommendation = ref.detail;
                        actionColor = ref.color; actionIcon = ref.icon;
                    }
                    break;

                case 'chip_res':
                    if (company.cash < 20) {
                        if (company.products > 0) {
                            recommendedAction = '商品販売（現金確保）';
                            recommendation = `現金¥${company.cash}。研究チップより先に販売`;
                            actionColor = '#22c55e'; actionIcon = '💰';
                        } else if (company.wip > 0 || company.materials > 0) {
                            recommendedAction = '完成・投入';
                            recommendation = '現金不足。製造を進めて販売準備';
                            actionColor = '#3b82f6'; actionIcon = '🏭';
                        } else {
                            recommendedAction = 'カードを引く';
                            recommendation = `現金¥${company.cash}不足。機会を待つ`;
                            actionColor = '#64748b'; actionIcon = '🎴';
                        }
                        adjusted = true;
                    } else {
                        recommendedAction = ref.action;
                        recommendation = ref.detail + `（現在${researchChips}枚）`;
                        actionColor = ref.color; actionIcon = ref.icon;
                    }
                    break;

                case 'buy_mat':
                    const matCapacity = getMaterialCapacity(company);
                    const canBuy = matCapacity - company.materials;
                    if (canBuy <= 0) {
                        recommendedAction = '完成・投入（倉庫満杯）';
                        recommendation = `材料${company.materials}個で満杯。先に製造を`;
                        actionColor = '#3b82f6'; actionIcon = '🏭';
                        adjusted = true;
                    } else if (company.cash < 50) {
                        const affordQty = Math.floor(company.cash / 12);
                        if (affordQty > 0) {
                            recommendedAction = `材料${Math.min(affordQty, canBuy)}個購入`;
                            recommendation = `現金¥${company.cash}。買える分だけ購入`;
                            actionColor = ref.color; actionIcon = ref.icon;
                        } else {
                            recommendedAction = '販売優先';
                            recommendation = '現金不足で材料購入困難';
                            actionColor = '#22c55e'; actionIcon = '💰';
                        }
                        adjusted = true;
                    } else {
                        recommendedAction = ref.action;
                        recommendation = ref.detail;
                        actionColor = ref.color; actionIcon = ref.icon;
                    }
                    break;

                case 'produce':
                    if (company.wip === 0 && company.materials === 0) {
                        recommendedAction = '材料仕入れ';
                        recommendation = '材料・仕掛品なし。先に材料購入';
                        actionColor = '#6366f1'; actionIcon = '📦';
                        adjusted = true;
                    } else {
                        const canComplete = Math.min(company.wip, mfgCapacity);
                        const canStart = Math.min(company.materials, mfgCapacity);
                        recommendedAction = ref.action;
                        recommendation = `${canComplete}個完成＋${canStart}個投入`;
                        actionColor = ref.color; actionIcon = ref.icon;
                    }
                    break;

                case 'sell':
                    if (company.products === 0) {
                        if (company.wip > 0) {
                            recommendedAction = '完成・投入（製品なし）';
                            recommendation = '製品がない。先に完成させる';
                            actionColor = '#3b82f6'; actionIcon = '🏭';
                        } else {
                            recommendedAction = 'カードを引く';
                            recommendation = '製品なし。製造を進める';
                            actionColor = '#64748b'; actionIcon = '🎴';
                        }
                        adjusted = true;
                    } else {
                        const sellQty = Math.min(company.products, salesCapacity);
                        recommendedAction = `商品販売（${sellQty}個）`;
                        recommendation = `${ref.price}円以上で${sellQty}個販売`;
                        actionColor = ref.color; actionIcon = ref.icon;
                    }
                    break;

                default:
                    recommendedAction = ref.action;
                    recommendation = ref.detail;
                    actionColor = ref.color; actionIcon = ref.icon;
            }

            // 調整があった場合、参考パターンも表示
            if (adjusted) {
                recommendation += `\n【参考】${ref.action}: ${ref.detail}`;
            }
        } else {
            // パターン外の行（1行目など）
            recommendedAction = 'カードを引く';
            recommendation = '意思決定カードを引いて行動を選択';
            actionColor = '#64748b';
            actionIcon = '🎴';
        }
    } else if (isRiskRow) {
        // 5の倍数行はリスクカード
        recommendedAction = 'リスクカードを引く';
        recommendation = `${currentRow}行目（5の倍数）です。リスクカードを引いてください。`;
        actionColor = '#dc2626';
        actionIcon = '⚠️';
    } else {
        // 3期以降は状況に応じた推奨
        // AIBrainからの推奨を取得
        let brainAdvice = null;
        if (typeof AIBrain !== 'undefined' && AIBrain.getRecommendedAction) {
            brainAdvice = AIBrain.getRecommendedAction(company, 0);
        }

        if (brainAdvice && brainAdvice.priority === 'high') {
            recommendedAction = brainAdvice.action === 'SELL_TO_REDUCE_RISK' ? '販売（在庫リスク回避）' :
                               brainAdvice.action === 'SELL_FOR_CASH' ? '販売（現金確保）' :
                               brainAdvice.action;
            recommendation = brainAdvice.reason;
            actionColor = '#f59e0b';
            actionIcon = '⚡';
        } else if (company.products > 0 && salesCapacity > 0) {
            const sellQty = Math.min(company.products, salesCapacity);
            recommendedAction = `販売（${sellQty}個）`;
            recommendation = `製品${company.products}個あり。販売能力${salesCapacity}で${sellQty}個販売可能。`;
            actionColor = '#22c55e';
            actionIcon = '💰';
        } else if (company.wip > 0 || company.materials > 0) {
            recommendedAction = '完成・投入';
            const canComplete = Math.min(company.wip, mfgCapacity);
            const canStart = Math.min(company.materials, mfgCapacity);
            recommendation = `仕掛品${company.wip}個→製品${canComplete}個完成、材料${company.materials}個→仕掛品${canStart}個投入`;
            actionColor = '#3b82f6';
            actionIcon = '🏭';
        } else if (company.materials === 0 && company.cash >= 20) {
            const maxBuy = Math.min(10, Math.floor(company.cash / 10));
            const suggestedQty = Math.min(mfgCapacity * 2, maxBuy);
            recommendedAction = `材料仕入（${suggestedQty}個）`;
            recommendation = `材料なし。${suggestedQty}個購入推奨（¥${suggestedQty * 10}）`;
            actionColor = '#8b5cf6';
            actionIcon = '📦';
        } else if (researchChips < 3 && company.cash >= 40) {
            recommendedAction = '研究開発チップ購入';
            recommendation = `青チップ${researchChips}枚。価格競争力+${priceBonus}→+${priceBonus + 2}へ`;
            actionColor = '#6366f1';
            actionIcon = '🎰';
        } else {
            recommendedAction = 'カードを引く';
            recommendation = '意思決定カードを引いて行動を選択';
            actionColor = '#64748b';
            actionIcon = '🎴';
        }
    }

    // 今後の5行分の提案を生成
    let futureActions = [];
    let simState = JSON.parse(JSON.stringify(company));
    for (let i = 0; i < 5 && (currentRow + i) <= maxRows; i++) {
        const row = currentRow + i;
        const isRisk = (row % 5 === 0);

        if (isRisk) {
            futureActions.push({ row, action: 'リスクカード', icon: '⚠️', color: '#dc2626' });
        } else if (simState.products > 0 && salesCapacity > 0) {
            const qty = Math.min(simState.products, salesCapacity);
            futureActions.push({ row, action: `販売 ${qty}個`, icon: '💰', color: '#22c55e' });
            simState.products -= qty;
        } else if (simState.wip > 0 || simState.materials > 0) {
            futureActions.push({ row, action: '完成・投入', icon: '🏭', color: '#3b82f6' });
            const complete = Math.min(simState.wip, mfgCapacity);
            const start = Math.min(simState.materials, mfgCapacity);
            simState.products += complete;
            simState.wip = simState.wip - complete + start;
            simState.materials -= start;
        } else if (simState.materials === 0) {
            futureActions.push({ row, action: '材料仕入 5個', icon: '📦', color: '#8b5cf6' });
            simState.materials = 5;
        } else {
            futureActions.push({ row, action: 'チップ購入', icon: '🎰', color: '#6366f1' });
        }
    }

    let futureHtml = futureActions.map(a => `
        <div style="display: flex; align-items: center; padding: 6px 10px; background: ${a.color}15; border-radius: 6px; margin: 4px 0; border-left: 3px solid ${a.color};">
            <span style="font-size: 12px; color: #666; width: 35px;">${a.row}行</span>
            <span style="font-size: 16px; margin-right: 8px;">${a.icon}</span>
            <span style="font-size: 13px; color: #333;">${a.action}</span>
        </div>
    `).join('');

    // サイコロ想定情報（3期以降のみ表示）
    const diceInfoHtml = period >= 3 ? `
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); border-radius: 10px; padding: 10px; margin-bottom: 15px; color: white;">
            <div style="font-size: 11px; opacity: 0.9; margin-bottom: 5px;">🎲 サイコロ${assumedDice}想定</div>
            <div style="display: flex; justify-content: space-around; font-size: 10px;">
                <div style="text-align: center;">
                    <div style="opacity: 0.8;">閉鎖</div>
                    <div style="font-weight: bold;">仙台・札幌</div>
                </div>
                <div style="text-align: center;">
                    <div style="opacity: 0.8;">人件費</div>
                    <div style="font-weight: bold;">×${assumedWageMultiplier}</div>
                </div>
                <div style="text-align: center;">
                    <div style="opacity: 0.8;">大阪上限</div>
                    <div style="font-weight: bold;">¥${assumedOsakaMax}</div>
                </div>
            </div>
        </div>
    ` : '';

    const content = `
        <div style="padding: 10px;">
            ${diceInfoHtml}
            <!-- 現在の状況 -->
            <div style="background: #f8fafc; border-radius: 10px; padding: 12px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <div style="text-align: center; flex: 1;">
                        <div style="font-size: 10px; color: #64748b;">現在行</div>
                        <div style="font-size: 18px; font-weight: bold; color: #1e40af;">${currentRow}/${maxRows}</div>
                    </div>
                    <div style="text-align: center; flex: 1;">
                        <div style="font-size: 10px; color: #64748b;">現金</div>
                        <div style="font-size: 18px; font-weight: bold; color: #059669;">¥${company.cash}</div>
                    </div>
                    <div style="text-align: center; flex: 1;">
                        <div style="font-size: 10px; color: #64748b;">次リスク</div>
                        <div style="font-size: 18px; font-weight: bold; color: #dc2626;">${rowsToNextRisk === 0 ? '今！' : rowsToNextRisk + '行後'}</div>
                    </div>
                </div>
                <div style="display: flex; justify-content: center; gap: 10px; font-size: 11px;">
                    <span style="background: #e0e7ff; padding: 3px 8px; border-radius: 4px;">材料 ${company.materials}</span>
                    <span style="background: #fae8ff; padding: 3px 8px; border-radius: 4px;">仕掛 ${company.wip}</span>
                    <span style="background: #dbeafe; padding: 3px 8px; border-radius: 4px;">製品 ${company.products}</span>
                    <span style="background: #dcfce7; padding: 3px 8px; border-radius: 4px;">青 ${researchChips}</span>
                </div>
            </div>

            <!-- 推奨アクション -->
            <div style="background: linear-gradient(135deg, ${actionColor} 0%, ${actionColor}dd 100%); border-radius: 12px; padding: 15px; margin-bottom: 15px; color: white; text-align: center;">
                <div style="font-size: 28px; margin-bottom: 8px;">${actionIcon}</div>
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">${recommendedAction}</div>
                <div style="font-size: 12px; opacity: 0.9;">${recommendation}</div>
            </div>

            <!-- 今後5行の予定 -->
            <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px;">
                <div style="font-size: 12px; color: #666; margin-bottom: 8px; font-weight: bold;">📋 今後5行の提案</div>
                ${futureHtml}
                <div style="font-size: 10px; color: #999; margin-top: 8px; text-align: center;">
                    ※5の倍数行でリスクカードを引きます
                </div>
            </div>

            <button class="submit-btn" onclick="closeModal()" style="margin-top: 15px;">閉じる</button>
        </div>
    `;

    showModal('🤖 AIアドバイス', content);
}

// AIアドバイス表示（ゲーム中）
function showCurrentGameAIAdvice() {
    if (typeof showAIAdviceForCurrentState === 'function') {
        showAIAdviceForCurrentState();
    } else {
        showToast('AI機能を読み込み中...', 'error');
    }
}

// AI行動提案モーダル（メニュー画面）
function showAIActionPlanModal() {
    if (typeof runOptimalSimulation === 'function') {
        runOptimalSimulation();
    } else {
        showToast('AI機能を読み込み中...', 'error');
    }
}

// 行動ログを表示するモーダル
function showActionLogModal() {
    const companies = gameState.companies;

    let content = `
        <div style="max-height: 70vh; overflow-y: auto; padding: 10px;">
            <div style="text-align: center; margin-bottom: 15px;">
                <div style="font-size: 20px; font-weight: bold;">第${gameState.currentPeriod}期 行動ログ</div>
            </div>
    `;

    for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        const companyLogs = gameState.actionLog.filter(log => log.companyIndex === i);
        const emoji = i === 0 ? '👤' : ['🅰️', '🅱️', '©️', '🇩', '🇪'][i - 1] || '🏢';
        const bgColor = i === 0 ? '#eff6ff' : '#f9fafb';

        content += `
            <div style="background: ${bgColor}; border-radius: 10px; padding: 12px; margin-bottom: 12px; border: 1px solid #e5e7eb;">
                <div style="display: flex; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
                    <span style="font-size: 24px; margin-right: 10px;">${emoji}</span>
                    <span style="font-weight: bold; font-size: 16px; color: ${i === 0 ? '#2563eb' : '#374151'};">${company.name}</span>
                    <span style="margin-left: auto; font-size: 12px; color: #666;">使用行数: ${company.currentRow - 1}</span>
                </div>
        `;

        if (companyLogs.length === 0) {
            content += `<div style="color: #999; font-size: 12px; padding: 5px;">行動記録なし</div>`;
        } else {
            content += '<div style="font-size: 12px;">';
            companyLogs.forEach((log, idx) => {
                const cashStr = log.cashChange !== 0
                    ? `<span style="color: ${log.cashChange > 0 ? '#16a34a' : '#dc2626'}; font-weight: bold;">${log.cashChange > 0 ? '+' : ''}¥${log.cashChange}</span>`
                    : '';
                const rowStr = log.rowUsed ? `<span style="color: #9333ea; margin-left: 5px;">【1行】</span>` : '';

                content += `
                    <div style="display: flex; align-items: flex-start; padding: 4px 0; ${idx < companyLogs.length - 1 ? 'border-bottom: 1px dashed #e5e7eb;' : ''}">
                        <span style="color: #9ca3af; width: 25px; flex-shrink: 0;">${log.row}行</span>
                        <span style="color: #374151; flex: 1;">${log.action}: ${log.details}</span>
                        <span style="min-width: 70px; text-align: right;">${cashStr}${rowStr}</span>
                    </div>
                `;
            });
            content += '</div>';
        }

        const totalIncome = companyLogs.filter(l => l.cashChange > 0).reduce((sum, l) => sum + l.cashChange, 0);
        const totalExpense = companyLogs.filter(l => l.cashChange < 0).reduce((sum, l) => sum + l.cashChange, 0);
        content += `
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #d1d5db; display: flex; justify-content: space-between; font-size: 11px;">
                <span style="color: #16a34a;">収入計: +¥${totalIncome}</span>
                <span style="color: #dc2626;">支出計: ¥${totalExpense}</span>
                <span style="font-weight: bold;">差引: ¥${totalIncome + totalExpense}</span>
            </div>
        `;

        content += '</div>';
    }

    content += `
        </div>
        <button class="submit-btn" onclick="closeModal(); if(window.lastFinancialData) showFinancialSummary(window.lastFinancialData);">閉じる</button>
    `;

    showModal('行動ログ', content);
}

// サイコロ結果詳細モーダル
function showDiceResultModal() {
    if (!gameState.diceRoll) {
        showToast('サイコロ情報がありません', 'error');
        return;
    }

    const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const diceEmoji = diceEmojis[gameState.diceRoll - 1];

    // 閉鎖市場の判定
    const closedMarkets = gameState.diceRoll <= 3 ? '仙台のみ' : '仙台・札幌';
    const closedColor = gameState.diceRoll <= 3 ? '#f59e0b' : '#dc2626';

    const content = `
        <div style="text-align: center; padding: 20px;">
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 16px; padding: 25px; color: white; margin-bottom: 20px;">
                <div style="font-size: 72px; margin-bottom: 15px;">${diceEmoji}</div>
                <div style="font-size: 36px; font-weight: bold; margin-bottom: 10px;">出目：${gameState.diceRoll}</div>
            </div>

            <div style="display: grid; gap: 15px; margin-bottom: 20px;">
                <div style="background: ${closedColor}; color: white; padding: 15px; border-radius: 12px;">
                    <div style="font-size: 12px; opacity: 0.9;">閉鎖市場</div>
                    <div style="font-size: 20px; font-weight: bold;">${closedMarkets}</div>
                    <div style="font-size: 11px; opacity: 0.8; margin-top: 5px;">販売・仕入不可</div>
                </div>

                <div style="background: #2563eb; color: white; padding: 15px; border-radius: 12px;">
                    <div style="font-size: 12px; opacity: 0.9;">人件費倍率</div>
                    <div style="font-size: 20px; font-weight: bold;">×${gameState.wageMultiplier}</div>
                    <div style="font-size: 11px; opacity: 0.8; margin-top: 5px;">期末給与計算時に適用</div>
                </div>

                <div style="background: #059669; color: white; padding: 15px; border-radius: 12px;">
                    <div style="font-size: 12px; opacity: 0.9;">大阪販売上限価格</div>
                    <div style="font-size: 20px; font-weight: bold;">¥${gameState.osakaMaxPrice || (20 + gameState.diceRoll)}</div>
                    <div style="font-size: 11px; opacity: 0.8; margin-top: 5px;">入札上限・記帳価格</div>
                </div>
            </div>

            <button class="submit-btn" onclick="closeModal()" style="width: 100%;">閉じる</button>
        </div>
    `;

    showModal(`第${gameState.currentPeriod}期 サイコロ結果`, content);
}

// Show period payment breakdown
function showPeriodPaymentBreakdown() {
    const company = gameState.companies[0];
    const period = gameState.currentPeriod;

    let html = '<div class="breakdown-list">';

    if (company.endOfPeriodStats) {
        const stats = company.endOfPeriodStats;
        const baseCost = {2: 22, 3: 24, 4: 26, 5: 28};
        let unitCost = baseCost[period] || 22;
        if (period >= 3 && gameState.wageMultiplier > 1) {
            unitCost = Math.round(baseCost[period] * gameState.wageMultiplier);
        }
        const halfCost = Math.round(unitCost / 2);

        const machineCost = stats.machines * unitCost;
        const workerCost = stats.workers * unitCost;
        const salesmanCost = stats.salesmen * unitCost;
        const personnelCost = (stats.workers + stats.salesmen) * halfCost;

        html += `<div class="breakdown-item"><span>【給料内訳】</span><span></span></div>`;
        html += `<div class="breakdown-item"><span>　機械費 (${stats.machines}台×¥${unitCost})</span><span>¥${machineCost}</span></div>`;
        html += `<div class="breakdown-item"><span>　ワーカー給料 (${stats.workers}人×¥${unitCost})</span><span>¥${workerCost}</span></div>`;
        html += `<div class="breakdown-item"><span>　セールスマン給料 (${stats.salesmen}人×¥${unitCost})</span><span>¥${salesmanCost}</span></div>`;
        html += `<div class="breakdown-item"><span>　人員合計費 (${stats.workers + stats.salesmen}人×¥${halfCost})</span><span>¥${personnelCost}</span></div>`;
        html += `<div class="breakdown-item"><span>給料合計</span><span>¥${machineCost + workerCost + salesmanCost + personnelCost}</span></div>`;
    } else {
        const salaryCost = calculateSalaryCost(company, period);
        html += `<div class="breakdown-item"><span>給料</span><span>¥${salaryCost}</span></div>`;
    }

    if (company.loans > 0) {
        const loanPayment = Math.floor(company.loans * 0.1);
        html += `<div class="breakdown-item"><span>長期借入返済 (¥${company.loans}×10%)</span><span>¥${loanPayment}</span></div>`;
    }

    if (company.shortLoans > 0) {
        const shortLoanPayment = Math.floor(company.shortLoans * 0.2);
        html += `<div class="breakdown-item"><span>短期借入返済 (¥${company.shortLoans}×20%)</span><span>¥${shortLoanPayment}</span></div>`;
    }

    const total = calculatePeriodPayment(company, company.endOfPeriodStats ? true : false);
    html += `<div class="breakdown-item breakdown-total"><span>合計</span><span>¥${total}</span></div>`;
    html += '</div>';

    showModal('期末支払内訳', html);
}

// Show fixed cost breakdown
function showFixedCostBreakdown() {
    const company = gameState.companies[0];
    const period = gameState.currentPeriod;

    let html = '<div class="breakdown-list">';

    const salaryCost = calculateSalaryCost(company, period);
    html += `<div class="breakdown-item"><span>給料</span><span>¥${salaryCost}</span></div>`;

    if (company.chips.computer > 0) {
        html += `<div class="breakdown-item"><span>コンピュータ(${company.chips.computer}枚)</span><span>¥${company.chips.computer * 20}</span></div>`;
    }

    if (company.chips.insurance > 0) {
        html += `<div class="breakdown-item"><span>保険(${company.chips.insurance}枚)</span><span>¥${company.chips.insurance * 5}</span></div>`;
    }

    if (period === 2) {
        if (company.chips.research > 0) html += `<div class="breakdown-item"><span>研究(1枚分)</span><span>¥20</span></div>`;
        if (company.chips.education > 0) html += `<div class="breakdown-item"><span>教育(1枚分)</span><span>¥20</span></div>`;
        if (company.chips.advertising > 0) html += `<div class="breakdown-item"><span>広告(1枚分)</span><span>¥20</span></div>`;
    } else {
        if (company.chips.research > 0) html += `<div class="breakdown-item"><span>研究・特急(${company.chips.research}枚)</span><span>¥${company.chips.research * 40}</span></div>`;
        if (company.chips.education > 0) html += `<div class="breakdown-item"><span>教育・特急(${company.chips.education}枚)</span><span>¥${company.chips.education * 40}</span></div>`;
        if (company.chips.advertising > 0) html += `<div class="breakdown-item"><span>広告・特急(${company.chips.advertising}枚)</span><span>¥${company.chips.advertising * 40}</span></div>`;
        if (company.nextPeriodChips?.research > 0) html += `<div class="breakdown-item"><span>研究・繰越(${company.nextPeriodChips.research}枚)</span><span>¥${company.nextPeriodChips.research * 20}</span></div>`;
        if (company.nextPeriodChips?.education > 0) html += `<div class="breakdown-item"><span>教育・繰越(${company.nextPeriodChips.education}枚)</span><span>¥${company.nextPeriodChips.education * 20}</span></div>`;
        if (company.nextPeriodChips?.advertising > 0) html += `<div class="breakdown-item"><span>広告・繰越(${company.nextPeriodChips.advertising}枚)</span><span>¥${company.nextPeriodChips.advertising * 20}</span></div>`;
    }

    const depreciationCost = calculateDepreciation(company, period);
    if (depreciationCost > 0) {
        html += `<div class="breakdown-item"><span>減価償却費</span><span>¥${depreciationCost}</span></div>`;
    }

    const total = calculateFixedCost(company);
    html += `<div class="breakdown-item breakdown-total"><span>合計</span><span>¥${total}</span></div>`;
    html += '</div>';

    showModal('固定費内訳', html);
}

// Show turn start options
function showTurnStartOptions() {
    if (gameState.currentPlayerIndex !== 0) return;

    const company = gameState.companies[0];
    const content = `
        <div class="card-choice-container">
            <h2>あなたのターン</h2>
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                <button class="action-btn main card-choice-btn" onclick="drawCard()" style="flex: 2;">カードを引く</button>
                <button class="action-btn secondary" onclick="viewGameState()" style="flex: 1; font-size: 12px;">全体を見る</button>
            </div>
            <div style="margin-top: 15px; margin-bottom: 15px;">
                <button class="action-btn warning" onclick="showCurrentGameAIAdvice()" style="width: 100%; padding: 10px;">
                    🤖 AIアドバイスを見る
                </button>
            </div>
            <div style="margin-top: 15px;">
                <p>投資アクション</p>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px;">
                    <button class="action-btn secondary" onclick="showMachineModal()">🏭 機械購入</button>
                    <button class="action-btn secondary" onclick="showChipPurchaseModal()">🎰 チップ購入</button>
                    <button class="action-btn secondary" onclick="showHireModal()">👤 人員採用</button>
                    <button class="action-btn secondary" onclick="showWarehouseModal()">🏠 倉庫購入</button>
                </div>
                <p>その他のアクション</p>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                    <button class="action-btn secondary" onclick="showReassignModal()">🔄 配置転換</button>
                    <button class="action-btn secondary" onclick="showSellMachineModal()">💰 機械売却</button>
                    ${company.warehouses === 1 ? '<button class="action-btn secondary" onclick="showWarehouseMoveModal()">📦 倉庫移動</button>' : ''}
                    <button class="action-btn secondary" onclick="showInsurancePurchaseModal()">🛡 保険購入</button>
                </div>
            </div>
        </div>
    `;

    showModal('行動選択', content);
}

// カードめくりアニメーション
function showCardDrawAnimation(cardType) {
    const isRisk = cardType === 'risk';
    const cardColor = isRisk ? '#dc2626' : '#3b82f6';
    const cardLabel = isRisk ? 'リスクカード' : '意思決定カード';
    const cardIcon = isRisk ? '⚠️' : '🎯';

    const animationHtml = `
        <div class="card-draw-overlay" id="cardDrawOverlay">
            <div class="draw-deck">
                <div class="deck-stack">
                    <div class="deck-card"></div>
                    <div class="deck-card"></div>
                    <div class="deck-card"></div>
                </div>
                <div class="deck-count">残り ${gameState.cardDeck.length}枚</div>
            </div>
            <div class="drawn-card-container">
                <div class="drawn-card" id="drawnCard">
                    <div class="card-face card-back">
                        <div class="card-pattern">MG</div>
                    </div>
                    <div class="card-face card-front" style="background: linear-gradient(135deg, ${cardColor} 0%, ${cardColor}dd 100%);">
                        <div class="card-icon">${cardIcon}</div>
                        <div class="card-type">${cardLabel}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modalContainer').innerHTML = animationHtml;

    setTimeout(() => {
        document.getElementById('drawnCard').classList.add('flipped');
    }, 500);

    setTimeout(() => {
        document.getElementById('modalContainer').innerHTML = '';
        if (cardType === 'decision') {
            showDecisionCard();
        } else {
            drawRiskCard();
        }
    }, 1500);
}

// Show decision card
function showDecisionCard() {
    const company = gameState.companies[0];
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);
    const priceComp = getPriceCompetitiveness(company, 0);

    const actionConfig = {
        1: { icon: '💰', label: '商品販売', color: '#22c55e', border: '#16a34a', desc: '製品を販売' },
        2: { icon: '📦', label: '材料仕入', color: '#8b5cf6', border: '#7c3aed', desc: '材料を購入' },
        3: { icon: '🏭', label: '完成・投入', color: '#3b82f6', border: '#2563eb', desc: '製造を実行' },
        4: { icon: '👥', label: '採用', color: '#f59e0b', border: '#d97706', desc: '人員を採用' },
        5: { icon: '⚙️', label: '設備投資', color: '#6366f1', border: '#4f46e5', desc: '機械を購入' },
        6: { icon: '🎯', label: '戦略チップ', color: '#ef4444', border: '#dc2626', desc: 'チップ購入' },
        7: { icon: '⏭️', label: 'DO NOTHING', color: '#64748b', border: '#475569', desc: 'パス' }
    };

    const cardHtml = gameState.decisionCards.map(card => {
        const cfg = actionConfig[card.id];
        return `
            <div onclick="selectDecisionCard(${card.id})" style="
                background: linear-gradient(135deg, ${cfg.color} 0%, ${cfg.border} 100%);
                border: 3px solid ${cfg.border};
                border-radius: 10px;
                padding: 12px 8px;
                text-align: center;
                cursor: pointer;
                color: white;
                transition: transform 0.2s, box-shadow 0.2s;
                box-shadow: 0 3px 10px rgba(0,0,0,0.2);
            " onmouseover="this.style.transform='scale(1.05)'"
               onmouseout="this.style.transform='scale(1)'">
                <div style="font-size: 24px; margin-bottom: 4px;">${cfg.icon}</div>
                <div style="font-weight: bold; font-size: 12px;">${cfg.label}</div>
                <div style="font-size: 9px; opacity: 0.9;">${cfg.desc}</div>
            </div>
        `;
    }).join('');

    const content = `
        <div style="background: #fef3c7; border-radius: 8px; padding: 8px; margin-bottom: 12px; text-align: center;">
            <div style="font-weight: bold; color: #92400e; font-size: 14px;">💰 持ち金: ¥${company.cash}</div>
        </div>
        <div style="display: flex; justify-content: space-around; margin-bottom: 12px; padding: 8px; background: #f1f5f9; border-radius: 8px;">
            <div style="text-align: center;">
                <div style="font-size: 10px; color: #64748b;">製造</div>
                <div style="font-size: 16px; font-weight: bold; color: #0284c7;">${mfgCapacity}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 10px; color: #64748b;">販売</div>
                <div style="font-size: 16px; font-weight: bold; color: #dc2626;">${salesCapacity}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 10px; color: #64748b;">価格競争力</div>
                <div style="font-size: 16px; font-weight: bold; color: #16a34a;">+${priceComp}</div>
            </div>
        </div>
        <div style="display: flex; justify-content: center; gap: 6px; margin-bottom: 12px; font-size: 11px;">
            <div style="background: #e0e7ff; padding: 4px 10px; border-radius: 6px;">
                <span style="color: #4338ca;">材料</span> <b>${company.materials}</b>
            </div>
            <div style="background: #fae8ff; padding: 4px 10px; border-radius: 6px;">
                <span style="color: #a21caf;">仕掛品</span> <b>${company.wip}</b>
            </div>
            <div style="background: #dbeafe; padding: 4px 10px; border-radius: 6px;">
                <span style="color: #1d4ed8;">製品</span> <b>${company.products}</b>
            </div>
        </div>
        <p style="text-align: center; font-size: 12px; color: #666; margin-bottom: 10px;">アクションを選択してください</p>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
            ${cardHtml}
        </div>
    `;

    showModal('意思決定カード', content);
}

// 保険再加入モーダル
function showInsuranceRepurchaseModal(disasterType, lostItems, compensation, netLoss) {
    const company = gameState.companies[0];
    const canAfford = company.cash >= 5;

    const itemLabel = disasterType === '倉庫火災' ? '材料' : '商品';
    const content = `
        <div style="padding: 15px; text-align: center;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); border-radius: 12px; padding: 20px; margin-bottom: 15px; color: white;">
                <div style="font-size: 24px; margin-bottom: 10px;">⚠️ ${disasterType}発生！</div>
                <div style="font-size: 14px;">
                    <div>${itemLabel} ${lostItems}個をストッカーへ</div>
                    <div>保険金 ¥${compensation} を受け取りました</div>
                    <div>特別損失 ¥${netLoss}</div>
                </div>
            </div>

            <div style="background: #fef3c7; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                <div style="font-weight: bold; color: #92400e; margin-bottom: 10px;">
                    保険チップを消費しました
                </div>
                <div style="font-size: 14px; color: #78350f;">
                    再加入: ¥5（現在の現金: ¥${company.cash}）
                </div>
            </div>

            <div style="display: flex; gap: 10px; justify-content: center;">
                ${canAfford ? `
                    <button class="action-btn primary" onclick="repurchaseInsurance()" style="flex: 1;">
                        再加入する（¥5）
                    </button>
                ` : ''}
                <button class="action-btn secondary" onclick="closeModal(); updateDisplay();" style="flex: 1;">
                    ${canAfford ? '再加入しない' : '閉じる'}
                </button>
            </div>
        </div>
    `;

    showModal('保険使用', content);
}

// 残り5行警告モーダル
function showLast5RowWarning(company) {
    const content = `
        <div style="text-align: center; padding: 15px;">
            <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
            <h3 style="color: #dc2626; margin-bottom: 10px;">残り5行！</h3>
            <p style="font-size: 14px; color: #4b5563;">
                ${company.name}の行数が残り5行になりました。<br>
                期末処理が近づいています。
            </p>
        </div>
    `;
    showModal('警告', content);
    setTimeout(closeModal, 3000);
}

// 期末告知モーダル
function showPeriodEndAnnouncement(triggerCompany) {
    console.log('★★★ showPeriodEndAnnouncement called ★★★');

    // 全てのAIタイムアウトをクリア
    if (window.currentAITurnTimeout) {
        clearTimeout(window.currentAITurnTimeout);
        window.currentAITurnTimeout = null;
    }

    // 進行中のsetTimeoutをキャンセル（AIターン用）
    if (window.pendingAITurns) {
        window.pendingAITurns.forEach(t => clearTimeout(t));
        window.pendingAITurns = [];
    }

    const companies = gameState.companies;

    let rowsHtml = companies.map((c, i) => {
        const emoji = i === 0 ? '👤' : ['🅰️', '🅱️', '©️', '🇩', '🇪'][i - 1] || '🏢';
        const isTrigger = (c === triggerCompany);
        return `
            <div style="display: flex; justify-content: space-between; padding: 8px; background: ${isTrigger ? '#fef3c7' : '#f9fafb'}; border-radius: 6px; margin: 5px 0; ${isTrigger ? 'border: 2px solid #f59e0b;' : ''}">
                <span>${emoji} ${c.name}</span>
                <span style="font-weight: bold; ${isTrigger ? 'color: #d97706;' : ''}">${c.currentRow}行 ${isTrigger ? '(規定到達！)' : ''}</span>
            </div>
        `;
    }).join('');

    const content = `
        <div style="text-align: center; padding: 15px;">
            <div style="font-size: 48px; margin-bottom: 10px;">🏁</div>
            <h3 style="color: #dc2626; margin-bottom: 15px;">第${gameState.currentPeriod}期 終了！</h3>
            <p style="font-size: 14px; color: #4b5563; margin-bottom: 15px;">
                <strong>${triggerCompany.name}</strong> が規定行数（${gameState.maxRows}行）に到達しました。<br>
                <span style="color: #dc2626; font-weight: bold;">全プレイヤーのこの期は強制終了となります。</span>
            </p>
            <div style="background: #f3f4f6; border-radius: 10px; padding: 15px; margin-bottom: 15px;">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 10px;">各社の使用行数</div>
                ${rowsHtml}
            </div>
            <button class="submit-btn" onclick="closePeriodEndAnnouncementAndStartSettlement()">決算処理へ進む</button>
        </div>
    `;

    // 即座にモーダルを表示（periodEndingチェックにより他のモーダルは上書きされない）
    showModal('期終了', content);
    console.log('★★★ Period end modal displayed ★★★');
}

// スタートメニュー
function showStartMenu() {
    const hasSave = hasSavedGame();
    const saveData = hasSave ? loadGame() : null;
    const saveDate = saveData ? new Date(saveData.timestamp).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    const menuHtml = `
        <div class="modal active" style="z-index: 2000;">
            <div class="modal-content" style="max-width: 480px; padding: 24px;">
                <!-- ヘッダー -->
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 42px; margin-bottom: 8px;">🎲</div>
                    <h2 style="margin: 0 0 6px 0; color: #1e3a5f; font-size: 22px;">マネジメントゲーム</h2>
                    <p style="margin: 0; color: #6b7280; font-size: 13px;">自主練モード - 6社対戦シミュレーション</p>
                </div>

                <!-- メインアクション -->
                <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; padding: 16px; margin-bottom: 12px;">
                    ${hasSave ? `
                        <!-- セーブデータがある場合 -->
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding: 12px; background: white; border-radius: 8px; border: 2px solid #10b981; cursor: pointer;" onclick="resumeGame()">
                            <div style="font-size: 28px;">▶️</div>
                            <div style="flex: 1; text-align: left;">
                                <div style="font-weight: bold; color: #065f46; font-size: 15px;">続きから再開</div>
                                <div style="font-size: 12px; color: #6b7280;">${saveData.currentPeriod}期 - ${saveDate}</div>
                            </div>
                            <div style="color: #10b981; font-size: 18px;">→</div>
                        </div>
                    ` : ''}
                    <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: ${hasSave ? '#f0fdf4' : 'white'}; border-radius: 8px; border: 2px solid ${hasSave ? '#a7f3d0' : '#10b981'}; cursor: pointer;" onclick="startNewGame()">
                        <div style="font-size: 28px;">🆕</div>
                        <div style="flex: 1; text-align: left;">
                            <div style="font-weight: bold; color: #065f46; font-size: 15px;">新規ゲーム開始</div>
                            <div style="font-size: 12px; color: #6b7280;">2期からスタート</div>
                        </div>
                        <div style="color: #10b981; font-size: 18px;">→</div>
                    </div>
                </div>

                <!-- 詳細設定 -->
                <div style="background: #f8fafc; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
                    <div style="font-size: 11px; color: #64748b; margin-bottom: 8px; font-weight: bold;">詳細設定</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; padding: 10px; background: white; border-radius: 8px; cursor: pointer; border: 1px solid #e2e8f0;" onclick="showCustomGameSetupModal()">
                            <div style="font-size: 20px;">⚙️</div>
                            <div style="text-align: left;">
                                <div style="font-size: 13px; font-weight: bold; color: #334155;">カスタム設定</div>
                                <div style="font-size: 10px; color: #94a3b8;">期・現金など指定</div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; padding: 10px; background: white; border-radius: 8px; cursor: pointer; border: 1px solid #e2e8f0;" onclick="showAIActionPlanModal()">
                            <div style="font-size: 20px;">🤖</div>
                            <div style="text-align: left;">
                                <div style="font-size: 13px; font-weight: bold; color: #334155;">AI提案</div>
                                <div style="font-size: 10px; color: #94a3b8;">最適行動を確認</div>
                            </div>
                        </div>
                    </div>
                </div>

                ${hasSave ? `
                    <!-- セーブ削除 -->
                    <div style="text-align: center;">
                        <span style="font-size: 12px; color: #9ca3af; cursor: pointer; text-decoration: underline;" onclick="confirmDeleteSave()">
                            セーブデータを削除
                        </span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    document.getElementById('modalContainer').innerHTML = menuHtml;
}
