/**
 * MG (Management Game) - 借入・返済関連関数
 *
 * 期末返済処理、プレイヤー返済UI
 * 注: 期首処理はindex.htmlのprocessPeriodStart()で処理
 * 注: AI借入はjs/ai-strategies.jsのplanAIPeriodStrategy()で処理
 */

// ============================================
// 期末返済処理
// ============================================
function processEndPeriodLoanRepayments(financialData) {
    // AI会社の自動返済処理
    gameState.companies.forEach(company => {
        if (company.type === 'ai') {
            processAutoLoanRepayment(company);
        }
    });

    // プレイヤー会社の返済UI表示
    const player = gameState.companies[0];
    if (player.shortLoans > 0 || player.loans > 0) {
        showLoanRepaymentModal(financialData);
    } else {
        // 借入がない場合は直接決算表示へ
        window.currentSettlementIndex = 0;
        showCompanySettlement(0, financialData);
    }
}

// ============================================
// AI会社の自動返済処理
// ============================================
function processAutoLoanRepayment(company) {
    // 短期借入: 最低20%返済
    if (company.shortLoans > 0) {
        const minShortPayment = Math.ceil(company.shortLoans * 0.2);
        const actualPayment = Math.min(minShortPayment, company.cash);

        if (actualPayment > 0) {
            company.cash -= actualPayment;
            company.shortLoans -= actualPayment;
        }

        // 資金不足で最低返済できない場合は短期借入で補填
        if (actualPayment < minShortPayment) {
            const shortfall = minShortPayment - actualPayment;
            const needed = Math.ceil(shortfall / 0.8 / 50) * 50;
            company.shortLoans += needed;
            company.cash += needed * 0.8;
            company.cash -= (minShortPayment - actualPayment);
            company.shortLoans -= (minShortPayment - actualPayment);
        }
    }

    // 長期借入: 最低10%返済
    if (company.loans > 0) {
        const minLongPayment = Math.ceil(company.loans * 0.1);
        const actualPayment = Math.min(minLongPayment, company.cash);

        if (actualPayment > 0) {
            company.cash -= actualPayment;
            company.loans -= actualPayment;
        }

        // 資金不足で最低返済できない場合は短期借入で補填
        if (actualPayment < minLongPayment) {
            const shortfall = minLongPayment - actualPayment;
            const needed = Math.ceil(shortfall / 0.8 / 50) * 50;
            company.shortLoans += needed;
            company.cash += needed * 0.8;
            company.cash -= (minLongPayment - actualPayment);
            company.loans -= (minLongPayment - actualPayment);
        }
    }
}

// ============================================
// プレイヤー返済UIモーダル
// ============================================
function showLoanRepaymentModal(financialData) {
    const player = gameState.companies[0];
    const minShortPayment = player.shortLoans > 0 ? Math.ceil(player.shortLoans * 0.2) : 0;
    const minLongPayment = player.loans > 0 ? Math.ceil(player.loans * 0.1) : 0;

    window.repaymentSelection = {
        short: minShortPayment,
        long: minLongPayment,
        shortMin: minShortPayment,
        shortMax: player.shortLoans,
        longMin: minLongPayment,
        longMax: player.loans
    };

    let shortSection = '';
    if (player.shortLoans > 0) {
        shortSection = `
            <div style="background: linear-gradient(135deg, #fecaca 0%, #fca5a5 100%); border-radius: 10px; padding: 10px; margin-bottom: 8px;">
                <div style="font-size: 12px; color: #991b1b; margin-bottom: 6px;">
                    📛 短期借入（残高¥${player.shortLoans}・最低20%）
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div onclick="selectRepayment('short', 'min')" id="short-min" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 10px; border-radius: 8px; text-align: center; cursor: pointer; border: 2px solid #f87171;">
                        <div style="font-size: 11px;">最低返済</div>
                        <div style="font-size: 16px; font-weight: bold;">¥${minShortPayment}</div>
                    </div>
                    ${player.shortLoans <= player.cash ? `
                    <div onclick="selectRepayment('short', 'full')" id="short-full" style="background: #374151; color: white; padding: 10px; border-radius: 8px; text-align: center; cursor: pointer; border: 2px solid transparent;">
                        <div style="font-size: 11px;">全額返済</div>
                        <div style="font-size: 16px; font-weight: bold;">¥${player.shortLoans}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    let longSection = '';
    if (player.loans > 0) {
        longSection = `
            <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-radius: 10px; padding: 10px; margin-bottom: 10px;">
                <div style="font-size: 12px; color: #1e40af; margin-bottom: 6px;">
                    💳 長期借入（残高¥${player.loans}・最低10%）
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div onclick="selectRepayment('long', 'min')" id="long-min" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 10px; border-radius: 8px; text-align: center; cursor: pointer; border: 2px solid #60a5fa;">
                        <div style="font-size: 11px;">最低返済</div>
                        <div style="font-size: 16px; font-weight: bold;">¥${minLongPayment}</div>
                    </div>
                    ${player.loans <= player.cash ? `
                    <div onclick="selectRepayment('long', 'full')" id="long-full" style="background: #374151; color: white; padding: 10px; border-radius: 8px; text-align: center; cursor: pointer; border: 2px solid transparent;">
                        <div style="font-size: 11px;">全額返済</div>
                        <div style="font-size: 16px; font-weight: bold;">¥${player.loans}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    const totalMin = minShortPayment + minLongPayment;

    const content = `
        <div style="padding: 8px;">
            <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center;">
                <span style="font-weight: bold; color: #92400e;">💰 現金 ¥${player.cash}</span>
            </div>
            ${shortSection}
            ${longSection}
            <div id="repaymentTotal" style="background: #f1f5f9; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center;">
                <span style="color: #374151;">合計返済: <strong id="repaymentTotalAmount">¥${totalMin}</strong></span>
            </div>
            <button class="submit-btn" onclick="processPlayerLoanRepayment()" style="width: 100%; padding: 12px;">💳 返済実行</button>
        </div>
    `;

    showModal('期末返済処理', content);
}

// ============================================
// 返済額選択
// ============================================
function selectRepayment(type, mode) {
    const data = window.repaymentSelection;
    if (type === 'short') {
        data.short = mode === 'full' ? data.shortMax : data.shortMin;
        const minEl = document.getElementById('short-min');
        const fullEl = document.getElementById('short-full');
        if (minEl) {
            minEl.style.background = mode === 'min' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : '#374151';
            minEl.style.borderColor = mode === 'min' ? '#f87171' : 'transparent';
        }
        if (fullEl) {
            fullEl.style.background = mode === 'full' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : '#374151';
            fullEl.style.borderColor = mode === 'full' ? '#f87171' : 'transparent';
        }
    } else {
        data.long = mode === 'full' ? data.longMax : data.longMin;
        const minEl = document.getElementById('long-min');
        const fullEl = document.getElementById('long-full');
        if (minEl) {
            minEl.style.background = mode === 'min' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#374151';
            minEl.style.borderColor = mode === 'min' ? '#60a5fa' : 'transparent';
        }
        if (fullEl) {
            fullEl.style.background = mode === 'full' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#374151';
            fullEl.style.borderColor = mode === 'full' ? '#60a5fa' : 'transparent';
        }
    }
    document.getElementById('repaymentTotalAmount').textContent = '¥' + (data.short + data.long);
}

// ============================================
// プレイヤー返済処理実行
// ============================================
function processPlayerLoanRepayment() {
    const player = gameState.companies[0];
    const data = window.repaymentSelection || { short: 0, long: 0 };

    const shortRepayment = data.short || 0;
    const longRepayment = data.long || 0;
    const totalRepayment = shortRepayment + longRepayment;

    // 資金不足の場合は短期借入
    if (player.cash < totalRepayment) {
        const needed = Math.ceil((totalRepayment - player.cash) / 0.8 / 50) * 50;
        player.shortLoans += needed;
        const shortInterestPaid = Math.floor(needed * 0.2);
        player.cash += needed - shortInterestPaid;
        // 新規借入金利をトラッキング（F計算用）
        player.newLoanInterest = (player.newLoanInterest || 0) + shortInterestPaid;
        alert(`資金不足のため¥${needed}を短期借入しました（金利¥${shortInterestPaid}）`);
    }

    // 返済処理
    player.cash -= totalRepayment;
    player.shortLoans -= shortRepayment;
    player.loans -= longRepayment;

    closeModal();

    // 決算表示へ
    window.currentSettlementIndex = 0;
    showCompanySettlement(0, window.lastFinancialData);
}
