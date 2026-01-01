// ==============================================
// modals.js - モーダル表示モジュール
// ==============================================

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
        <button class="submit-btn" onclick="closeModal()">閉じる</button>
    `;

    showModal('行動ログ', content);
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
            <div style="margin-top: 20px;">
                <p>その他のアクション（Bルール）</p>
                <button class="action-btn secondary" onclick="showInsurancePurchaseModal()">保険チップ購入</button>
                <button class="action-btn secondary" onclick="showWarehouseModal()">無災害倉庫を購入</button>
                ${company.warehouses === 1 ? '<button class="action-btn secondary" onclick="showWarehouseMoveModal()">倉庫の移動</button>' : ''}
                <button class="action-btn secondary" onclick="showReassignModal()">配置転換</button>
                <button class="action-btn secondary" onclick="showSellMachineModal()">機械売却</button>
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
    if (window.currentAITurnTimeout) {
        clearTimeout(window.currentAITurnTimeout);
        window.currentAITurnTimeout = null;
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

    showModal('期終了', content);
}

// スタートメニュー
function showStartMenu() {
    const hasSave = hasSavedGame();
    const saveData = hasSave ? loadGame() : null;
    const saveInfo = saveData ? `（${saveData.currentPeriod}期、${new Date(saveData.timestamp).toLocaleString('ja-JP')}）` : '';

    const menuHtml = `
        <div class="modal active" style="z-index: 2000;">
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <h2 style="margin-bottom: 20px; color: #1e40af;">🎮 MG（マネジメントゲーム）</h2>
                <p style="margin-bottom: 20px; color: #666;">自主練モード - 6人対戦</p>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${hasSave ? `
                        <button onclick="resumeGame()" class="action-btn primary" style="padding: 15px; font-size: 16px;">
                            ▶ 続きから始める${saveInfo}
                        </button>
                    ` : ''}
                    <button onclick="startNewGame()" class="action-btn success" style="padding: 15px; font-size: 16px;">
                        🆕 2期から新しく始める
                    </button>
                    ${hasSave ? `
                        <button onclick="confirmDeleteSave()" class="action-btn secondary" style="padding: 10px; font-size: 14px;">
                            🗑 セーブデータを削除
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalContainer').innerHTML = menuHtml;
}
