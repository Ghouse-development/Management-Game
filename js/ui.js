/**
 * MG (Management Game) - UI描画・表示
 */

// ============================================
// メイン表示更新
// ============================================
function updateDisplay() {
    const player = gameState.companies[0];

    // ヘッダー情報
    document.getElementById('currentPeriod').textContent = gameState.currentPeriod;
    document.getElementById('currentRow').textContent = `${player.currentRow || 1}/${gameState.maxRows}`;
    document.getElementById('playerCash').textContent = `¥${player.cash}`;
    document.getElementById('equity').textContent = `¥${player.equity}`;

    // カードセクション
    const cardSection = document.getElementById('cardDrawSection');
    const turnInfo = document.getElementById('turnInfo');
    if (gameState.currentPlayerIndex === 0) {
        cardSection.style.display = 'block';
        turnInfo.textContent = 'あなたのターンです';
    } else {
        cardSection.style.display = 'none';
    }

    renderCompanyBoard(player);
    renderMarketsBoard();
    renderFixedCostBreakdown(player);
    renderOtherCompanies();

    // 次繰盤（3期以降）
    const nextPeriodBoard = document.getElementById('nextPeriodBoard');
    if (gameState.currentPeriod >= 3) {
        nextPeriodBoard.style.display = 'block';
        document.getElementById('nextResearch').textContent = player.nextPeriodChips?.research || 0;
        document.getElementById('nextEducation').textContent = player.nextPeriodChips?.education || 0;
        document.getElementById('nextAdvertising').textContent = player.nextPeriodChips?.advertising || 0;
    } else {
        nextPeriodBoard.style.display = 'none';
    }
}

// ============================================
// 会社盤描画
// ============================================
function renderCompanyBoard(company) {
    document.getElementById('currentPeriod').textContent = gameState.currentPeriod;
    document.getElementById('currentRow').textContent = `${company.currentRow}/${gameState.maxRows}`;
    document.getElementById('playerCash').textContent = `¥${company.cash}`;
    document.getElementById('equity').textContent = `¥${company.equity}`;

    const fixedCost = calculateFixedCostTotal(company, gameState.currentPeriod);
    document.getElementById('fixedCostDisplay').textContent = `¥${fixedCost}`;

    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);
    const priceComp = getPriceCompetitiveness(company, 0);
    document.getElementById('mfgCapacityDisplay').textContent = mfgCapacity;
    document.getElementById('salesCapacityDisplay').textContent = salesCapacity;
    document.getElementById('priceCompDisplay').textContent = '+' + priceComp;

    // 在庫表示（5個単位で横並び）
    const makeInvBlocks = (count, type) => {
        if (count === 0) return '<span style="color:#999;font-size:10px;">0</span>';
        let html = '<div class="inv-grid">';
        for (let i = 0; i < count; i++) {
            html += `<div class="inv-block ${type}"></div>`;
        }
        html += '</div>';
        return html;
    };

    document.getElementById('materialsDisplay').innerHTML = makeInvBlocks(company.materials, 'material');
    document.getElementById('wipDisplay').innerHTML = makeInvBlocks(company.wip, 'wip');
    document.getElementById('productsDisplay').innerHTML = makeInvBlocks(company.products, 'product');

    // 人員表示
    document.getElementById('workersDisplay').innerHTML =
        Array(company.workers).fill('<div class="person-dot worker">W</div>').join('') ||
        '<span style="color:#999;font-size:10px;">0</span>';

    let machinesHtml = '';
    company.machines.forEach(m => {
        if (m.type === 'large') {
            machinesHtml += '<div class="machine-dot large">大</div>';
        } else {
            machinesHtml += `<div class="machine-dot">小${m.attachments > 0 ? '+' : ''}</div>`;
        }
    });
    document.getElementById('machinesDisplay').innerHTML = machinesHtml ||
        '<span style="color:#999;font-size:10px;">0</span>';

    document.getElementById('salesmenDisplay').innerHTML =
        Array(company.salesmen).fill('<div class="person-dot salesman">S</div>').join('') ||
        '<span style="color:#999;font-size:10px;">0</span>';

    // チップ表示
    document.getElementById('researchChipsDisplay').innerHTML =
        Array(company.chips.research || 0).fill('<div class="chip research"></div>').join('') || '-';
    document.getElementById('educationChipsDisplay').innerHTML =
        Array(company.chips.education || 0).fill('<div class="chip education"></div>').join('') || '-';
    document.getElementById('advertisingChipsDisplay').innerHTML =
        Array(company.chips.advertising || 0).fill('<div class="chip advertising"></div>').join('') || '-';
    document.getElementById('computerChipsDisplay').innerHTML =
        Array(company.chips.computer || 0).fill('<div class="chip computer"></div>').join('') || '-';
    document.getElementById('insuranceChipsDisplay').innerHTML =
        Array(company.chips.insurance || 0).fill('<div class="chip insurance"></div>').join('') || '-';

    // 借入表示
    const loanLongBadge = document.getElementById('loanLongBadge');
    const loanShortBadge = document.getElementById('loanShortBadge');
    if (loanLongBadge) {
        if (company.loans > 0) {
            loanLongBadge.style.display = 'flex';
            document.getElementById('loanLong').textContent = `¥${company.loans}`;
        } else {
            loanLongBadge.style.display = 'none';
        }
    }
    if (loanShortBadge) {
        if (company.shortLoans > 0) {
            loanShortBadge.style.display = 'flex';
            document.getElementById('loanShort').textContent = `¥${company.shortLoans}`;
        } else {
            loanShortBadge.style.display = 'none';
        }
    }
}

// ============================================
// 市場盤描画
// ============================================
function renderMarketsBoard() {
    const marketClasses = {
        '東京': 'tokyo', '名古屋': 'nagoya', '大阪': 'osaka',
        '福岡': 'fukuoka', '海外': 'overseas', '仙台': 'sendai', '札幌': 'sapporo'
    };
    const displayOrder = ['仙台', '札幌', '福岡', '名古屋', '大阪', '東京', '海外'];
    const period = gameState.currentPeriod;

    let html = '';
    displayOrder.forEach(marketName => {
        const market = gameState.markets.find(m => m.name === marketName);
        if (!market) return;
        const marketIndex = gameState.markets.indexOf(market);
        const marketClass = marketClasses[market.name] || '';
        const stockHtml = Array(Math.min(market.currentStock, 12)).fill('<div class="stock-cube"></div>').join('');
        const stockExtra = market.currentStock > 12 ? `+${market.currentStock - 12}` : '';
        const closedClass = market.closed ? 'closed' : '';

        let unavailableClass = '';
        let onClickHandler = '';

        const isSelected = (gameState.twoMarketMode === 'simultaneous' || gameState.twoMarketMode === 'separate') &&
            gameState.selectedMarkets && gameState.selectedMarkets.includes(marketIndex);

        if (gameState.salesMode) {
            const isFull = market.currentStock >= market.maxStock;
            const isOverseasIn2nd = period === 2 && market.name === '海外';
            const needsBidOnly = gameState.twoMarketMode === 'simultaneous' && !market.needsBid;
            if (market.closed || isFull || isOverseasIn2nd || needsBidOnly) {
                unavailableClass = 'unavailable';
            } else {
                onClickHandler = `onclick="onMarketTileClick(${marketIndex}, 'sell')"`;
            }
        } else if (gameState.buyMode) {
            const isEmpty = market.currentStock <= 0;
            if (market.closed || isEmpty) {
                unavailableClass = 'unavailable';
            } else {
                onClickHandler = `onclick="onMarketTileClick(${marketIndex}, 'buy')"`;
            }
        }

        // マーケットボリューム（空き容量）を計算
        const currentVolume = market.name === '海外' ? '∞' : Math.max(0, market.maxStock - market.currentStock);
        const maxVolume = market.name === '海外' ? '∞' : market.maxStock;
        const selectedClass = isSelected ? 'selected' : '';
        const selectedBadge = isSelected ? '<div style="position:absolute;top:2px;right:2px;background:#8b5cf6;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;z-index:5;">✓</div>' : '';

        html += `
            <div class="market-tile ${marketClass} ${closedClass} ${unavailableClass} ${selectedClass}" ${onClickHandler}>
                ${selectedBadge}
                <div class="market-color-band">
                    <span class="price-badge buy">${market.buyPrice}</span>
                    <span class="market-volume-inline">空${currentVolume}/${maxVolume}</span>
                    <span class="price-badge sell">${market.sellPrice}</span>
                </div>
                <div class="market-pocket">
                    <div class="market-name">${market.name}</div>
                    <div class="market-stock">${stockHtml}${stockExtra ? `<span style="color:#fff;font-size:10px;margin-left:2px;">${stockExtra}</span>` : ''}</div>
                </div>
            </div>
        `;
    });
    document.getElementById('marketsDisplay').innerHTML = html;

    const marketsBoard = document.querySelector('.markets-board');
    if (marketsBoard) {
        marketsBoard.classList.toggle('sales-mode', gameState.salesMode);
        marketsBoard.classList.toggle('buy-mode', gameState.buyMode);
    }
}

// ============================================
// 固定費内訳描画
// ============================================
function renderFixedCostBreakdown(company) {
    const period = gameState.currentPeriod;
    let unitCost = BASE_SALARY_BY_PERIOD[period] || 22;
    if (period >= 3 && gameState.wageMultiplier > 1) {
        unitCost = Math.round(BASE_SALARY_BY_PERIOD[period] * gameState.wageMultiplier);
    }

    const halfCost = Math.round(unitCost / 2);
    const machineCount = company.machines.length;
    const effectiveWorkers = company.workers + (company.retiredWorkers || 0) * 0.5;
    const effectiveSalesmen = company.salesmen + (company.retiredSalesmen || 0) * 0.5;
    const maxPersonnel = company.maxPersonnel || (company.workers + company.salesmen);

    const machineCost = machineCount * unitCost;
    const workerCost = Math.round(effectiveWorkers * unitCost);
    const salesmenCost = Math.round(effectiveSalesmen * unitCost);
    const maxPersonnelCost = maxPersonnel * halfCost;
    const salaryCost = machineCost + workerCost + salesmenCost + maxPersonnelCost;

    let depreciationCost = 0;
    company.machines.forEach(m => {
        if (period === 2) {
            if (m.type === 'large') {
                depreciationCost += DEPRECIATION.large.period2;
            } else {
                depreciationCost += m.attachments > 0 ? DEPRECIATION.smallWithAttachment.period2 : DEPRECIATION.small.period2;
            }
        } else {
            if (m.type === 'large') depreciationCost += DEPRECIATION.large.period3plus;
            else depreciationCost += m.attachments > 0 ? DEPRECIATION.smallWithAttachment.period3plus : DEPRECIATION.small.period3plus;
        }
    });

    const extraLabor = company.extraLaborCost || 0;
    const computerCost = (company.chips?.computer || 0) * CHIP_COSTS.computer;
    const insuranceCost = (company.chips?.insurance || 0) * CHIP_COSTS.insurance;

    let chipCost = 0;
    if (period === 2) {
        chipCost = Math.min(company.chips?.research || 0, 1) * CHIP_COSTS.normal +
                   Math.min(company.chips?.education || 0, 1) * CHIP_COSTS.normal +
                   Math.min(company.chips?.advertising || 0, 1) * CHIP_COSTS.normal;
    }

    const totalFixed = salaryCost + depreciationCost + computerCost + insuranceCost + chipCost + extraLabor;

    const html = `
        <div class="cost-item"><span>給料(機械×${unitCost})</span><span>¥${machineCost}</span></div>
        <div class="cost-item"><span>給料(W${effectiveWorkers}×${unitCost})</span><span>¥${workerCost}</span></div>
        <div class="cost-item"><span>給料(S${effectiveSalesmen}×${unitCost})</span><span>¥${salesmenCost}</span></div>
        <div class="cost-item"><span>期中最大(${maxPersonnel}×${halfCost})</span><span>¥${maxPersonnelCost}</span></div>
        <div class="cost-item"><span>減価償却</span><span>¥${depreciationCost}</span></div>
        ${computerCost > 0 ? `<div class="cost-item"><span>PC(${company.chips.computer}×20)</span><span>¥${computerCost}</span></div>` : ''}
        ${insuranceCost > 0 ? `<div class="cost-item"><span>保険(${company.chips.insurance}×5)</span><span>¥${insuranceCost}</span></div>` : ''}
        ${chipCost > 0 ? `<div class="cost-item"><span>戦略チップ</span><span>¥${chipCost}</span></div>` : ''}
        ${extraLabor > 0 ? `<div class="cost-item"><span>その他人件費</span><span>¥${extraLabor}</span></div>` : ''}
        <div class="cost-item cost-total"><span>F合計</span><span>¥${totalFixed}</span></div>
    `;
    document.getElementById('fixedCostBreakdown').innerHTML = html;
}

// ============================================
// AI会社一覧描画
// ============================================
function renderOtherCompanies() {
    const others = gameState.companies.slice(1);
    let badgesHtml = '';

    others.forEach((company, idx) => {
        const isCurrent = gameState.currentPlayerIndex === idx + 1;
        const rowWarning = (company.currentRow || 1) >= gameState.maxRows - 5;
        const chips = company.chips;
        // チップをドットで表示（最大3個まで）
        const makeChipDots = (count, color) => Array(Math.min(count, 3)).fill(`<span class="chip-dot" style="background:${color}"></span>`).join('');
        let chipDots = '';
        if (chips.research) chipDots += makeChipDots(chips.research, '#3b82f6');
        if (chips.education) chipDots += makeChipDots(chips.education, '#eab308');
        if (chips.advertising) chipDots += makeChipDots(chips.advertising, '#ef4444');
        if (chips.computer) chipDots += makeChipDots(chips.computer, '#22c55e');
        if (chips.insurance) chipDots += makeChipDots(chips.insurance, '#f97316');

        // 在庫を大きなブロックで表示（スマホでも見やすく）
        const makeBlocks = (count, type) => {
            const colors = {material: '#7c3aed', wip: '#f59e0b', product: '#22c55e'};
            const shown = Math.min(count, 5);
            const extra = count - shown;
            let html = '<div class="ai-inv-blocks">';
            for (let i = 0; i < shown; i++) {
                html += `<span class="ai-inv-block" style="background:${colors[type]}"></span>`;
            }
            if (extra > 0) html += `<span class="ai-inv-extra">+${extra}</span>`;
            if (count === 0) html += `<span class="ai-inv-zero">0</span>`;
            html += '</div>';
            return html;
        };

        badgesHtml += `
            <div class="ai-badge ${isCurrent ? 'current-turn' : ''}" onclick="showAICompanyModal(${idx + 1})">
                <div class="ai-badge-row1">
                    <span class="ai-badge-name">${company.name}</span>
                    <span class="ai-badge-cash">¥${company.cash}</span>
                </div>
                <div class="ai-badge-inventory">
                    <div class="ai-inv-item">
                        <span class="ai-inv-label" style="color:#7c3aed">材</span>
                        ${makeBlocks(company.materials, 'material')}
                    </div>
                    <div class="ai-inv-item">
                        <span class="ai-inv-label" style="color:#f59e0b">仕</span>
                        ${makeBlocks(company.wip, 'wip')}
                    </div>
                    <div class="ai-inv-item">
                        <span class="ai-inv-label" style="color:#22c55e">製</span>
                        ${makeBlocks(company.products, 'product')}
                    </div>
                </div>
                <div class="ai-badge-row3">
                    <span class="ai-badge-info">W${company.workers}機${company.machines.length}S${company.salesmen}</span>
                    <span class="ai-badge-chips">${chipDots || '-'}</span>
                    <span class="ai-badge-rownum ${rowWarning ? 'warning' : ''}" onclick="event.stopPropagation(); showAIActionHistory(${idx + 1})" style="cursor:pointer; text-decoration:underline;">${company.currentRow || 1}行</span>
                </div>
                ${(company.loans > 0 || company.shortLoans > 0) ? `
                <div class="ai-badge-loans">
                    ${company.loans > 0 ? `<span class="ai-loan-badge long">長¥${company.loans}</span>` : ''}
                    ${company.shortLoans > 0 ? `<span class="ai-loan-badge short">短¥${company.shortLoans}</span>` : ''}
                </div>` : ''}
            </div>
        `;
    });

    document.getElementById('aiCompaniesBar').innerHTML = badgesHtml;
}

// ============================================
// AI行動履歴表示
// ============================================
function showAIActionHistory(companyIndex) {
    const company = gameState.companies[companyIndex];
    if (!company) return;

    // この会社の今期の行動ログをフィルター
    const companyLogs = (gameState.actionLog || []).filter(log => log.companyIndex === companyIndex);

    let content = '';
    if (companyLogs.length === 0) {
        content = '<p style="color:#888; text-align:center; padding:20px;">今期の行動履歴はありません</p>';
    } else {
        content = '<div class="ai-action-history">';
        companyLogs.forEach((log, idx) => {
            const cashColor = log.cashChange > 0 ? '#22c55e' : (log.cashChange < 0 ? '#ef4444' : '#888');
            const cashText = log.cashChange !== 0 ? (log.cashChange > 0 ? `+${log.cashChange}` : `${log.cashChange}`) : '';
            const rowBadge = log.rowUsed ? `<span class="history-row-badge">${log.row}行目</span>` : '';

            content += `
                <div class="history-item ${log.rowUsed ? 'row-used' : ''}">
                    <div class="history-header">
                        ${rowBadge}
                        <span class="history-action">${log.action}</span>
                        ${cashText ? `<span class="history-cash" style="color:${cashColor}">¥${cashText}</span>` : ''}
                    </div>
                    <div class="history-details">${log.details}</div>
                </div>
            `;
        });
        content += '</div>';
    }

    // モーダル表示
    const modalHtml = `
        <div class="modal active" id="aiHistoryModal" onclick="if(event.target === this) closeAIHistoryModal()">
            <div class="modal-content" style="max-width:450px; max-height:80vh;">
                <div class="modal-header" style="background:#2563eb; color:white;">
                    <h3 class="modal-title">${company.name} - ${gameState.currentPeriod}期 行動履歴</h3>
                    <button class="close-btn" onclick="closeAIHistoryModal()" style="color:white;">✕</button>
                </div>
                <div class="modal-body" style="max-height:60vh; overflow-y:auto; padding:10px;">
                    ${content}
                </div>
                <div class="modal-footer" style="padding:10px; text-align:center; border-top:1px solid #e5e7eb;">
                    <button onclick="closeAIHistoryModal()" class="btn-primary" style="padding:8px 20px;">閉じる</button>
                </div>
            </div>
        </div>
    `;

    // 既存のモーダルを閉じずに新しいモーダルを追加
    const container = document.createElement('div');
    container.id = 'aiHistoryModalContainer';
    container.innerHTML = modalHtml;
    document.body.appendChild(container);
}

function closeAIHistoryModal() {
    const container = document.getElementById('aiHistoryModalContainer');
    if (container) container.remove();
}

// ============================================
// トースト通知
// ============================================
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {info: 'ℹ️', success: '✅', warning: '⚠️', danger: '❌'};
    const titles = {info: 'お知らせ', success: '成功', warning: '注意', danger: '警告'};

    toast.innerHTML = `
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        <div class="toast-header">
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-title">${titles[type] || titles.info}</span>
        </div>
        <div class="toast-body">${message}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
}

// ============================================
// モーダル基本機能
// ============================================
function showModal(title, content) {
    const modalHtml = `
        <div class="modal active">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    <button class="close-btn" onclick="closeModal(true)">✕ 閉じる</button>
                </div>
                <div class="modal-body">${content}</div>
            </div>
        </div>
    `;
    document.getElementById('modalContainer').innerHTML = modalHtml;
}

function closeModal(returnToDecision = false) {
    document.getElementById('modalContainer').innerHTML = '';
    if (returnToDecision && gameState.currentPlayerIndex === 0) {
        showDecisionCard();
    }
}

// ============================================
// AI会社詳細モーダル
// ============================================
function showAICompanyModal(companyIndex) {
    const company = gameState.companies[companyIndex];
    if (!company) return;

    const materialsHtml = Array(company.materials).fill('<div class="inv-block material"></div>').join('') || '0';
    const wipHtml = Array(company.wip).fill('<div class="inv-block wip"></div>').join('') || '0';
    const productsHtml = Array(company.products).fill('<div class="inv-block product"></div>').join('') || '0';
    const workersHtml = Array(company.workers).fill('<div class="person-dot worker">W</div>').join('') || '0';
    const machinesHtml = company.machines.map(m =>
        `<div class="machine-dot ${m.type === 'large' ? 'large' : ''}">${m.type === 'large' ? '大' : '小'}${m.attachments > 0 ? '+' : ''}</div>`
    ).join('') || '0';
    const salesmenHtml = Array(company.salesmen).fill('<div class="person-dot salesman">S</div>').join('') || '0';

    const researchHtml = Array(company.chips.research || 0).fill('<div class="chip research"></div>').join('') || '-';
    const educationHtml = Array(company.chips.education || 0).fill('<div class="chip education"></div>').join('') || '-';
    const advertisingHtml = Array(company.chips.advertising || 0).fill('<div class="chip advertising"></div>').join('') || '-';
    const computerHtml = Array(company.chips.computer || 0).fill('<div class="chip computer"></div>').join('') || '-';
    const insuranceHtml = Array(company.chips.insurance || 0).fill('<div class="chip insurance"></div>').join('') || '-';

    const content = `
        <div class="ai-modal-content">
            <div class="ai-modal-header">
                <span class="ai-modal-name">${company.name}</span>
                <span class="ai-modal-cash">現金: ¥${company.cash}</span>
                <span class="ai-modal-row">行: ${company.currentRow || 1}/${gameState.maxRows}</span>
            </div>
            <div class="ai-modal-section">
                <div class="ai-modal-row"><span class="ai-modal-label">材料</span><div class="ai-modal-items">${materialsHtml}</div></div>
                <div class="ai-modal-row"><span class="ai-modal-label">仕掛</span><div class="ai-modal-items">${wipHtml}</div></div>
                <div class="ai-modal-row"><span class="ai-modal-label">製品</span><div class="ai-modal-items">${productsHtml}</div></div>
            </div>
            <div class="ai-modal-section">
                <div class="ai-modal-row"><span class="ai-modal-label">W</span><div class="ai-modal-items">${workersHtml}</div></div>
                <div class="ai-modal-row"><span class="ai-modal-label">機械</span><div class="ai-modal-items">${machinesHtml}</div></div>
                <div class="ai-modal-row"><span class="ai-modal-label">S</span><div class="ai-modal-items">${salesmenHtml}</div></div>
            </div>
            <div class="ai-modal-section">
                <div class="ai-modal-chips">
                    <span title="研究">${researchHtml}</span>
                    <span title="教育">${educationHtml}</span>
                    <span title="広告">${advertisingHtml}</span>
                    <span title="PC">${computerHtml}</span>
                    <span title="保険">${insuranceHtml}</span>
                </div>
            </div>
            <div class="ai-modal-footer">
                <span>借入: 長期¥${company.loans || 0} / 短期¥${company.shortLoans || 0}</span>
            </div>
        </div>
    `;

    showModal(company.name + ' の詳細', content);
}

// ============================================
// 全社一覧モーダル
// ============================================
function showAllCompaniesModal() {
    const companies = gameState.companies;
    const emojis = ['👤', '🅰️', '🅱️', '©️', '🇩', '🇪'];

    let content = '<div class="all-companies-modal">';

    companies.forEach((company, idx) => {
        const isPlayer = idx === 0;
        const isCurrent = idx === gameState.currentPlayerIndex;
        const emoji = emojis[idx] || '🏢';

        // 在庫ブロック
        const makeBlocks = (count, type) => {
            if (count === 0) return '<span style="color:#999;">0</span>';
            const colors = { material: '#7c3aed', wip: '#f59e0b', product: '#22c55e' };
            return Array(Math.min(count, 10)).fill(`<span style="display:inline-block;width:8px;height:8px;background:${colors[type]};border-radius:2px;margin:1px;"></span>`).join('') + (count > 10 ? `+${count-10}` : '');
        };

        // チップ表示
        const chipDisplay = (chips) => {
            let html = '';
            if (chips.research) html += `<span style="color:#3b82f6;">研${chips.research}</span> `;
            if (chips.education) html += `<span style="color:#eab308;">育${chips.education}</span> `;
            if (chips.advertising) html += `<span style="color:#a855f7;">広${chips.advertising}</span> `;
            if (chips.computer) html += `<span style="color:#22c55e;">PC</span> `;
            if (chips.insurance) html += `<span style="color:#f97316;">保</span> `;
            return html || '-';
        };

        // 機械表示
        const machineDisplay = company.machines.map(m => m.type === 'large' ? '大' : '小').join('') || '0';

        const borderColor = isCurrent ? '#f59e0b' : (isPlayer ? '#3b82f6' : '#e5e7eb');
        const bgColor = isPlayer ? '#eff6ff' : '#f9fafb';

        content += `
            <div class="company-card" style="background:${bgColor}; border:2px solid ${borderColor}; border-radius:12px; padding:10px; margin-bottom:10px; ${isCurrent ? 'box-shadow: 0 0 10px rgba(245,158,11,0.5);' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #e5e7eb; padding-bottom:6px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:20px;">${emoji}</span>
                        <span style="font-weight:bold; font-size:14px; color:${isPlayer ? '#2563eb' : '#374151'};">${company.name}</span>
                        ${isCurrent ? '<span style="background:#f59e0b; color:white; font-size:10px; padding:2px 6px; border-radius:4px;">ターン中</span>' : ''}
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:bold; color:#059669;">¥${company.cash}</div>
                        <div style="font-size:10px; color:#666;">${company.currentRow || 1}/${gameState.maxRows}行</div>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px; font-size:11px; margin-bottom:6px;">
                    <div><span style="color:#7c3aed;">材:</span>${makeBlocks(company.materials, 'material')}</div>
                    <div><span style="color:#f59e0b;">仕:</span>${makeBlocks(company.wip, 'wip')}</div>
                    <div><span style="color:#22c55e;">製:</span>${makeBlocks(company.products, 'product')}</div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:#666; margin-bottom:4px;">
                    <span>W:${company.workers} 機:${machineDisplay} S:${company.salesmen}</span>
                    <span>製造:${getManufacturingCapacity(company)} 販売:${getSalesCapacity(company)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:10px;">
                    <span>チップ: ${chipDisplay(company.chips)}</span>
                    ${(company.loans > 0 || company.shortLoans > 0) ? `<span style="color:#dc2626;">借:長¥${company.loans || 0}/短¥${company.shortLoans || 0}</span>` : ''}
                </div>
            </div>
        `;
    });

    content += '</div>';

    showModal('全社状況一覧', content);
}

// グローバル公開
if (typeof window !== 'undefined') {
    window.updateDisplay = updateDisplay;
    window.renderCompanyBoard = renderCompanyBoard;
    window.renderMarketsBoard = renderMarketsBoard;
    window.renderFixedCostBreakdown = renderFixedCostBreakdown;
    window.renderOtherCompanies = renderOtherCompanies;
    window.showToast = showToast;
    window.showModal = showModal;
    window.closeModal = closeModal;
    window.showAICompanyModal = showAICompanyModal;
    window.showAllCompaniesModal = showAllCompaniesModal;
}
