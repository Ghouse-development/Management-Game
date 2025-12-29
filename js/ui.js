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

    // 在庫表示
    document.getElementById('materialsDisplay').innerHTML =
        Array(company.materials).fill('<div class="inv-block material"></div>').join('') ||
        '<span style="color:#999;font-size:10px;">0</span>';
    document.getElementById('wipDisplay').innerHTML =
        Array(company.wip).fill('<div class="inv-block wip"></div>').join('') ||
        '<span style="color:#999;font-size:10px;">0</span>';
    document.getElementById('productsDisplay').innerHTML =
        Array(company.products).fill('<div class="inv-block product"></div>').join('') ||
        '<span style="color:#999;font-size:10px;">0</span>';

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

        const volumeText = market.name === '海外' ? '∞' : market.maxStock;
        const selectedClass = isSelected ? 'selected' : '';
        const selectedBadge = isSelected ? '<div style="position:absolute;top:2px;right:2px;background:#8b5cf6;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;z-index:5;">✓</div>' : '';

        html += `
            <div class="market-tile ${marketClass} ${closedClass} ${unavailableClass} ${selectedClass}" ${onClickHandler}>
                ${selectedBadge}
                <div class="market-color-band">
                    <span class="price-badge buy">${market.buyPrice}</span>
                    <span class="price-badge sell">${market.sellPrice}</span>
                </div>
                <div class="market-pocket">
                    <div class="market-name">${market.name}</div>
                    <div class="market-volume">MV:${volumeText}</div>
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
            depreciationCost += m.type === 'large' ? DEPRECIATION.large.period2 : DEPRECIATION.small.period2;
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
        let chipStr = '';
        if (chips.research) chipStr += `青${chips.research}`;
        if (chips.education) chipStr += `黄${chips.education}`;
        if (chips.advertising) chipStr += `赤${chips.advertising}`;
        if (chips.computer) chipStr += `緑${chips.computer}`;
        if (chips.insurance) chipStr += `橙${chips.insurance}`;
        if (!chipStr) chipStr = '-';

        badgesHtml += `
            <div class="ai-badge ${isCurrent ? 'current-turn' : ''}" onclick="showAICompanyModal(${idx + 1})">
                <div class="ai-badge-row1">
                    <span class="ai-badge-name">${company.name}</span>
                    <span class="ai-badge-cash">¥${company.cash}</span>
                </div>
                <div class="ai-badge-row2">
                    <span class="ai-badge-label">材</span><span class="ai-badge-val">${company.materials}</span>
                    <span class="ai-badge-label">仕</span><span class="ai-badge-val">${company.wip}</span>
                    <span class="ai-badge-label">製</span><span class="ai-badge-val">${company.products}</span>
                </div>
                <div class="ai-badge-row3">
                    <span class="ai-badge-info">W${company.workers}機${company.machines.length}S${company.salesmen}</span>
                    <span class="ai-badge-chips">${chipStr}</span>
                    <span class="ai-badge-rownum ${rowWarning ? 'warning' : ''}">${company.currentRow || 1}行</span>
                </div>
            </div>
        `;
    });

    document.getElementById('aiCompaniesBar').innerHTML = badgesHtml;
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
}
